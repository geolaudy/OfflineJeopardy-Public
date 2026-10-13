import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { api, boot, createProfile, hostToken, sampleBoardId, TestClient } from './helpers';

const servers: Awaited<ReturnType<typeof boot>>[] = [];
const clients: TestClient[] = [];
async function start(dir?: string) {
  const s = await boot(dir);
  servers.push(s);
  return s;
}
async function client(s: { url: string }, role: 'host' | 'public' | 'player', token?: string) {
  const c = await TestClient.connect(s, role, token);
  clients.push(c);
  return c;
}
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close().catch(() => {});
});

describe('server basics and host authentication', () => {
  it('serves info, seeds a sample board and protects host APIs', async () => {
    const s = await start();
    const info = await api(s, 'GET', '/api/info');
    expect(info.data.urls.join).toMatch(/\/join$/);
    expect((await api(s, 'GET', '/api/boards')).status).toBe(401);
    const qr = await fetch(s.url + '/api/qr?target=join');
    expect(qr.headers.get('content-type')).toContain('svg');
    const svg = await qr.text();
    expect(svg).toContain('<svg');
    const token = await hostToken(s);
    const boards = await api(s, 'GET', '/api/boards', undefined, token);
    expect(boards.data[0].title).toBe('Starter Trivia Night');
  });

  it('pairs a remote host with the desktop pairing code and rejects wrong codes', async () => {
    const s = await start();
    expect((await api(s, 'POST', '/api/host/login', { code: '000000' === s.pairingCode ? '111111' : '000000' })).status).toBe(401);
    const ok = await api(s, 'POST', '/api/host/login', { code: s.pairingCode });
    expect(ok.status).toBe(200);
    expect((await api(s, 'GET', '/api/host/check', undefined, ok.data.token)).data.host).toBe(true);
    // host reconnects later with the same token — no re-pairing needed
    const c = await client(s, 'host', ok.data.token);
    expect(c.messages[0]).toMatchObject({ t: 'welcome', role: 'host' });
  });

  it('refuses host WebSocket connections without a host session, and players cannot send host actions', async () => {
    const s = await start();
    const bad = await client(s, 'host', 'nope');
    expect(bad.messages[0]).toMatchObject({ t: 'error', message: 'host-auth-required' });
    const alex = await createProfile(s, 'Alex');
    const p = await client(s, 'player', alex.token);
    const r = await p.tryAct({ type: 'startGame' });
    expect(r).toMatchObject({ ok: false, error: 'Not authorized' });
    const pub = await client(s, 'public');
    const r2 = await pub.tryAct({ type: 'adjustScore', competitorId: 'x', delta: 100 });
    expect(r2.ok).toBe(false);
  });
});

