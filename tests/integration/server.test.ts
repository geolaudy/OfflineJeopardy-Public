import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
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
    // Pairing codes belong to a lobby: none exists yet.
    expect(s.pairingCode).toBeNull();
    expect((await api(s, 'POST', '/api/host/login', { code: '123456' })).status).toBe(409);
    await api(s, 'POST', '/api/lobby', { name: 'Test night' }, await hostToken(s));
    expect(s.pairingCode).toMatch(/^\d{6}$/);
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
    const res = await fetch(`${s.url}/api/admin/backup?media=0`, { headers: { authorization: `Bearer ${host}` } });
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 15).toString()).toBe('SQLite format 3');
    const diag = await api(s, 'GET', '/api/admin/diagnostics', undefined, host);
    expect(diag.data.integrity).toBe('ok');
  });
});

describe('lobby session and public presentation (R2-1/2/7/8, R2-A)', () => {
  it('lobby-scoped pairing; the TV only ever receives public presentation data; phones get none', async () => {
    const s = await start();
    const host = await hostToken(s);
    const [alex, quiet] = await Promise.all([createProfile(s, 'Alex'), createProfile(s, 'Quiet')]);
    await api(s, 'PATCH', '/api/me', { statsPrivate: true }, quiet.token);
    const created = (await api(s, 'POST', '/api/lobby', { name: 'Friday quiz' }, host)).data;
    const oldCode = created.pairingCode;
    const ipad = (await api(s, 'POST', '/api/host/login', { code: oldCode, label: 'iPad' })).data.token as string;
    expect(ipad).toBeTruthy();

    const tv = await client(s, 'public');
    const phone = await client(s, 'player', alex.token);
    const h = await client(s, 'host', ipad);
    await tv.wait((m) => m.t === 'presentation' && !!(m as any).lobby?.hostConnected);
    const last = () => [...tv.messages].reverse().find((m) => m.t === 'presentation') as any;
    expect(last().lobby).toMatchObject({ open: true, name: 'Friday quiz' });
    expect(last().p.page).toBe('lobby');

    // Board preview on the TV: category names only — never clue text or answers.
    const boardId = await sampleBoardId(s, host);
    h.send({ t: 'present', req: { page: 'board', boardId } });
    await tv.wait((m) => m.t === 'presentation' && (m as any).p.page === 'board');
    const bjson = JSON.stringify(last().p);
    expect(last().p.board.rounds[0].categories).toContain('History');
    for (const secret of ['Machu Picchu', 'The Inca', 'question', 'answer', 'dailyWager']) expect(bjson).not.toContain(secret);

    // Player pages respect privacy.
    h.send({ t: 'present', req: { page: 'player', profileId: quiet.id } });
    await tv.wait((m) => m.t === 'presentation' && (m as any).p.page === 'player');
    expect(last().p.player).toMatchObject({ private: true, profile: { name: 'Quiet' } });
    expect(last().p.player.stats).toBeUndefined();
    h.send({ t: 'present', req: { page: 'leaderboard', view: 'solo', metric: 'wins' } });
    await tv.wait((m) => m.t === 'presentation' && (m as any).p.page === 'leaderboard');
    expect(JSON.stringify(last().p)).not.toContain('Quiet');

    // Players (and the public TV itself) cannot drive the presentation.
    phone.send({ t: 'present', req: { page: 'teams' } });
    tv.send({ t: 'present', req: { page: 'teams' } });
    await new Promise((r) => setTimeout(r, 200));
    expect(last().p.page).toBe('leaderboard');
    expect(phone.messages.some((m) => m.t === 'presentation')).toBe(false);

    // Rules summary + buzzer overview come from the current game (no device ids).
    await api(s, 'POST', '/api/games', { boardId, mode: 'solo' }, host);
    await h.act({ type: 'addPlayer', profileId: alex.id });
    h.send({ t: 'present', req: { page: 'buzzers' } });
    await tv.wait((m) => m.t === 'presentation' && (m as any).p.page === 'buzzers');
    expect(last().p.buzzers.rows).toEqual([expect.objectContaining({ name: 'Alex', device: 'Phone' })]);
    expect(JSON.stringify(last().p)).not.toContain('phone:');
    h.send({ t: 'present', req: { page: 'rules' } });
    await tv.wait((m) => m.t === 'presentation' && (m as any).p.page === 'rules');
    expect(last().p.rules.lines.map((l: { label: string }) => l.label)).toContain('Early buzzing');

    // Player limit is enforced.
    await h.act({ type: 'updateRules', rules: { ...h.state!.rules, maxPlayers: 1 } });
    const pq = await client(s, 'player', quiet.token);
    pq.send({ t: 'join' });
    expect(((await pq.wait((m) => m.t === 'result')) as any).error).toMatch(/full/);

    // Closing the lobby invalidates its pairing code; the paired iPad session keeps working.
    await api(s, 'DELETE', '/api/lobby', undefined, host);
    expect((await api(s, 'POST', '/api/host/login', { code: oldCode })).status).toBe(409);
    expect((await api(s, 'GET', '/api/host/check', undefined, ipad)).data.host).toBe(true);
    await api(s, 'POST', '/api/lobby', {}, host);
    expect((await api(s, 'POST', '/api/host/login', { code: oldCode === s.pairingCode ? '999999' : oldCode })).status).toBe(401);
  });
});

