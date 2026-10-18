// Round 7 milestone C over the real server: the TV lobby roster carries each connected phone's
// smoothed delay, measured by the fair-timing clock sync (R7-4) — only for phones that answer the
// server's probes, never for one that has not been measured, and gone when the phone leaves.
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
const waitPresentation = (c: TestClient, pred: (p: PresentationState) => boolean, timeout = 3000) => {
  const now = [...c.messages].reverse().find((m) => m.t === 'presentation') as { p: PresentationState } | undefined;
  if (now && pred(now.p)) return Promise.resolve(now.p);
  return c.wait((m) => m.t === 'presentation' && pred((m as { p: PresentationState }).p), timeout).then((m) => (m as { p: PresentationState }).p);
};

describe('lobby phone delay (R7-4)', () => {
  it('a synced phone shows its delay on the roster; an unmeasured one does not; leaving clears it', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    const [ann, ben] = await Promise.all(['Ann', 'Ben'].map((n) => createProfile(s, n)));
    const tv = await client(s, 'public');
    expect((await api(s, 'POST', '/api/lobby', { game: true }, host)).status).toBe(200);
    const h = await client(s, 'host', host);
    await h.waitState((g) => g?.phase === 'lobby');
    await h.act({ type: 'addPlayer', profileId: ann.id });
    await h.act({ type: 'addPlayer', profileId: ben.id });

    const pa = await client(s, 'player', ann.token);
    pa.syncReplies = true; // answers the clock probes like a browser
    const pb = await client(s, 'player', ben.token); // never answers: stays "measuring"
    const row = (p: PresentationState, name: string) => p.roster?.rows.find((r) => r.name === name);

    const p = await waitPresentation(tv, (x) => row(x, 'Ann')?.latencyMs !== undefined && !!row(x, 'Ben')?.ready, 8000);
    expect(row(p, 'Ann')).toMatchObject({ device: 'Phone', ready: true });
    expect(row(p, 'Ann')!.latencyMs).toBeGreaterThanOrEqual(5);
    expect(row(p, 'Ann')!.latencyMs! % 5).toBe(0); // shown in steps
    expect(row(p, 'Ben')!.latencyMs).toBeUndefined();

    pa.close();
    const gone = await waitPresentation(tv, (x) => row(x, 'Ann')?.ready === false, 8000);
    expect(row(gone, 'Ann')!.latencyMs).toBeUndefined();
    pb.close();
  }, 20000);
});