describe('profiles and PINs', () => {
  it('creates profiles with hashed PINs, authenticates, rate-limits and locks out', async () => {
    const s = await start();
    const alex = await createProfile(s, 'Alex', '0042');
    const row = s.db.prepare('SELECT pin_hash FROM profiles WHERE id = ?').get(alex.id) as { pin_hash: string };
    expect(row.pin_hash).toMatch(/^scrypt\$/);
    expect(row.pin_hash).not.toContain('0042');
    // leading zeros are valid
    expect((await api(s, 'POST', `/api/profiles/${alex.id}/login`, { pin: '0042' })).status).toBe(200);
    expect((await api(s, 'POST', `/api/profiles/${alex.id}/login`, { pin: '42' })).status).toBe(400);
    // public listing never includes secrets
    const list = await api(s, 'GET', '/api/profiles');
    expect(JSON.stringify(list.data)).not.toMatch(/pin|scrypt/i);
    for (let i = 0; i < 4; i++) expect((await api(s, 'POST', `/api/profiles/${alex.id}/login`, { pin: '9999' })).status).toBe(401);
    const fifth = await api(s, 'POST', `/api/profiles/${alex.id}/login`, { pin: '9999' });
    expect(fifth.data.error).toMatch(/Locked/);
    const locked = await api(s, 'POST', `/api/profiles/${alex.id}/login`, { pin: '0042' });
    expect(locked.status).toBe(429); // even the right PIN is refused during the lockout
    // host-assisted reset clears the lockout and signs out existing sessions
    const host = await hostToken(s);
    expect((await api(s, 'POST', `/api/admin/profiles/${alex.id}/reset-pin`, { pin: '5555' }, host)).status).toBe(200);
    expect((await api(s, 'GET', '/api/me', undefined, alex.token)).status).toBe(401);
    expect((await api(s, 'POST', `/api/profiles/${alex.id}/login`, { pin: '5555' })).status).toBe(200);
  });

  it('changes PINs, persists sessions and prevents editing other profiles', async () => {
    const s = await start();
    const alex = await createProfile(s, 'Alex', '1111');
    const jordan = await createProfile(s, 'Jordan', '2222');
    expect((await api(s, 'POST', '/api/me/pin', { currentPin: '0000', newPin: '3333' }, alex.token)).status).toBe(401);
    expect((await api(s, 'POST', '/api/me/pin', { currentPin: '1111', newPin: '3333' }, alex.token)).status).toBe(200);
    expect((await api(s, 'POST', `/api/profiles/${alex.id}/login`, { pin: '3333' })).status).toBe(200);
    // a profile token only ever edits its own profile
    await api(s, 'PATCH', '/api/me', { name: 'Hacker' }, alex.token);
    const j = await api(s, 'GET', '/api/me', undefined, jordan.token);
    expect(j.data.name).toBe('Jordan');
    // admin endpoints need a host session
    expect((await api(s, 'PATCH', `/api/admin/profiles/${jordan.id}`, { name: 'X' }, alex.token)).status).toBe(401);
    expect((await api(s, 'PATCH', '/api/me', { color: 'red' }, alex.token)).status).toBe(400);
  });

  it('uploads, validates, resizes and serves profile pictures; broadcasts profile changes live', async () => {
    const s = await start();
    const host = await hostToken(s);
    const alex = await createProfile(s, 'Alex');
    const boardId = await sampleBoardId(s, host);
    await api(s, 'POST', '/api/games', { boardId, mode: 'solo' }, host);
    const h = await client(s, 'host', host);
    await h.act({ type: 'addPlayer', profileId: alex.id });
    const pub = await client(s, 'public');
    await pub.waitState((g) => !!g && g.competitors.length === 1);
    expect(pub.state!.profiles[alex.id].name).toBe('Alex');

    const png = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const fd = new FormData();
    fd.append('cropX', '0.1');
    fd.append('cropY', '0');
    fd.append('cropW', '0.5');
    fd.append('cropH', '0.75');
    fd.append('file', new Blob([png], { type: 'image/png' }), 'me.png');
    const up = await fetch(s.url + '/api/me/picture', { method: 'POST', headers: { authorization: `Bearer ${alex.token}` }, body: fd });
    const prof = await up.json();
    expect(up.status).toBe(200);
    expect(prof.pictureUrl).toMatch(/^\/media\/profiles\/.+\.webp$/);
    const img = await fetch(s.url + prof.pictureUrl);
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 512, 512]);

    const bad = new FormData();
    bad.append('file', new Blob([Buffer.from('<script>alert(1)</script>')], { type: 'image/png' }), 'evil.png');
    const badRes = await fetch(s.url + '/api/me/picture', { method: 'POST', headers: { authorization: `Bearer ${alex.token}` }, body: bad });
    expect(badRes.status).toBe(400);

    await api(s, 'PATCH', '/api/me', { name: 'AlexTheWizard', color: '#16a34a' }, alex.token);
    await pub.waitState((g) => g?.profiles[alex.id]?.name === 'AlexTheWizard');
    await h.waitState((g) => g?.profiles[alex.id]?.color === '#16a34a');
    expect(pub.messages.some((m) => m.t === 'profilesChanged')).toBe(true);
    expect((await fetch(s.url + '/media/profiles/..%2F..%2Fofflinejeopardy.db')).status).toBe(404);
  });
});