describe('room codes (P17)', () => {
  it('phones never receive the code; wrong codes are rejected and rate-limited; the host can make a new code', async () => {
    const s = await start();
    const host = await hostToken(s);
    const [alex, eve] = await Promise.all([createProfile(s, 'Alex'), createProfile(s, 'Eve')]);
    const boardId = await sampleBoardId(s, host);
    await api(s, 'POST', '/api/games', { boardId, mode: 'solo' }, host);
    const h = await client(s, 'host', host);
    await h.act({ type: 'updateRules', rules: { ...h.state!.rules, requireRoomCode: true } });
    const code = h.state!.roomCode!;
    expect(code).toMatch(/^[A-Z]{4}$/);
    const tv = await client(s, 'public');
    await tv.waitState((g) => g?.roomCode === code);
    const pe = await client(s, 'player', eve.token);
    await pe.waitState((g) => !!g?.rules.requireRoomCode);
    expect(pe.state!.roomCode).toBeNull();
    expect(JSON.stringify(pe.messages)).not.toContain(code);
    // Wrong codes: rejected, then rate-limited even for the right code.
    for (let i = 0; i < 5; i++) {
      pe.send({ t: 'join', code: 'ZZZZ' === code ? 'YYYY' : 'ZZZZ' });
      const r = await pe.wait((m) => m.t === 'result');
      expect((r as { error?: string }).error).toMatch(/room code is not right/);
    }
    pe.send({ t: 'join', code });
    expect(((await pe.wait((m) => m.t === 'result')) as { error?: string }).error).toMatch(/Too many/);
    // Alex (separate connection) joins with the right code.
    const pa = await client(s, 'player', alex.token);
    pa.send({ t: 'join', code: code.toLowerCase() });
    await h.waitState((g) => !!g?.competitors.some((c) => c.profileId === alex.id));
    await h.act({ type: 'newRoomCode' });
    expect(h.state!.roomCode).not.toBe(code);
    expect((await h.tryAct({ type: 'setRoomCode', code: 'ABCD' })).ok).toBe(false); // not a host action
  });
});

