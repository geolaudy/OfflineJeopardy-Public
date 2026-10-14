// User feedback round 3: Return to Lobby across consecutive games (R3-3), TV leaderboard / team /
// settings pages (R3-2, R3-4) and bot difficulty on the public roster (R3-5).
import { afterEach, describe, expect, it } from 'vitest';
import { api, boot, createProfile, hostToken, sampleBoardId, TestClient } from './helpers';
import { DEFAULT_RULES } from '../../src/shared/game';

const servers: Awaited<ReturnType<typeof boot>>[] = [];
const clients: TestClient[] = [];
async function start() {
  const s = await boot();
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
const lastPresentation = (c: TestClient) => [...c.messages].reverse().find((m) => m.t === 'presentation') as any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Return to Lobby (R3-3)', () => {
  it('keeps players, buzzers, bots and room code across consecutive games; resets only the match', async () => {
    const s = await start();
    const host = await hostToken(s);
    const [alex, sam] = await Promise.all([createProfile(s, 'Alex'), createProfile(s, 'Sam')]);
    await api(s, 'POST', '/api/lobby', { name: 'Game night' }, host);
    const boardId = await sampleBoardId(s, host);
    await api(s, 'POST', '/api/games', { boardId, mode: 'solo' }, host);
    const h = await client(s, 'host', host);
    const tv = await client(s, 'public');
    const pa = await client(s, 'player', alex.token);
    pa.send({ t: 'join' });
    await h.waitState((g) => !!g?.competitors.some((c) => c.profileId === alex.id));
    await h.act({ type: 'addPlayer', profileId: sam.id });
    await h.act({ type: 'addBot', name: 'Robo Rita', level: 'hard' });
    // Sam buzzes with a keyboard key read by the game PC.
    const bridge = await client(s, 'public', host);
    h.send({ t: 'assignListen', target: { kind: 'profile', profileId: sam.id } });
    await h.wait((m) => m.t === 'controllers' && !!(m as any).listening);
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'kb:KeyS', kind: 'keyboard', label: 'Key S', button: 'KeyS', pressed: true } });
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'kb:KeyS', button: 'KeyS', pressed: false } });
    await h.waitState((g) => g?.bindings.length === 1);

    // Bot difficulty is on the public roster.
    await tv.wait((m) => m.t === 'presentation' && !!(m as any).p.roster?.rows.some((r: any) => r.bot === 'Hard'), 3000);

    const firstId = h.state!.id;
    const roomCode = h.state!.roomCode;
    expect((await api(s, 'POST', '/api/games/current/rematch', {}, host)).status).toBe(409); // not finished yet

    // ---- Game 1: Alex answers correctly.
    await h.act({ type: 'startGame' });
    await h.act({ type: 'introSkip' });
    await h.act({ type: 'selectClue', clueId: 'tech_3' });
    await h.act({ type: 'unlockBuzzers' });
    pa.send({ t: 'buzz' });
    await h.waitState((g) => g?.buzzer.winner?.profileId === alex.id);
    await h.act({ type: 'judge', result: 'correct' });
    await h.act({ type: 'closeClue' });
    await h.act({ type: 'endGame' });
    expect(h.state!.results![0]).toMatchObject({ isWinner: true });
    const alexC1 = h.state!.competitors.find((c) => c.profileId === alex.id)!;
    expect(alexC1.score).toBe(600);

    // ---- Return to Lobby.
    const r = await api(s, 'POST', '/api/games/current/rematch', {}, host);
    expect(r.status).toBe(200);
    const g2 = await h.waitState((g) => !!g && g.id !== firstId && g.phase === 'lobby');
    expect(g2!.id).toBe(r.data.id);
    expect(g2!.roomCode).toBe(roomCode);
    expect(g2!.competitors.map((c) => c.profileId ?? c.name).sort()).toEqual([alex.id, sam.id, 'Robo Rita'].sort());
    expect(g2!.competitors.every((c) => c.score === 0)).toBe(true);
    expect(g2!.bindings).toEqual([expect.objectContaining({ controllerId: 'kb:KeyS', target: { kind: 'profile', profileId: sam.id } })]);
    expect(JSON.stringify(g2)).not.toContain('"used":true');
    expect(g2!.buzzer.winner ?? null).toBeNull();
    expect(g2!.clue).toBeNull();
    expect(g2!.results).toBeNull();
    // Lobby cards (R3-6/7): history summary, crown for the previous winner, wins leader.
    const roster1 = ((await tv.wait((m) => m.t === 'presentation' && !!(m as any).p.roster?.reigning?.length, 3000)) as any).p.roster;
    expect(roster1.reigning).toEqual([alex.id]);
    expect(roster1.leaders).toEqual([alex.id]);
    expect(roster1.people[alex.id]).toMatchObject({ private: false, games: 1, wins: 1, soloWins: 1, teamWins: 0, streak: 1 });
    expect(roster1.people[sam.id]).toMatchObject({ games: 1, wins: 0, streak: 0 });
    expect(roster1.rows.find((x: any) => x.name === 'Alex')).toMatchObject({ crown: true, profileId: alex.id });
    expect(roster1.rows.find((x: any) => x.name === 'Robo Rita')).toMatchObject({ crown: false, bot: 'Hard' });
    expect(roster1.people['Robo Rita']).toBeUndefined(); // computer opponents have no profile statistics
    // Alex's phone is still in the game without joining again.
    await pa.waitState((g) => g?.id === g2!.id && !!g.competitors.some((c) => c.profileId === alex.id));
    // The first game is finished and saved in history.
    const hist = (await api(s, 'GET', '/api/history', undefined, host)).data as any[];
    expect(hist.map((x) => x.id)).toContain(firstId);
    expect(hist.map((x) => x.id)).not.toContain(g2!.id);
    // Old buzzes do not carry over: a stray press in the lobby is not a buzz.
    pa.send({ t: 'buzz' });
    await sleep(100);
    expect(h.state!.buzzer.winner ?? null).toBeNull();

    // ---- Game 2: Sam wins with the keyboard key that is still assigned.
    await h.act({ type: 'startGame' });
    await h.act({ type: 'introSkip' });
    await h.act({ type: 'selectClue', clueId: 'food_2' });
    await h.act({ type: 'unlockBuzzers' });
    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'kb:KeyS', button: 'KeyS', pressed: true } });
    await h.waitState((g) => g?.buzzer.winner?.profileId === sam.id);
    await h.act({ type: 'judge', result: 'correct' });
    await h.act({ type: 'closeClue' });
    await h.act({ type: 'endGame' });
    expect(h.state!.competitors.find((c) => c.profileId === sam.id)!.score).toBe(400);
    expect(h.state!.competitors.find((c) => c.profileId === alex.id)!.score).toBe(0);

    // Statistics count each game once.
    const a = (await api(s, 'GET', `/api/stats/profiles/${alex.id}`, undefined, host)).data.stats;
    const sm = (await api(s, 'GET', `/api/stats/profiles/${sam.id}`, undefined, host)).data.stats;
    expect(a.solo.games).toMatchObject({ played: 2, wins: 1 });
    expect(sm.solo.games).toMatchObject({ played: 2, wins: 1 });
    expect(a.solo.answers.correct).toBe(1);

    // ---- Third lobby: the reigning winner is remembered; disconnected phones are not "ready".
    await api(s, 'POST', '/api/games/current/rematch', {}, host);
    await h.waitState((g) => g?.phase === 'lobby' && g.id !== r.data.id);
    const roster2 = ((await tv.wait((m) => m.t === 'presentation' && !!(m as any).p.roster?.reigning?.includes(sam.id), 3000)) as any).p.roster;
    expect(roster2.people[alex.id]).toMatchObject({ games: 2, wins: 1, streak: 0 });
    expect(roster2.people[sam.id]).toMatchObject({ games: 2, wins: 1, streak: 1 });
    expect(roster2.leaders).toEqual([]); // a tie between everyone is not a "leader"
    // Private statistics stay private on the TV.
    await api(s, 'PATCH', '/api/me', { statsPrivate: true }, sam.token);
    h.send({ t: 'present', req: { page: 'lobby' } });
    const roster3 = ((await tv.wait((m) => m.t === 'presentation' && !!(m as any).p.roster?.people?.[sam.id]?.private, 3000)) as any).p.roster;
    expect(roster3.people[sam.id]).toMatchObject({ private: true, games: 0, wins: 0 });
    expect(roster3.leaders).toEqual([alex.id]);
    const profiles = (await api(s, 'GET', '/api/profiles')).data as { id: string }[];
    expect(profiles.filter((p) => p.id === alex.id)).toHaveLength(1);
    pa.close();
    await tv.wait((m) => m.t === 'presentation' && (m as any).p.roster?.rows.some((x: any) => x.name === 'Alex' && !x.ready), 3000);
    const pa2 = await client(s, 'player', alex.token);
    await tv.wait((m) => m.t === 'presentation' && (m as any).p.roster?.rows.some((x: any) => x.name === 'Alex' && x.ready), 3000);
    await pa2.waitState((g) => !!g?.competitors.some((c) => c.profileId === alex.id));
  });
});

