// Round 11 over real sockets: Final Jeopardy! answering stays open after the think time until the
// host closes it (R11-9, the default) — every screen sees the same state, a phone can still answer
// after time is up, nothing is taken after the host closes answering, and a reconnecting phone
// sees the right state.
import { afterAll, describe, expect, it } from 'vitest';
import { api, boot, createProfile, hostToken, sampleBoardId, TestClient } from './helpers';

const servers: { close: () => Promise<void> }[] = [];
afterAll(async () => {
  for (const s of servers) await s.close();
});
const client = (s: { url: string }, role: 'host' | 'public' | 'player', token?: string) => TestClient.connect(s, role, token);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lastResult = (c: TestClient) => [...c.messages].reverse().find((m) => (m as { t: string }).t === 'result') as { ok: boolean; error?: string } | undefined;

describe('Final Jeopardy! answering closed by the host (R11-9)', () => {
  it('time up keeps answering open on every screen; a late answer counts; after closing nothing is taken', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    const profiles = await Promise.all(['Ann', 'Ben'].map((n) => createProfile(s, n)));
    await api(s, 'POST', '/api/lobby', {}, host);
    await api(s, 'POST', '/api/games', { boardId: await sampleBoardId(s, host), mode: 'solo' }, host);
    const h = await client(s, 'host', host);
    const tv = await client(s, 'public');
    const phones = await Promise.all(profiles.map((p) => client(s, 'player', p.token)));
    for (const ph of phones) ph.send({ t: 'join' });
    await h.waitState((g) => g?.competitors.length === 2);
    await h.act({ type: 'startGame' });
    await h.act({ type: 'introSkip' });
    expect(h.state!.rules.finalClose).toBe('host'); // the default for a new game
    for (const c of h.state!.competitors) await h.act({ type: 'adjustScore', competitorId: c.id, delta: 500, note: 't' });
    await h.act({ type: 'updateRules', rules: { ...h.state!.rules, timers: { ...h.state!.rules.timers, finalSeconds: 1 } } });
    await h.act({ type: 'startFinal' });
    await h.act({ type: 'finalNext' });
    for (const p of phones) p.send({ t: 'finalWager', amount: 100 });
    await h.waitState((g) => !!g?.final?.entries.every((e) => e.hasWager));
    await h.act({ type: 'finalNext' });
    phones[0].send({ t: 'finalAnswer', answer: 'Budapest', submit: true });

    // Time runs out: the timer is over on every screen, but answering stays open.
    for (const c of [h, tv, ...phones]) await c.waitState((g) => !!g?.timer?.expired && g.timer.kind === 'final', 5000);
    await sleep(300);
    for (const c of [h, tv, ...phones]) expect(c.state!.final!.stage).toBe('clue');
    // A late answer after time is up is accepted.
    phones[1].send({ t: 'finalAnswer', answer: 'Vienna', submit: true });
    await h.waitState((g) => !!g?.final?.entries.every((e) => e.submitted));
    await sleep(50);
    expect(lastResult(phones[1])?.ok).toBe(true);
    // A phone that reconnects sees answering still open, its own answer in.
    const again = await client(s, 'player', profiles[1].token);
    await again.waitState((g, me) => g?.final?.stage === 'clue' && me?.final?.answer === 'Vienna');
    expect(again.state!.timer?.expired).toBe(true);

    // The host closes answering: every screen moves on together; nothing is taken afterwards.
    await h.act({ type: 'finalNext' });
    for (const c of [h, tv, ...phones, again]) await c.waitState((g) => g?.final?.stage === 'closed');
    const rejected = phones[0].wait((m) => (m as { t: string; ok?: boolean }).t === 'result' && (m as { ok?: boolean }).ok === false);
    phones[0].send({ t: 'finalAnswer', answer: 'Prague', submit: true });
    expect(((await rejected) as unknown as { error: string }).error).toMatch(/not open/);
    await sleep(100);
    expect(phones[0].me.final.answer).toBe('Budapest');
    // The reveal goes on as before.
    await h.act({ type: 'finalNext' });
    await tv.waitState((g) => g?.final?.stage === 'reveal' && g.final.cursor === 0);
  });
});