describe('computer opponents and practice games (O3)', () => {
  it('a practice game vs a computer opponent is kept in history but not counted in statistics', async () => {
    const s = await start();
    const host = await hostToken(s);
    const alex = await createProfile(s, 'Alex');
    const boardId = await sampleBoardId(s, host);
    s.games.bots.speed = 0.02; // fast-forward the computer players
    s.games.bots.random = () => 0; // always knows, fastest
    await api(s, 'POST', '/api/games', { boardId, mode: 'solo', practice: true }, host);
    const h = await client(s, 'host', host);
    await h.act({ type: 'addPlayer', profileId: alex.id });
    await h.act({ type: 'addBot', name: 'Robo Rita', level: 'expert' });
    expect(h.state!.practice).toBe(true);
    await h.act({ type: 'updateRules', rules: { ...h.state!.rules, categoryIntro: false } });
    await h.act({ type: 'startGame' });
    const botId = h.state!.competitors.find((c) => c.bot)!.id;
    // Practice auto-opens the buzzers; the bot buzzes and answers by itself.
    await h.act({ type: 'selectClue', clueId: 'hist_1' });
    await h.waitState((g) => (g?.competitors.find((c) => c.id === botId)?.score ?? 0) === 200, 5000);
    // The human (host on the same device) buzzes for themselves on the next clue.
    s.games.bots.random = () => 0.99; // the bot doesn't know this one
    await h.act({ type: 'closeClue' });
    await h.act({ type: 'selectClue', clueId: 'hist_2' });
    await h.waitState((g) => g?.buzzer.status === 'open', 5000);
    const alexC = h.state!.competitors.find((c) => c.profileId === alex.id)!;
    await h.act({ type: 'hostBuzz', competitorId: alexC.id });
    expect(h.state!.buzzer.winner).toMatchObject({ competitorId: alexC.id, sourceKind: 'host' });
    await h.act({ type: 'judge', result: 'correct' });
    await h.act({ type: 'endGame' });

    const hist = (await api(s, 'GET', '/api/me/history', undefined, alex.token)).data;
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ practice: true, finalScore: 400 });
    const detail = (await api(s, 'GET', `/api/history/${hist[0].id}`, undefined, alex.token)).data;
    expect(detail.competitors.map((c: { name: string }) => c.name).sort()).toEqual(['Alex', 'Robo Rita (computer)']);
    const st = (await api(s, 'GET', '/api/me/stats', undefined, alex.token)).data;
    expect(st.combined.gamesPlayed).toBe(0); // practice is not counted
    const lb = (await api(s, 'GET', '/api/stats/leaderboard', undefined, alex.token)).data;
    expect(lb.find((r: { id: string }) => r.id === alex.id).solo.games).toBe(0);
  });
});

describe('custom TV themes (O5)', () => {
  it('creates, validates, selects, exports/imports (with images) and deletes themes; DB migrates additively', async () => {
    const s = await start();
    const host = await hostToken(s);
    const { newThemeData } = await import('../../src/shared/themes');
    const base = { ...newThemeData('classic', 'Party'), colors: { ...newThemeData().colors, tile: '#7c3aed', value: '#fde047' }, valuePrefix: '€', displayFont: 'rounded' };
    expect((await api(s, 'POST', '/api/themes', base)).status).toBe(401);
    // Only images stored by this server may be referenced (no external URLs).
    expect((await api(s, 'POST', '/api/themes', { ...base, backgroundImage: 'http://evil.example/x.png' }, host)).status).toBe(400);
    expect((await api(s, 'POST', '/api/themes', { ...base, colors: { ...base.colors, tile: 'red' } }, host)).status).toBe(400);

    const png = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#ff00ff' } }).png().toBuffer();
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'logo.png');
    const logo = await (await fetch(s.url + '/api/media', { method: 'POST', headers: { authorization: `Bearer ${host}` }, body: fd })).json();
    const t = (await api(s, 'POST', '/api/themes', { ...base, logo: logo.url }, host)).data;
    expect(t).toMatchObject({ name: 'Party', base: 'classic', logo: logo.url });

    // Select it for the TV: the public settings carry the resolved theme (base preset + overrides).
    const pub0 = (await api(s, 'GET', '/api/settings/public')).data;
    expect(pub0).toMatchObject({ theme: 'classic', custom: null });
    await api(s, 'PUT', '/api/settings', { boardTheme: `custom:${t.id}` }, host);
    const pub = (await api(s, 'GET', '/api/settings/public')).data;
    expect(pub.theme).toBe('classic');
    expect(pub.custom).toMatchObject({ id: t.id, valuePrefix: '€', colors: { tile: '#7c3aed' } });

    // Export embeds the logo; importing re-validates it and stores a fresh copy.
    const file = (await api(s, 'GET', `/api/themes/${t.id}/export`, undefined, host)).data;
    expect(file.format).toBe('offline-jeopardy-theme');
    expect(file.images[logo.url].base64.length).toBeGreaterThan(50);
    const imp = (await api(s, 'POST', '/api/themes/import', file, host)).data;
    expect(imp.theme.logo).toMatch(/^\/media\/clues\//);
    expect(imp.theme.logo).not.toBe(logo.url);
    expect(imp.warnings).toEqual([]);
    const bad = (await api(s, 'POST', '/api/themes/import', { ...file, images: { [logo.url]: { mime: 'image/png', base64: Buffer.from('<svg onload=alert(1)>').toString('base64') } } }, host)).data;
    expect(bad.theme.logo).toBeNull();
    expect(bad.warnings.join(' ')).toMatch(/rejected/);
    expect((await api(s, 'GET', '/api/themes', undefined, host)).data).toHaveLength(3);

    // Deleting the active theme puts the TV back on the classic preset.
    await api(s, 'DELETE', `/api/themes/${t.id}`, undefined, host);
    expect((await api(s, 'GET', '/api/settings/public')).data).toMatchObject({ theme: 'classic', custom: null });
    const { schemaVersion } = await import('../../src/server/db/db');
    expect(schemaVersion(s.db)).toBe(3);
  });
});