describe('TV pages from the host (R3-2, R3-4)', () => {
  it('leaderboard metrics, team stats, previous page and a secret-free settings page', async () => {
    const s = await start();
    const host = await hostToken(s);
    const [alex, jordan] = await Promise.all([createProfile(s, 'Alex'), createProfile(s, 'Jordan')]);
    await api(s, 'POST', '/api/lobby', {}, host);
    const team = (await api(s, 'POST', '/api/teams', { name: 'Owls', color: '#16a34a', avatar: 'shield', buzzerMode: 'individual', memberIds: [alex.id, jordan.id] }, host)).data;
    const h = await client(s, 'host', host);
    const tv = await client(s, 'public');
    const phone = await client(s, 'player', alex.token);
    const show = async (req: Record<string, unknown>, page: string) => {
      h.send({ t: 'present', req });
      await tv.wait((m) => m.t === 'presentation' && (m as any).p.page === page);
      return lastPresentation(tv).p;
    };

    // Settings before a game exists: the host's draft, live.
    let p = await show({ page: 'rules' }, 'rules');
    expect(p.rules.note).toMatch(/standard rules/);
    const boardId = await sampleBoardId(s, host);
    await api(s, 'POST', '/api/lobby/draft', { draft: { mode: 'team', boardId, rules: { ...DEFAULT_RULES, maxPlayers: 6, timers: { ...DEFAULT_RULES.timers, buzzSeconds: 7, answerSeconds: 5 } } } }, host);
    await tv.wait((m) => m.t === 'presentation' && (m as any).p.rules?.note?.includes('still choosing'));
    p = lastPresentation(tv).p;
    const flat = p.rules.sections.flatMap((x: any) => x.items.map((i: any) => `${i.label}: ${i.value}`));
    expect(flat).toEqual(expect.arrayContaining(['Mode: Teams', 'Player limit: 6 players', 'Time to buzz in: 7 seconds', 'Time to answer: 5 seconds']));
    expect(flat.join(' ')).toContain('Starter Trivia Night');

    // With a game: the game's own settings; never the room code, tokens or PINs.
    await api(s, 'POST', '/api/games', { boardId, mode: 'solo', rules: { ...DEFAULT_RULES, requireRoomCode: true, earlyBuzzPenalty: 'lockout' } }, host);
    await h.waitState((g) => !!g);
    h.send({ t: 'present', req: { page: 'rules' } });
    await tv.wait((m) => m.t === 'presentation' && (m as any).p.page === 'rules' && (m as any).p.rules.note?.includes('can still change'));
    p = lastPresentation(tv).p;
    const json = JSON.stringify(p);
    expect(json).toContain('Short lockout');
    expect(json).toContain('room code');
    expect(json).not.toContain(h.state!.roomCode);
    expect(json).not.toContain(host);
    expect(json).not.toMatch(/pin|token|apiKey/i);

    // Team leaderboard + a team's own statistics page.
    p = await show({ page: 'leaderboard', view: 'teams', metric: 'wins' }, 'leaderboard');
    expect(p.leaderboard).toMatchObject({ viewLabel: 'Teams', metricLabel: 'Wins', rows: [] });
    p = await show({ page: 'team', teamId: team.id }, 'team');
    expect(p.team).toMatchObject({ name: 'Owls', stats: { games: 0, wins: 0 } });
    expect(p.team.members.map((m: any) => m.name)).toEqual(['Alex', 'Jordan']);
    // "Previous page" returns to the leaderboard, then to the team again.
    p = await show({ page: 'lobby', back: true }, 'leaderboard');
    expect(p.leaderboard.viewLabel).toBe('Teams');
    p = await show({ page: 'leaderboard', view: 'solo', metric: 'incorrect' }, 'leaderboard');
    expect(p.leaderboard.metricLabel).toBe('Incorrect answers');
    await show({ page: 'lobby' }, 'lobby');
    // Phones never receive presentation data.
    expect(phone.messages.some((m) => m.t === 'presentation')).toBe(false);
    // Team leaderboard API follows the leaderboard privacy setting.
    expect((await api(s, 'GET', '/api/stats/team-leaderboard', undefined, alex.token)).status).toBe(200);
    expect((await api(s, 'GET', '/api/stats/team-leaderboard')).status).toBe(401);
  });
});