describe('live game over WebSockets', () => {
  it('host controls the game; public board sees clues but never unrevealed answers; phones buzz; scores sync', async () => {
    const s = await start();
    const host = await hostToken(s);
    const alex = await createProfile(s, 'Alex');
    const sam = await createProfile(s, 'Sam');
    const boardId = await sampleBoardId(s, host);
    await api(s, 'POST', '/api/games', { boardId, mode: 'solo', preset: 'classic' }, host);
    const h = await client(s, 'host', host);
    const pub = await client(s, 'public');
    const pa = await client(s, 'player', alex.token);
    const ps = await client(s, 'player', sam.token);
    // players join from their phones (self-join enabled by default)
    pa.send({ t: 'join' });
    ps.send({ t: 'join' });
    await h.waitState((g) => g?.competitors.length === 2);
    await h.act({ type: 'startGame' });
    await h.act({ type: 'selectClue', clueId: 'hist_1' });
    await pub.waitState((g) => g?.phase === 'clue');
    expect(pub.state!.clue!.question).toContain('Machu Picchu');
    expect(pub.state!.clue!.answer).toBeNull();
    expect(JSON.stringify(pub.messages)).not.toContain('The Inca');
    expect(JSON.stringify(pa.messages)).not.toContain('The Inca');
    expect(h.state!.clue!.answer).toBe('The Inca');

    await h.act({ type: 'unlockBuzzers' });
    await ps.waitState((_g, me) => me?.canBuzz === true);
    expect(pub.state!.timer?.running).toBe(true);
    const r1 = ps.wait((m) => m.t === 'buzzResult');
    ps.send({ t: 'buzz' });
    expect(await r1).toMatchObject({ ok: true, info: 'won' });
    const r2 = pa.wait((m) => m.t === 'buzzResult');
    pa.send({ t: 'buzz' });
    expect(await r2).toMatchObject({ ok: false, info: 'taken' });
    await pub.waitState((g) => g?.buzzer.winner?.profileId === sam.id);

    await h.act({ type: 'judge', result: 'correct' });
    await pub.waitState((g) => g?.clue?.answerRevealed === true);
    expect(pub.state!.clue!.answer).toBe('The Inca');
    const samC = pub.state!.competitors.find((c) => c.profileId === sam.id)!;
    expect(samC.score).toBe(200);
    await h.act({ type: 'closeClue' });
    await h.act({ type: 'adjustScore', competitorId: samC.id, delta: -50, note: 'penalty' });
    await pub.waitState((g) => g?.competitors.find((c) => c.id === samC.id)?.score === 150);
    await h.act({ type: 'undo' });
    await pub.waitState((g) => g?.competitors.find((c) => c.id === samC.id)?.score === 200);

    // host disconnects: game continues, host reconnects with same token and gets full state
    h.close();
    const h2 = await client(s, 'host', host);
    await h2.waitState((g) => g?.phase === 'board' && g.competitors.some((c) => c.score === 200));
    expect(h2.state!.undoLabel).toBeTruthy();
  });

  it('simulated Joy-Cons: detection, assignment by button press, debounced buzzing, disconnect handling', async () => {
    const s = await start();
    const host = await hostToken(s);
    const alex = await createProfile(s, 'Alex');
    const jordan = await createProfile(s, 'Jordan');
    const boardId = await sampleBoardId(s, host);
    await api(s, 'POST', '/api/games', { boardId, mode: 'solo' }, host);
    const h = await client(s, 'host', host);
    const bridge = await client(s, 'public', host); // Electron TV window acting as input bridge
    await h.act({ type: 'addPlayer', profileId: alex.id });
    await h.act({ type: 'addPlayer', profileId: jordan.id });
    bridge.send({ t: 'controller', ev: { type: 'connected', controllerId: 'joycon:L:aa', kind: 'joycon', label: 'Joy-Con (L)', side: 'L' } });
    bridge.send({ t: 'controller', ev: { type: 'connected', controllerId: 'joycon:R:bb', kind: 'joycon', label: 'Joy-Con (R)', side: 'R' } });
    await h.wait((m) => m.t === 'controllers' && m.list.filter((d) => d.connected).length === 2);

    // Assign: host picks a player, player presses a button on their Joy-Con
    h.send({ t: 'assignListen', target: { kind: 'profile', profileId: alex.id } });
    await h.wait((m) => m.t === 'controllers' && !!m.listening);
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'joycon:L:aa', button: 'SL', pressed: true } });
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'joycon:L:aa', button: 'SL', pressed: false } });
    await h.waitState((g) => !!g?.bindings.find((b) => b.controllerId === 'joycon:L:aa'));
    h.send({ t: 'assignListen', target: { kind: 'profile', profileId: jordan.id } });
    await h.wait((m) => m.t === 'controllers' && !!m.listening);
    await new Promise((r) => setTimeout(r, 150));
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'joycon:R:bb', button: 'A', pressed: true } });
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'joycon:R:bb', button: 'A', pressed: false } });
    await h.waitState((g) => g?.bindings.length === 2);

    await h.act({ type: 'startGame' });
    await h.act({ type: 'selectClue', clueId: 'sci_1' });
    await h.act({ type: 'unlockBuzzers' });
    await new Promise((r) => setTimeout(r, 150));
    // HOME never buzzes; held buttons don't repeat
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'joycon:R:bb', button: 'HOME', pressed: true } });
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'joycon:R:bb', button: 'A', pressed: true } });
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'joycon:L:aa', button: 'UP', pressed: true } });
    const g = await h.waitState((x) => !!x?.buzzer.winner);
    expect(g!.buzzer.winner).toMatchObject({ profileId: jordan.id, controllerId: 'joycon:R:bb', sourceKind: 'joycon' });
    expect(g!.events!.filter((e) => e.type === 'buzz' && e.result === 'won')).toHaveLength(1);

    // bridge disconnects -> devices marked disconnected; phones still work for others
    bridge.close();
    await h.wait((m) => m.t === 'controllers' && m.list.every((d) => !d.connected));
  });

  it('untrusted public clients cannot inject controller input', async () => {
    const s = await start();
    const pub = await client(s, 'public');
    pub.send({ t: 'controller', ev: { type: 'connected', controllerId: 'evil', kind: 'joycon', label: 'x' } });
    await new Promise((r) => setTimeout(r, 100));
    expect(s.controllers.list()).toHaveLength(0);
  });
});

