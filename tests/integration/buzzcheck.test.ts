// Buzzer check (Z11): presses are recorded in order with phone delays and never reach the game.
import { afterEach, describe, expect, it } from 'vitest';
import { api, boot, createProfile, hostToken, sampleBoardId, TestClient } from './helpers';
import type { ServerMessage } from '../../src/shared/protocol';

const servers: Awaited<ReturnType<typeof boot>>[] = [];
const clients: TestClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close().catch(() => {});
});
async function client(s: { url: string }, role: 'host' | 'public' | 'player', token?: string) {
  const c = await TestClient.connect(s, role, token);
  clients.push(c);
  return c;
}
type CheckMsg = Extract<ServerMessage, { t: 'buzzCheck' }>;

describe('buzzer check (Z11)', () => {
  it('records phone and Joy-Con presses in order, shows who is missing, and keeps the game untouched', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    const alex = await createProfile(s, 'Alex');
    const sam = await createProfile(s, 'Sam');
    const boardId = await sampleBoardId(s, host);
    await api(s, 'POST', '/api/games', { boardId, mode: 'solo' }, host);
    const h = await client(s, 'host', host);
    await h.act({ type: 'addPlayer', profileId: alex.id });
    await h.act({ type: 'addPlayer', profileId: sam.id });
    const bridge = await client(s, 'public', host);
    bridge.send({ t: 'controller', ev: { type: 'connected', controllerId: 'joycon:L:aa', kind: 'joycon', label: 'Joy-Con (L)', side: 'L' } });
    await h.wait((m) => m.t === 'controllers' && m.list.some((d) => d.connected));
    await h.act({ type: 'bindController', controllerId: 'joycon:L:aa', kind: 'joycon', label: 'Joy-Con (L)', target: { kind: 'profile', profileId: sam.id } });
    // Start the game and open a clue: check presses must still not count as buzzes.
    await h.act({ type: 'startGame' });
    await h.act({ type: 'selectClue', clueId: 'sci_1' });
    await h.act({ type: 'unlockBuzzers' });

    const pa = await client(s, 'player', alex.token);
    const ps = await client(s, 'player', sam.token);
    pa.send({ t: 'ping', c: Date.now(), rtt: 42 }); // phone reports its measured delay
    await pa.wait((m) => m.t === 'pong');

    h.send({ t: 'buzzCheck', action: 'start' });
    const started = (await h.seen((m) => m.t === 'buzzCheck' && !!m.view?.active)) as CheckMsg;
    expect(started.view!.waiting.map((w) => w.name).sort()).toEqual(['Alex', 'Sam', 'Sam']); // Sam's phone + Sam's Joy-Con
    await pa.seen((m) => m.t === 'buzzCheckMine' && m.active);

    bridge.send({ t: 'controller', ev: { type: 'button', controllerId: 'joycon:L:aa', button: 'SL', pressed: true } });
    await new Promise((r) => setTimeout(r, 30));
    pa.send({ t: 'buzz' });
    await pa.wait((m) => m.t === 'buzzResult' && m.info === 'check');
    const after = (await h.seen((m) => m.t === 'buzzCheck' && (m.view?.presses.length ?? 0) === 2)) as CheckMsg;
    const [first, second] = after.view!.presses;
    expect(first).toMatchObject({ key: 'joycon:L:aa', name: 'Sam', kind: 'joycon', order: 1, afterMs: 0 });
    expect(second).toMatchObject({ key: `phone:${alex.id}`, name: 'Alex', kind: 'phone', order: 2, rttMs: 42 });
    expect(second.afterMs).toBeGreaterThanOrEqual(0);
    expect(after.view!.waiting.map((w) => w.key)).toEqual([`phone:${sam.id}`]);
    expect(after.connections.find((c) => c.name === 'Alex')).toMatchObject({ rttMs: 42, quality: 'good' });
    await pa.seen((m) => m.t === 'buzzCheckMine' && m.pressed);
    expect(ps.messages.some((m) => m.t === 'buzzCheckMine' && m.pressed)).toBe(false);

    // Nothing reached the game.
    expect(h.state!.buzzer.winner).toBeNull();
    expect(h.state!.events!.some((e) => e.type === 'buzz')).toBe(false);
    // Phones and the TV never get the host view.
    expect(pa.messages.some((m) => m.t === 'buzzCheck')).toBe(false);
    expect(bridge.messages.some((m) => m.t === 'buzzCheck')).toBe(false);

    // Players cannot start a check; after Stop, buzzing works normally again.
    pa.send({ t: 'buzzCheck', action: 'start' });
    h.send({ t: 'buzzCheck', action: 'stop' });
    await h.wait((m) => m.t === 'buzzCheck' && m.view?.active === false);
    await new Promise((r) => setTimeout(r, 200));
    ps.send({ t: 'buzz' });
    const g = await h.waitState((x) => !!x?.buzzer.winner);
    expect(g!.buzzer.winner!.profileId).toBe(sam.id);
  });
});
