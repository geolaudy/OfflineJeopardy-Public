// Tournaments (O8): games join a tournament at setup; standings follow the finished games.
import { afterEach, describe, expect, it } from 'vitest';
import { api, boot, createProfile, hostToken, sampleBoardId, TestClient } from './helpers';

const servers: Awaited<ReturnType<typeof boot>>[] = [];
const clients: TestClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close().catch(() => {});
});

describe('tournaments (O8)', () => {
  it('collects finished games into standings, validates setup, presents public standings, and survives deletion', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    const alex = await createProfile(s, 'Alex');
    const sam = await createProfile(s, 'Sam');
    const boardId = await sampleBoardId(s, host);
    const t = (await api(s, 'POST', '/api/tournaments', { name: 'Friday Cup', mode: 'solo', scoring: 'placement' }, host)).data;
    expect(t).toMatchObject({ name: 'Friday Cup', status: 'active' });

    // Setup validation: wrong mode, practice games, unknown tournaments.
    expect((await api(s, 'POST', '/api/games', { boardId, mode: 'team', tournamentId: t.id }, host)).status).toBe(400);
    expect((await api(s, 'POST', '/api/games', { boardId, mode: 'solo', practice: true, tournamentId: t.id }, host)).status).toBe(400);
    expect((await api(s, 'POST', '/api/games', { boardId, mode: 'solo', tournamentId: 'nope' }, host)).status).toBe(404);

    const h = await TestClient.connect(s, 'host', host);
    clients.push(h);
    // Two games: Alex wins the first, Sam the second (by more).
    for (const [winner, value] of [
      [alex, 400],
      [sam, 1200],
    ] as const) {
      const g = await api(s, 'POST', '/api/games', { boardId, mode: 'solo', tournamentId: t.id }, host);
      expect(g.status).toBe(200);
      await h.waitState((x) => x?.id === g.data.id);
      await h.act({ type: 'addPlayer', profileId: alex.id });
      await h.act({ type: 'addPlayer', profileId: sam.id });
      await h.act({ type: 'startGame' });
      const comp = h.state!.competitors.find((c) => c.profileId === winner.id)!;
      await h.act({ type: 'adjustScore', competitorId: comp.id, delta: value });
      await h.act({ type: 'endGame' });
      expect((await api(s, 'GET', `/api/games/${g.data.id}/tournament`, undefined, host)).data.tournament.id).toBe(t.id);
      await api(s, 'POST', '/api/games/close', {}, host);
    }
    // A game outside the tournament never counts.
    await api(s, 'POST', '/api/games', { boardId, mode: 'solo' }, host);

    const d = (await api(s, 'GET', `/api/tournaments/${t.id}`, undefined, host)).data;
    expect(d.games).toHaveLength(2);
    expect(d.standings.map((r: { name: string; points: number; wins: number; rank: number }) => [r.rank, r.name, r.points, r.wins])).toEqual([
      [1, 'Sam', 8, 1],
      [2, 'Alex', 8, 1],
    ]); // equal points and wins: Sam's higher total score ranks first
    const list = (await api(s, 'GET', '/api/tournaments', undefined, host)).data;
    expect(list[0]).toMatchObject({ id: t.id, games: 2, leader: 'Sam' });
    expect((await api(s, 'GET', '/api/tournaments', undefined)).status).toBe(401); // host only

    // Public TV page: names and points only.
    await api(s, 'POST', '/api/lobby', {}, host);
    const tv = await TestClient.connect(s, 'public');
    clients.push(tv);
    h.send({ t: 'present', req: { page: 'tournament', tournamentId: t.id } });
    const m = (await tv.wait((x) => x.t === 'presentation' && x.p.page === 'tournament')) as Extract<typeof tv.messages[number], { t: 'presentation' }>;
    expect(m.p.tournament!.rows.map((r) => [r.name, r.value])).toEqual([
      ['Sam', '8 pts'],
      ['Alex', '8 pts'],
    ]);
    expect(JSON.stringify(m.p)).not.toMatch(/pin|token/i);

    // Finished tournaments refuse new games; deleting keeps the games in history.
    await api(s, 'PATCH', `/api/tournaments/${t.id}`, { status: 'finished' }, host);
    expect((await api(s, 'POST', '/api/games', { boardId, mode: 'solo', tournamentId: t.id }, host)).status).toBe(400);
    await api(s, 'DELETE', `/api/tournaments/${t.id}`, undefined, host);
    expect((await api(s, 'GET', `/api/tournaments/${t.id}`, undefined, host)).status).toBe(404);
    const history = (await api(s, 'GET', '/api/history', undefined, host)).data;
    expect(history.length).toBeGreaterThanOrEqual(2);
  });
});