describe('persistence, recovery, statistics and history', () => {
  it('survives an application restart with scores, used clues and teams intact (timers paused, buzzers locked)', async () => {
    const s1 = await start();
    const host = await hostToken(s1);
    const alex = await createProfile(s1, 'Alex');
    const jordan = await createProfile(s1, 'Jordan');
    const boardId = await sampleBoardId(s1, host);
    await api(s1, 'POST', '/api/games', { boardId, mode: 'team' }, host);
    const team = await api(s1, 'POST', '/api/teams', { name: 'Wizards', color: '#2563eb', buzzerMode: 'individual', memberIds: [alex.id, jordan.id] }, host);
    const h = await client(s1, 'host', host);
    await h.act({ type: 'addTeam', teamId: team.data.id, name: 'Wizards', color: '#2563eb', buzzerMode: 'individual', memberIds: [alex.id, jordan.id] });
    await h.act({ type: 'startGame' });
    await h.act({ type: 'selectClue', clueId: 'geo_3' });
    await h.act({ type: 'unlockBuzzers' });
    const pa = await client(s1, 'player', alex.token);
    pa.send({ t: 'buzz' });
    await h.waitState((g) => !!g?.buzzer.winner);
    await h.act({ type: 'judge', result: 'correct' });
    await h.act({ type: 'closeClue' });
    await h.act({ type: 'selectClue', clueId: 'geo_4' });
    await h.act({ type: 'unlockBuzzers' });
    const dir = s1.dataDir;
    for (const c of clients.splice(0)) c.close();
    await s1.close();
    servers.splice(servers.indexOf(s1), 1);

    const s2 = await start(dir);
    const h2 = await client(s2, 'host', host); // host token survives restart
    const g = (await h2.waitState((x) => !!x))!;
    expect(g.phase).toBe('clue');
    expect(g.competitors[0].score).toBe(600);
    expect(g.rounds[0].categories[2].clues[2].used).toBe(true);
    expect(g.competitors[0].memberIds).toEqual([alex.id, jordan.id]);
    expect(g.buzzer.status).toBe('locked');
    expect(g.timer?.running ?? false).toBe(false);
  });

  it('completed team game: team score once, individual contributions, separate solo/team stats, history snapshots', async () => {
    const s = await start();
    const host = await hostToken(s);
    const [alex, jordan, taylor, sam] = await Promise.all(['Alex', 'Jordan', 'Taylor', 'Sam'].map((n) => createProfile(s, n)));
    const boardId = await sampleBoardId(s, host);
    await api(s, 'POST', '/api/games', { boardId, mode: 'team' }, host);
    const wiz = (await api(s, 'POST', '/api/teams', { name: 'Wizards', color: '#2563eb', buzzerMode: 'individual', memberIds: [alex.id, jordan.id] }, host)).data;
    const dra = (await api(s, 'POST', '/api/teams', { name: 'Dragons', color: '#dc2626', buzzerMode: 'shared', memberIds: [taylor.id, sam.id] }, host)).data;
    const h = await client(s, 'host', host);
    await h.act({ type: 'addTeam', teamId: wiz.id, name: wiz.name, color: wiz.color, buzzerMode: 'individual', memberIds: wiz.memberIds });
    await h.act({ type: 'addTeam', teamId: dra.id, name: dra.name, color: dra.color, buzzerMode: 'shared', memberIds: dra.memberIds });
    const draC = h.state!.competitors.find((c) => c.teamId === dra.id)!;
    const wizC = h.state!.competitors.find((c) => c.teamId === wiz.id)!;
    // Dragons' shared buzzer is a keyboard key on the game PC
    const bridge = await client(s, 'public', host);
    h.send({ t: 'assignListen', target: { kind: 'competitor', competitorId: draC.id } });
    await h.wait((m) => m.t === 'controllers' && !!m.listening);
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'kb:KeyP', kind: 'keyboard', label: 'Key P', button: 'KeyP', pressed: true } });
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'kb:KeyP', button: 'KeyP', pressed: false } });
    await h.waitState((g) => g?.bindings.length === 1);
    await h.act({ type: 'startGame' });

    const pa = await client(s, 'player', alex.token);
    // Clue 1: Alex (phone, individual team) answers 600 correctly
    await h.act({ type: 'selectClue', clueId: 'tech_3' });
    await h.act({ type: 'unlockBuzzers' });
    pa.send({ t: 'buzz' });
    await h.waitState((g) => g?.buzzer.winner?.profileId === alex.id);
    await h.act({ type: 'judge', result: 'correct' });
    await h.act({ type: 'closeClue' });
    // Clue 2: Dragons shared buzzer, host attributes to Taylor, correct 400
    await h.act({ type: 'selectClue', clueId: 'food_2' });
    await h.act({ type: 'unlockBuzzers' });
    await new Promise((r) => setTimeout(r, 150));
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'kb:KeyP', button: 'KeyP', pressed: true } });
    await h.waitState((g) => g?.buzzer.winner?.competitorId === draC.id);
    await h.act({ type: 'judge', result: 'correct', profileId: taylor.id });
    await h.act({ type: 'closeClue' });
    // Clue 3: Dragons again, unknown member, incorrect 200
    await h.act({ type: 'selectClue', clueId: 'food_1' });
    await h.act({ type: 'unlockBuzzers' });
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'kb:KeyP', button: 'KeyP', pressed: false } });
    await new Promise((r) => setTimeout(r, 150));
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'kb:KeyP', button: 'KeyP', pressed: true } });
    await h.waitState((g) => g?.buzzer.winner?.competitorId === draC.id);
    await h.act({ type: 'judge', result: 'incorrect', profileId: null });
    await h.act({ type: 'endGame' });
    const final = h.state!;
    expect(final.competitors.find((c) => c.id === wizC.id)!.score).toBe(600);
    expect(final.competitors.find((c) => c.id === draC.id)!.score).toBe(200);
    expect(final.results![0]).toMatchObject({ competitorId: wizC.id, isWinner: true });

    // Edit the original board after the game: history must not change
    const board = (await api(s, 'GET', `/api/boards/${boardId}`, undefined, host)).data;
    board.content.rounds[0].categories[5].clues[2].question = 'EDITED';
    await api(s, 'PUT', `/api/boards/${boardId}`, { ...board }, host);

    const alexStats = (await api(s, 'GET', '/api/me/stats', undefined, alex.token)).data;
    expect(alexStats.team.games).toMatchObject({ played: 1, wins: 1 });
    expect(alexStats.team.contribution).toMatchObject({ correct: 1, incorrect: 0, pointsEarned: 600, net: 600 });
    expect(alexStats.team.buzzer.successful).toBe(1);
    expect(alexStats.solo.games.played).toBe(0); // solo and team kept separate
    expect(alexStats.team.categories[0]).toMatchObject({ category: 'Technology', correct: 1 });
    const jordanStats = (await api(s, 'GET', `/api/stats/profiles/${jordan.id}`, undefined, host)).data.stats;
    expect(jordanStats.team.contribution).toMatchObject({ correct: 0, incorrect: 0, net: 0 });
    expect(jordanStats.team.games.wins).toBe(1);
    const taylorStats = (await api(s, 'GET', `/api/stats/profiles/${taylor.id}`, undefined, host)).data.stats;
    expect(taylorStats.team.contribution).toMatchObject({ correct: 1, incorrect: 0, net: 400 });
    const samStats = (await api(s, 'GET', `/api/stats/profiles/${sam.id}`, undefined, host)).data.stats;
    expect(samStats.team.contribution).toMatchObject({ correct: 0, incorrect: 0 }); // unknown attribution stays team-only
    const teamStats = (await api(s, 'GET', `/api/stats/teams/${dra.id}`, undefined, host)).data.stats;
    expect(teamStats.answers).toMatchObject({ correct: 1, incorrect: 1, pointsEarned: 400, pointsLost: 200 });
    expect(teamStats.unattributedAnswers).toBe(1);
    expect(teamStats.games).toMatchObject({ played: 1, wins: 0 });

    const hist = (await api(s, 'GET', '/api/me/history', undefined, alex.token)).data;
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ competitorName: 'Wizards', finalScore: 600, isWinner: true, correct: 1 });
    const detail = (await api(s, 'GET', `/api/history/${hist[0].id}`, undefined, alex.token)).data;
    expect(detail.clues.find((c: any) => c.clueId === 'tech_3').question).not.toBe('EDITED');
    expect(detail.competitors.find((c: any) => c.id === draC.id).members.map((m: any) => m.profileId).sort()).toEqual([taylor.id, sam.id].sort());
    // non-participants cannot read someone else's game
    const outsider = await createProfile(s, 'Outsider');
    expect((await api(s, 'GET', `/api/history/${hist[0].id}`, undefined, outsider.token)).status).toBe(403);

    // Renaming a team / moving a player later doesn't rewrite history
    await api(s, 'PUT', `/api/teams/${wiz.id}`, { name: 'Renamed', color: '#2563eb', buzzerMode: 'individual', memberIds: [jordan.id] }, host);
    const detail2 = (await api(s, 'GET', `/api/history/${hist[0].id}`, undefined, host)).data;
    expect(detail2.competitors.find((c: any) => c.id === wizC.id)).toMatchObject({ name: 'Wizards' });
    expect(detail2.competitors.find((c: any) => c.id === wizC.id).members).toHaveLength(2);
  });
});

