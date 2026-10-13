// Head to head (T10): record against each other, as teammates, and privacy.
import { afterEach, describe, expect, it } from 'vitest';
import { api, boot, createProfile, hostToken, sampleBoardId, TestClient } from './helpers';

const servers: Awaited<ReturnType<typeof boot>>[] = [];
const clients: TestClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close().catch(() => {});
});

describe('head to head (T10)', () => {
  it('counts games against and with each other, and respects private statistics', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    const alex = await createProfile(s, 'Alex');
    const sam = await createProfile(s, 'Sam');
    const boardId = await sampleBoardId(s, host);
    const h = await TestClient.connect(s, 'host', host);
    clients.push(h);

    const play = async (mode: 'solo' | 'team', winner: string | null) => {
      const g = await api(s, 'POST', '/api/games', { boardId, mode }, host);
      await h.waitState((x) => x?.id === g.data.id);
      if (mode === 'solo') {
        await h.act({ type: 'addPlayer', profileId: alex.id });
        await h.act({ type: 'addPlayer', profileId: sam.id });
      } else {
        await h.act({ type: 'addTeam', name: 'Duo', color: '#2563eb', buzzerMode: 'individual', memberIds: [alex.id, sam.id] });
      }
      await h.act({ type: 'startGame' });
      if (winner) {
        const c = h.state!.competitors.find((x) => x.memberIds.includes(winner))!;
        await h.act({ type: 'adjustScore', competitorId: c.id, delta: 500 });
      }
      await h.act({ type: 'endGame' });
      await api(s, 'POST', '/api/games/close', {}, host);
    };
    await play('solo', alex.id);
    await play('solo', alex.id);
    await play('solo', sam.id);
    await play('team', alex.id);

    const r = await api(s, 'GET', `/api/stats/compare?a=${alex.id}&b=${sam.id}`, undefined, alex.token);
    expect(r.status).toBe(200);
    expect(r.data.h2h.opponents).toEqual({ games: 3, aAhead: 2, bAhead: 1, tied: 0 });
    expect(r.data.h2h.teammates).toEqual({ games: 1, wins: 1 });
    expect(r.data.h2h.recent[0]).toMatchObject({ together: true, won: 'both' });
    expect(r.data.a.profile.name).toBe('Alex');
    expect(r.data.b.summary.games).toBe(4);
    expect(JSON.stringify(r.data)).not.toMatch(/pin|token/i);

    // Privacy: Sam hides their stats -> Alex can no longer compare; Sam and the host still can.
    await api(s, 'PATCH', '/api/me', { statsPrivate: true }, sam.token);
    expect((await api(s, 'GET', `/api/stats/compare?a=${alex.id}&b=${sam.id}`, undefined, alex.token)).status).toBe(403);
    expect((await api(s, 'GET', `/api/stats/compare?a=${sam.id}&b=${alex.id}`, undefined, sam.token)).status).toBe(200);
    expect((await api(s, 'GET', `/api/stats/compare?a=${alex.id}&b=${sam.id}`, undefined, host)).status).toBe(200);
    expect((await api(s, 'GET', `/api/stats/compare?a=${alex.id}&b=${sam.id}`)).status).toBe(401);
    expect((await api(s, 'GET', `/api/stats/compare?a=${alex.id}&b=${alex.id}`, undefined, alex.token)).status).toBe(400);
  });
});