describe('board packages and full backups (L9, K6, K7)', () => {
  const upload = async (s: { url: string }, url: string, token: string, name: string, data: Buffer, type: string) => {
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(data)], { type }), name);
    const r = await fetch(s.url + url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd });
    return { status: r.status, data: await r.json() };
  };

  it('exports a board with its media as one ZIP and imports it on another installation', async () => {
    const a = await start();
    const hostA = await hostToken(a);
    const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#00aa00' } }).png().toBuffer();
    const media = (await upload(a, '/api/media', hostA, 'map.png', png, 'image/png')).data;
    expect(media.url).toMatch(/^\/media\/clues\//);
    const boardId = await sampleBoardId(a, hostA);
    const board = (await api(a, 'GET', `/api/boards/${boardId}`, undefined, hostA)).data;
    board.content.rounds[0].categories[0].clues[0].media = [{ kind: 'image', url: media.url, caption: 'A map' }];
    board.content.rounds[0].categories[0].clues[0].answerMedia = [{ kind: 'image', url: media.url, caption: 'Answer map' }];
    board.content.rounds[0].categories[1].clues[0].media = [{ kind: 'image', url: '/media/clues/gone.webp' }]; // missing file
    await api(a, 'PUT', `/api/boards/${boardId}`, board, hostA);

    const res = await fetch(`${a.url}/api/boards/${boardId}/package`, { headers: { authorization: `Bearer ${hostA}` } });
    expect(res.headers.get('content-type')).toContain('application/zip');
    const pkg = Buffer.from(await res.arrayBuffer());
    const { readZip } = await import('../../src/server/zip');
    const names = readZip(pkg, { maxEntries: 50, maxTotalBytes: 1e8 }).map((e) => e.name);
    expect(names).toContain('board.json');
    expect(names).toContain(`media/${media.url.split('/').pop()}`);

    // A second, empty installation imports it: media is re-validated, stored and the URL rewritten.
    const b = await start();
    const hostB = await hostToken(b);
    const preview = (await upload(b, '/api/boards/import-package?preview=1', hostB, 'p.ojboard.zip', pkg, 'application/zip')).data;
    expect(preview.saved).toBeNull();
    expect(preview.summary.mediaFiles).toBe(1);
    const imp = await upload(b, '/api/boards/import-package', hostB, 'p.ojboard.zip', pkg, 'application/zip');
    expect(imp.status).toBe(200);
    expect(imp.data.warnings.join(' ')).toMatch(/gone\.webp is missing/);
    const saved = (await api(b, 'GET', `/api/boards/${imp.data.saved.id}`, undefined, hostB)).data;
    const m = saved.content.rounds[0].categories[0].clues[0].media[0];
    expect(m).toMatchObject({ kind: 'image', caption: 'A map' });
    expect(saved.content.rounds[0].categories[0].clues[0].answerMedia[0]).toMatchObject({ kind: 'image', caption: 'Answer map', url: m.url }); // answer side carried over
    expect(m.url).not.toBe(media.url); // stored as a new file
    const img = await fetch(b.url + m.url);
    expect(img.status).toBe(200);
    await img.arrayBuffer();
    expect(saved.content.rounds[0].categories[1].clues[0].media ?? []).toEqual([]);

    // Hostile packages are refused.
    expect((await upload(b, '/api/boards/import-package', hostB, 'x.zip', Buffer.from('nope'), 'application/zip')).status).toBe(400);
    const { createZip } = await import('../../src/server/zip');
    const noBoard = createZip([{ name: 'readme.txt', data: Buffer.from('hi') }]);
    expect((await upload(b, '/api/boards/import-package', hostB, 'x.zip', noBoard, 'application/zip')).data.error).toMatch(/board\.json/);
    const fakeMedia = createZip([
      { name: 'board.json', data: Buffer.from(JSON.stringify({ ...JSON.parse(readZip(pkg, { maxEntries: 50, maxTotalBytes: 1e8 }).find((e) => e.name === 'board.json')!.data.toString()) })) },
      { name: `media/${media.url.split('/').pop()}`, data: Buffer.from('<script>alert(1)</script>') },
    ]);
    const bad = await upload(b, '/api/boards/import-package', hostB, 'x.zip', fakeMedia, 'application/zip');
    expect(bad.data.warnings.join(' ')).toMatch(/rejected/);
    expect((await upload(b, '/api/boards/import-package', (await createProfile(b, 'Eve')).token, 'p.zip', pkg, 'application/zip')).status).toBe(401);
  });

  it('full backup contains database + media and restores both on the next start', async () => {
    const dir = (await import('./helpers')).tempDir();
    const s = await start(dir);
    const host = await hostToken(s);
    const alex = await createProfile(s, 'Alex');
    const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#0000ff' } }).png().toBuffer();
    const pic = await upload(s, '/api/me/picture', alex.token, 'me.png', png, 'image/png');
    const picFile = pic.data.pictureUrl.split('/').pop();
    const res = await fetch(`${s.url}/api/admin/backup`, { headers: { authorization: `Bearer ${host}` } });
    const zip = Buffer.from(await res.arrayBuffer());
    const { readZip } = await import('../../src/server/zip');
    const names = readZip(zip, { maxEntries: 100, maxTotalBytes: 1e9 }).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['offlinejeopardy.db', 'manifest.json', `media/profiles/${picFile}`]));
    // Database-only backups are still available.
    const dbOnly = Buffer.from(await (await fetch(`${s.url}/api/admin/backup?media=0`, { headers: { authorization: `Bearer ${host}` } })).arrayBuffer());
    expect(dbOnly.subarray(0, 15).toString()).toBe('SQLite format 3');

    // Lose data: delete the profile picture and create another player, then restore the ZIP.
    fs.rmSync(path.join(dir, 'media', 'profiles', picFile));
    await createProfile(s, 'AfterBackup');
    const r = await upload(s, '/api/admin/restore', host, 'backup.zip', zip, 'application/zip');
    expect(r.data).toMatchObject({ ok: true, media: 1 });
    await s.close();
    servers.splice(servers.indexOf(s), 1);
    const s2 = await start(dir); // restore is applied on start
    const names2 = (await api(s2, 'GET', '/api/profiles')).data.map((p: { name: string }) => p.name);
    expect(names2).toEqual(['Alex']);
    const restored = await fetch(`${s2.url}/media/profiles/${picFile}`);
    expect(restored.status).toBe(200);
    expect((await restored.arrayBuffer()).byteLength).toBeGreaterThan(100);
    expect(fs.readdirSync(dir).some((f) => f.startsWith('pre-restore-media-'))).toBe(true); // safety copy kept
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

    // Host CSV exports (O11): include private profiles for the host, separate solo/team columns.
    expect((await api(s, 'GET', '/api/stats/export/players.csv', undefined, jordan.token)).status).toBe(401);
    const players = (await api(s, 'GET', '/api/stats/export/players.csv', undefined, host)).data as string;
    const lines = players.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toContain('solo_games,solo_wins');
    expect(lines.find((l) => l.startsWith('Alex,'))).toContain(',1,1,100.0,200,200,1,0,100.0,0,0,');
    expect(lines.some((l) => l.startsWith('Quiet,'))).toBe(true);
    const games = (await api(s, 'GET', '/api/stats/export/games.csv', undefined, host)).data as string;
    expect(games).toMatch(/Alex,player,Alex,200,1,yes/);
  });
});