describe('boards: import, export, versions', () => {
  it('round-trips CSV and JSON, reports errors and keeps version history', async () => {
    const s = await start();
    const host = await hostToken(s);
    const boardId = await sampleBoardId(s, host);
    const csv = await fetch(`${s.url}/api/boards/${boardId}/export?format=csv`, { headers: { authorization: `Bearer ${host}` } }).then((r) => r.text());
    expect(csv.split('\n')[0].trim()).toBe('round,category,value,question,answer,daily_wager,notes');
    const preview = await api(s, 'POST', '/api/boards/import', { format: 'csv', text: csv, preview: true }, host);
    expect(preview.data.summary).toEqual({ rounds: 3, categories: 13, clues: 61 });
    expect(preview.data.saved).toBeNull();
    const imp = await api(s, 'POST', '/api/boards/import', { format: 'csv', text: csv, title: 'Copy via CSV' }, host);
    expect(imp.data.saved.id).toBeTruthy();
    const copy = (await api(s, 'GET', `/api/boards/${imp.data.saved.id}`, undefined, host)).data;
    expect(copy.content.rounds[0].categories[1].clues[3].dailyWager).toBe(true);
    expect(copy.content.rounds[2].kind).toBe('final');

    const json = await fetch(`${s.url}/api/boards/${boardId}/export?format=json`, { headers: { authorization: `Bearer ${host}` } }).then((r) => r.text());
    const j = await api(s, 'POST', '/api/boards/import', { format: 'json', text: json }, host);
    expect(j.data.warnings.join(' ')).toMatch(/already exists/);
    const bad = await api(s, 'POST', '/api/boards/import', { format: 'csv', text: 'foo,bar\n1,2' }, host);
    expect(bad.data.errors[0]).toMatch(/Missing required column/);
    const badVal = await api(s, 'POST', '/api/boards/import', { format: 'csv', text: 'category,value,question,answer\nA,abc,q,a' }, host);
    expect(badVal.data.errors[0]).toMatch(/Line 2/);

    const b = (await api(s, 'GET', `/api/boards/${boardId}`, undefined, host)).data;
    await api(s, 'PUT', `/api/boards/${boardId}`, { ...b, title: 'Renamed', version: true }, host);
    const versions = (await api(s, 'GET', `/api/boards/${boardId}/versions`, undefined, host)).data;
    expect(versions.length).toBe(2);
    await api(s, 'POST', `/api/boards/${boardId}/versions/${versions[1].id}/restore`, {}, host);
    expect((await api(s, 'GET', `/api/boards/${boardId}`, undefined, host)).data.title).toBe('Starter Trivia Night');
    const dup = await api(s, 'POST', `/api/boards/${boardId}/duplicate`, {}, host);
    expect(dup.data.title).toMatch(/copy/);
    expect(dup.data.content.rounds[0].categories[0].clues[0].id).not.toBe('hist_1');
  });

  it('backs up the database', async () => {
    const s = await start();
    const host = await hostToken(s);
    const res = await fetch(`${s.url}/api/admin/backup`, { headers: { authorization: `Bearer ${host}` } });
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 15).toString()).toBe('SQLite format 3');
    const diag = await api(s, 'GET', '/api/admin/diagnostics', undefined, host);
    expect(diag.data.integrity).toBe('ok');
  });
});

