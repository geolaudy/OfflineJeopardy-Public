// R7-31 developer tools over the real server: absent unless switched on, host only; the
// diagnostics report carries no tokens, names or addresses; the fairness test compares fair timing
// with arrival order on the same simulated clues.
import { afterEach, describe, expect, it } from 'vitest';
import { api, boot, createProfile, hostToken, TestClient } from './helpers';

const servers: Awaited<ReturnType<typeof boot>>[] = [];
const clients: TestClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close().catch(() => {});
});

describe('developer tools (R7-31)', () => {
  it('do not exist in a normal server', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    expect((await api(s, 'GET', '/api/info')).data.devTools).toBe(false);
    expect((await api(s, 'GET', '/api/dev/diagnostics', undefined, host)).status).toBe(404);
    expect((await api(s, 'POST', '/api/dev/fairness', {}, host)).status).toBe(404);
  });

  it('diagnostics: host only, and the report holds no secrets, names or addresses', async () => {
    const s = await boot(undefined, { devTools: true });
    servers.push(s);
    expect((await api(s, 'GET', '/api/info')).data.devTools).toBe(true);
    expect((await api(s, 'GET', '/api/dev/diagnostics')).status).toBe(401);
    const host = await hostToken(s);
    const zoe = await createProfile(s, 'Zoe Secretname', '4321');
    const phone = await TestClient.connect(s, 'player', zoe.token);
    phone.syncReplies = true;
    clients.push(phone);
    const h = await TestClient.connect(s, 'host', host);
    clients.push(h);
    await new Promise((r) => setTimeout(r, 900)); // a few clock probes
    const r = await api(s, 'GET', '/api/dev/diagnostics', undefined, host);
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ kind: 'OfflineJeopardy diagnostics', app: { version: expect.any(String) }, process: { eventLoopDelayMs: { p99: expect.any(Number) } } });
    const player = r.data.connections.find((c: { kind: string }) => c.kind === 'player');
    expect(player.clockSync).toMatchObject({ samples: expect.any(Number), rttMedianMs: expect.any(Number) });
    expect(player.clockSync.samples).toBeGreaterThan(0);
    const text = JSON.stringify(r.data);
    for (const secret of [host, zoe.token, zoe.id, 'Zoe Secretname', '4321', '127.0.0.1']) expect(text).not.toContain(secret);
  });

  it('fairness test: same simulated clues by arrival and with fair timing', async () => {
    const s = await boot(undefined, { devTools: true });
    servers.push(s);
    const host = await hostToken(s);
    const cfg = { phones: [{ delayMs: 3, jitter: 'normal', spikes: false }, { delayMs: 35, jitter: 'normal', spikes: false }], joycons: 0, spreadMs: 80, trials: 200, seed: 7, mode: 'standard' };
    const r = await api(s, 'POST', '/api/dev/fairness', cfg, host);
    expect(r.status).toBe(200);
    const { arrival, fair } = r.data.result;
    expect(r.data.result.devices).toHaveLength(2);
    expect(fair.callablePct).toBeGreaterThan(arrival.callablePct);
    expect(fair.falseEarly).toBe(0);
    expect(fair.waitP99).toBeLessThanOrEqual(61);
    expect(fair.truthWins.reduce((a: number, b: number) => a + b, 0)).toBe(200);
    // Deterministic: the same seed gives the same numbers.
    expect((await api(s, 'POST', '/api/dev/fairness', cfg, host)).data.result).toEqual(r.data.result);
    // Validation.
    expect((await api(s, 'POST', '/api/dev/fairness', { ...cfg, phones: cfg.phones.slice(0, 1) }, host)).status).toBe(400);
    expect((await api(s, 'POST', '/api/dev/fairness', { ...cfg, trials: 99999 }, host)).status).toBe(400);
    expect((await api(s, 'POST', '/api/dev/fairness', cfg)).status).toBe(401);
  });

  it('fairness test is refused while a clue is being played (it would delay real buzzes)', async () => {
    const s = await boot(undefined, { devTools: true });
    servers.push(s);
    const host = await hostToken(s);
    const [a, b] = await Promise.all(['Ann', 'Bo'].map((n) => createProfile(s, n)));
    expect((await api(s, 'POST', '/api/lobby', { game: true }, host)).status).toBe(200);
    const h = await TestClient.connect(s, 'host', host);
    clients.push(h);
    await h.waitState((g) => g?.phase === 'lobby');
    await h.act({ type: 'addPlayer', profileId: a.id });
    await h.act({ type: 'addPlayer', profileId: b.id });
    await h.act({ type: 'startGame' });
    await h.act({ type: 'introSkip' });
    const g = await h.waitState((x) => x?.phase === 'board');
    await h.act({ type: 'selectClue', clueId: g!.rounds[0].categories[0].clues[0].id });
    const cfg = { phones: [{ delayMs: 3, jitter: 'low', spikes: false }, { delayMs: 20, jitter: 'low', spikes: false }], joycons: 0, spreadMs: 50, trials: 20, seed: 1, mode: 'standard' };
    const r = await api(s, 'POST', '/api/dev/fairness', cfg, host);
    expect(r.status).toBe(409);
    expect(r.data.error).toMatch(/clue/);
  });
});
