// Round 5 lobby over the real server: Create Lobby goes straight into lobby management with the
// last game's settings (R5-4), the TV home screen lists recent games and can show one (R5-2),
// players pick teams / rename them / set lobby nicknames from their phones (R5-5, R5-17), team
// slots survive Return to Lobby, and playing teams are linked to saved teams for statistics.
import { afterEach, describe, expect, it } from 'vitest';
import { api, boot, createProfile, hostToken, TestClient } from './helpers';
import type { PresentationState } from '../../src/shared/presentation';

const servers: Awaited<ReturnType<typeof boot>>[] = [];
const clients: TestClient[] = [];
async function client(s: { url: string }, role: 'host' | 'public' | 'player', token?: string) {
  const c = await TestClient.connect(s, role, token);
  clients.push(c);
  return c;
}
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close().catch(() => {});
});
const lastPresentation = (c: TestClient) => [...c.messages].reverse().find((m) => m.t === 'presentation') as { p: PresentationState } | undefined;
const waitPresentation = (c: TestClient, pred: (p: PresentationState) => boolean) => {
  const now = lastPresentation(c);
  if (now && pred(now.p)) return Promise.resolve(now.p);
  return c.wait((m) => m.t === 'presentation' && pred((m as { p: PresentationState }).p)).then((m) => (m as { p: PresentationState }).p);
};