describe('user feedback round 1 (server level)', () => {
  it('early buzzes from phone, Joy-Con and keyboard follow the same rules; rule changes apply mid-game; lockout expiry refreshes phones', async () => {
    const s = await start();
    const host = await hostToken(s);
    const [alex, jordan, sam] = await Promise.all(['Alex', 'Jordan', 'Sam'].map((n) => createProfile(s, n)));
    const boardId = await sampleBoardId(s, host);
    await api(s, 'POST', '/api/games', { boardId, mode: 'solo' }, host);
    const h = await client(s, 'host', host);
    for (const p of [alex, jordan, sam]) await h.act({ type: 'addPlayer', profileId: p.id });
    // Jordan uses a (simulated) Joy-Con, Sam a keyboard key on the game PC, Alex a phone.
    const bridge = await client(s, 'public', host);
    const assign = async (profileId: string, ev: Record<string, unknown>) => {
      h.send({ t: 'assignListen', target: { kind: 'profile', profileId } });
      await h.wait((m) => m.t === 'controllers' && !!m.listening);
      bridge.send({ t: 'controller', ev: { type: 'button', pressed: true, ...ev } });
      bridge.send({ t: 'controller', ev: { type: 'button', pressed: false, ...ev } });
      await h.waitState((g) => !!g?.bindings.some((b) => b.target.kind === 'profile' && b.target.profileId === profileId));
    };
    bridge.send({ t: 'controller', ev: { type: 'connected', controllerId: 'joycon:aa', kind: 'joycon', label: 'Joy-Con (L)', side: 'L' } });
    await assign(jordan.id, { controllerId: 'joycon:aa', kind: 'joycon', button: 'L' });
    await assign(sam.id, { controllerId: 'kb:KeyS', kind: 'keyboard', label: 'Key S', button: 'KeyS' });
    await h.act({ type: 'updateRules', rules: { ...h.state!.rules, earlyBuzzPenalty: 'points', earlyBuzzPoints: 100, earlyBuzzLockoutMs: 400, categoryIntro: false } });
    await h.act({ type: 'startGame' });
    const pa = await client(s, 'player', alex.token);
    const cidOf = (pid: string) => h.state!.competitors.find((c) => c.profileId === pid)!.id;

    await h.act({ type: 'selectClue', clueId: 'hist_1' });
    await pa.waitState((g, me) => g?.phase === 'clue' && me?.canPress === true && me?.canBuzz === false);
    await new Promise((r) => setTimeout(r, 200)); // past the per-device debounce of the assignment presses
    pa.send({ t: 'buzz' });
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'joycon:aa', button: 'L', pressed: true } });
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'kb:KeyS', button: 'KeyS', pressed: true } });
    const g = await h.waitState((x) => (x?.buzzer.early.length ?? 0) === 3);
    expect(new Set(g!.buzzer.early.map((e) => e.competitorId))).toEqual(new Set([cidOf(alex.id), cidOf(jordan.id), cidOf(sam.id)]));
    for (const c of g!.competitors) expect(c.score).toBe(-100);
    expect(g!.events!.filter((e) => e.result === 'early').map((e) => e.sourceKind).sort()).toEqual(['joycon', 'keyboard', 'phone']);
    // The public board learns who buzzed early (for its subtle marker) but never the lockout table.
    const pub = await client(s, 'public');
    await pub.waitState((x) => (x?.buzzer.early.length ?? 0) === 3);
    expect(JSON.stringify(pub.state)).not.toContain('lockouts');
    // The phone is locked out, then re-enabled by the server when the lockout ends (no other change needed).
    await pa.waitState((_g, me) => me?.buzzReason === 'locked-out' && me?.lockedUntil > 0);
    await pa.waitState((_g, me) => me?.buzzReason === 'locked' && me?.lockedUntil === null, 2000);

    // Host switches to "no penalty" mid-game: the next early buzz costs nothing, earlier penalties stay.
    await h.act({ type: 'updateRules', rules: { ...h.state!.rules, earlyBuzzPenalty: 'none' } });
    await h.act({ type: 'closeClue' });
    await h.act({ type: 'selectClue', clueId: 'hist_2' });
    pa.send({ t: 'buzz' });
    await h.waitState((x) => (x?.buzzer.early.length ?? 0) === 1);
    expect(h.state!.competitors.find((c) => c.id === cidOf(alex.id))!.score).toBe(-100);
    // Unanswered flow: open, host ends answering, reveal, return.
    await h.act({ type: 'unlockBuzzers' });
    await h.act({ type: 'endAnswering', clueId: 'hist_2' });
    expect(h.state!.clue?.answeringEnded).toBe(true);
    await h.act({ type: 'revealAnswer', clueId: 'hist_2' });
    await pub.waitState((x) => !!x?.clue?.answer);
    await h.act({ type: 'closeClue', clueId: 'hist_2' });
    const again = await h.tryAct({ type: 'closeClue', clueId: 'hist_2' }); // double tap is harmless
    expect(again.ok).toBe(true);
    expect(h.state!.phase).toBe('board');
    // Refund one of the earlier penalties (audited).
    const pen = h.state!.events!.find((e) => e.result === 'early' && e.scoreDelta === -100 && e.profileId === sam.id)!;
    await h.act({ type: 'refundPenalty', eventId: pen.id });
    await h.waitState((x) => x?.competitors.find((c) => c.profileId === sam.id)?.score === 0);
  });

  it('leaderboard keeps solo/team/contribution separate; other players see public stats only; private profiles stay private', async () => {
    const s = await start();
    const host = await hostToken(s);
    const [alex, jordan, quiet] = await Promise.all(['Alex', 'Jordan', 'Quiet'].map((n) => createProfile(s, n)));
    await api(s, 'PATCH', '/api/me', { statsPrivate: true }, quiet.token);
    const boardId = await sampleBoardId(s, host);
    await api(s, 'POST', '/api/games', { boardId, mode: 'solo' }, host);
    const h = await client(s, 'host', host);
    await h.act({ type: 'addPlayer', profileId: alex.id });
    await h.act({ type: 'addPlayer', profileId: jordan.id });
    await h.act({ type: 'startGame' });
    const pa = await client(s, 'player', alex.token);
    await h.act({ type: 'selectClue', clueId: 'hist_1' });
    await h.act({ type: 'unlockBuzzers' });
    pa.send({ t: 'buzz' });
    await h.waitState((g) => g?.buzzer.winner?.profileId === alex.id);
    await h.act({ type: 'judge', result: 'correct' });
    await h.act({ type: 'endGame' });

    expect((await api(s, 'GET', '/api/stats/leaderboard')).status).toBe(401);
    const lb = (await api(s, 'GET', '/api/stats/leaderboard', undefined, jordan.token)).data as any[];
    expect(lb.map((r) => r.name).sort()).toEqual(['Alex', 'Jordan']); // private profile excluded
    const a = lb.find((r) => r.id === alex.id);
    expect(a.solo).toMatchObject({ games: 1, wins: 1, winRate: 1, correct: 1, highestScore: 200 });
    expect(a.team).toMatchObject({ games: 0, wins: 0 });
    expect(a.contribution).toMatchObject({ games: 0, correct: 0, net: 0 });

    // Jordan views Alex's public page
    const page = (await api(s, 'GET', `/api/stats/profiles/${alex.id}`, undefined, jordan.token)).data;
    expect(page.own).toBe(false);
    expect(page.profile.name).toBe('Alex');
    expect(page.stats.solo.games.wins).toBe(1);
    expect(page.history[0]).toMatchObject({ finalScore: 200, isWinner: true });
    const json = JSON.stringify(page);
    for (const secret of ['pin', 'token', 'preferred', 'statsPrivate', 'failed_attempts', 'locked_until']) expect(json).not.toContain(secret);
    expect((await api(s, 'GET', `/api/stats/profiles/${quiet.id}`, undefined, jordan.token)).status).toBe(403);
    expect((await api(s, 'GET', `/api/stats/profiles/${quiet.id}`, undefined, quiet.token)).status).toBe(200);
    expect((await api(s, 'GET', `/api/stats/profiles/${alex.id}`)).status).toBe(403); // must be signed in
  });
});