describe('Create Lobby, home screen and team lobby (R5-2, R5-4, R5-5, R5-17)', () => {
  it('a full evening: home → create lobby → phones pick teams → game → recent game on the home screen', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    const [alex, bea, cy] = await Promise.all(['Alexander', 'Bea', 'Cy'].map((n) => createProfile(s, n)));
    const tv = await client(s, 'public');
    // Home screen: no lobby, nothing played yet.
    let p = await waitPresentation(tv, (x) => !!x.home);
    expect(p.home).toEqual({ recent: [], unfinished: null });

    const r = await api(s, 'POST', '/api/lobby', { game: true }, host);
    expect(r.status).toBe(200);
    expect(r.data.gameId).toBeTruthy();
    const h = await client(s, 'host', host);
    await h.waitState((g) => g?.phase === 'lobby');
    await h.act({ type: 'setMode', mode: 'team' });
    expect(h.state!.competitors.map((c) => c.name)).toEqual(['Blue Team', 'Red Team']);
    await h.act({ type: 'updateRules', rules: { ...h.state!.rules, maxPerTeam: 2 } });

    const phones = await Promise.all([alex, bea, cy].map((x) => client(s, 'player', x.token)));
    for (const ph of phones) ph.send({ t: 'join' });
    await h.waitState((g) => g?.unassigned.length === 3);
    const [pa, pb, pc] = phones;
    const [blue, red] = h.state!.competitors.map((c) => c.id);
    pa.send({ t: 'pickTeam', competitorId: blue });
    pb.send({ t: 'pickTeam', competitorId: blue });
    await h.waitState((g) => g!.competitors[0].memberIds.length === 2);
    const full = pc.wait((m) => m.t === 'result');
    pc.send({ t: 'pickTeam', competitorId: blue });
    expect(await full).toMatchObject({ ok: false, error: expect.stringMatching(/full/) });
    pc.send({ t: 'pickTeam', competitorId: red });
    pa.send({ t: 'teamIdentity', name: 'The Blue Team', color: '#0891b2' });
    pa.send({ t: 'nickname', nickname: 'QuizMaster' });
    await h.waitState((g) => g?.competitors[0].name === 'The Blue Team' && g.profiles[alex.id]?.nickname === 'QuizMaster' && g.competitors[1].memberIds.length === 1);
    // Everyone sees the nickname, the profile name is unchanged; the TV roster shows both.
    await tv.waitState((g) => g?.profiles[alex.id]?.nickname === 'QuizMaster');
    expect(tv.state!.profiles[alex.id].name).toBe('Alexander');
    p = await waitPresentation(tv, (x) => !!x.roster?.rows.some((row) => row.name === 'QuizMaster'));
    expect(p.roster!.rows.find((row) => row.name === 'QuizMaster')).toMatchObject({ realName: 'Alexander', team: 'The Blue Team' });
    expect(p.roster!.maxPerTeam).toBe(2);
    expect(p.roster!.board?.title).toBeTruthy();

    // An extra empty slot does not play; it comes back with Return to Lobby.
    await h.act({ type: 'setTeamCount', count: 3 });
    await h.act({ type: 'startGame' });
    expect(h.state!.competitors.map((c) => c.name)).toEqual(['The Blue Team', 'Red Team']);
    const teams = (await api(s, 'GET', '/api/teams', undefined, host)).data as { name: string; memberIds: string[] }[];
    expect(teams.find((t) => t.name === 'The Blue Team')?.memberIds.sort()).toEqual([alex.id, bea.id].sort()); // linked for team statistics
    await h.act({ type: 'introSkip' });
    await h.act({ type: 'adjustScore', competitorId: blue, delta: 800, note: 'test' });
    await h.act({ type: 'endGame' });
    await api(s, 'POST', '/api/games/current/rematch', {}, host);
    await h.waitState((g) => g?.phase === 'lobby');
    expect(h.state!.competitors.map((c) => [c.name, c.memberIds.length])).toEqual([['The Blue Team', 2], ['Red Team', 1], ['Blue Team', 0]]);
    expect(h.state!.profiles[alex.id].nickname).toBe('QuizMaster'); // same lobby, same nickname

    // Close the lobby: the TV home lists the finished game and can show its recap.
    await api(s, 'DELETE', '/api/lobby', undefined, host);
    p = await waitPresentation(tv, (x) => (x.home?.recent.length ?? 0) > 0);
    expect(p.home!.recent[0]).toMatchObject({ mode: 'team', teams: 2, players: 3, winningScore: 800, winners: [{ name: 'The Blue Team', team: true }] });
    const recent = (await api(s, 'GET', '/api/games/recent', undefined, host)).data.recent;
    expect(recent[0].id).toBe(p.home!.recent[0].id);
    h.send({ t: 'present', req: { page: 'game', gameId: recent[0].id } });
    p = await waitPresentation(tv, (x) => x.page === 'game');
    expect(p.game!.standings[0]).toMatchObject({ name: 'The Blue Team', score: 800, isWinner: true, placement: 1 });
    expect(JSON.stringify(p)).not.toMatch(/"answer"|pin|token/i);
    // Closing a lobby where players had joined keeps the game (it can be resumed).
    const games = (await api(s, 'GET', '/api/games', undefined, host)).data.games as { status: string }[];
    expect(games.every((g) => g.status !== 'abandoned')).toBe(true);
  });

  it('Create Lobby reuses the last game’s board, mode and rules; an empty lobby closed is not kept', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    await api(s, 'POST', '/api/lobby', { game: true }, host);
    const h = await client(s, 'host', host);
    await h.waitState((g) => g?.phase === 'lobby');
    await h.act({ type: 'setMode', mode: 'team' });
    await h.act({ type: 'updateRules', rules: { ...h.state!.rules, dailyWagerMin: 50 } });
    const first = h.state!.id;
    await api(s, 'DELETE', '/api/lobby', undefined, host);
    expect(((await api(s, 'GET', '/api/games', undefined, host)).data.games as { id: string }[]).some((g) => g.id === first)).toBe(false); // nobody joined: discarded
    await api(s, 'POST', '/api/lobby', { game: true }, host);
    await h.waitState((g) => !!g && g.id !== first);
    expect(h.state!.mode).toBe('team');
    expect(h.state!.rules.dailyWagerMin).toBe(50);
    expect(h.state!.competitors.map((c) => c.name)).toEqual(['Blue Team', 'Red Team']);
  });
});
