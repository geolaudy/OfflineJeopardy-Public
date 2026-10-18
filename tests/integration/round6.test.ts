// Round 6 over real sockets: fair buzzer timing (R6-22/23) — phones answer the server's clock
// probes, send their own press time, and a press that arrives later but was made earlier wins
// within the short window; the phones get the "how close was it" result; the host sees the gaps.
// Also the Final waits for the host after the think time (R6-6).
import { afterAll, describe, expect, it } from 'vitest';
import { api, boot, createProfile, hostToken, sampleBoardId, TestClient } from './helpers';

const servers: { close: () => Promise<void> }[] = [];
afterAll(async () => {
  for (const s of servers) await s.close();
});
const client = (s: { url: string }, role: 'host' | 'public' | 'player', token?: string) => TestClient.connect(s, role, token);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function game(names: string[]) {
  const s = await boot();
  servers.push(s);
  const host = await hostToken(s);
  const profiles = await Promise.all(names.map((n) => createProfile(s, n)));
  await api(s, 'POST', '/api/lobby', {}, host);
  await api(s, 'POST', '/api/games', { boardId: await sampleBoardId(s, host), mode: 'solo' }, host);
  const h = await client(s, 'host', host);
  const phones = await Promise.all(profiles.map((p) => client(s, 'player', p.token)));
  for (const ph of phones) ph.send({ t: 'join' });
  await h.waitState((g) => g?.competitors.length === names.length);
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  return { s, h, phones, profiles };
}

describe('fair buzzer timing over the socket (R6-22/23)', () => {
  it('the press made first wins even when it arrives second; phones see the result; host sees gaps', async () => {
    const { h, phones, profiles } = await game(['Alex', 'Sam']);
    const [pa, ps] = phones;
    pa.clockOffset = 5_000_000; // phones' clocks have nothing to do with the server's
    ps.clockOffset = -123_456;
    for (const p of phones) p.syncReplies = true;
    await h.act({ type: 'selectClue', clueId: 'hist_1' }); // starts a burst of clock probes
    await sleep(800);
    await h.act({ type: 'unlockBuzzers' });
    await sleep(300);
    // Sam's press reaches the server first; Alex pressed 15 ms earlier on a slower link.
    const now = performance.now();
    ps.send({ t: 'buzz', p: now + ps.clockOffset, e: 0 });
    await sleep(5);
    pa.send({ t: 'buzz', p: now - 15 + pa.clockOffset, e: 0 });
    const g = await h.waitState((x) => !!x?.buzzer.winner);
    expect(h.state!.profiles[g!.buzzer.winner!.profileId!]?.name ?? g!.buzzer.winner!.profileId).toBe('Alex');
    expect(g!.buzzer.winner!.profileId).toBe(profiles[0].id);
    const late = await ps.waitState((_x, me) => !!me?.buzzTiming);
    expect(ps.me.buzzTiming).toMatchObject({ result: 'late', otherProfileId: profiles[0].id });
    expect(ps.me.buzzTiming.gapMs).toBeGreaterThanOrEqual(10);
    expect(ps.me.buzzTiming.gapMs).toBeLessThanOrEqual(20);
    expect(ps.me.buzzTiming.confident).toBe(false); // 15 ms is "very close"
    expect(late).toBeTruthy();
    await pa.waitState((_x, me) => me?.buzzTiming?.result === 'won');
    expect(h.state!.buzzer.timing?.map((t) => t.result)).toEqual(['won', 'late']);
    // Phones and TVs never see the host-only timing list.
    expect(pa.state!.buzzer).not.toHaveProperty('timing');
  });

  it('a phone that does not answer clock probes still buzzes (arrival order) without slowing anyone', async () => {
    const { h, phones, profiles } = await game(['Ann', 'Ben']);
    const [pa] = phones;
    await h.act({ type: 'selectClue', clueId: 'hist_2' });
    await h.act({ type: 'unlockBuzzers' });
    const t0 = Date.now();
    pa.send({ t: 'buzz', p: 1, e: 0 }); // nonsense timestamp from an unsynced phone
    await h.waitState((x) => x?.buzzer.winner?.profileId === profiles[0].id);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe('Final Jeopardy! waits for the host after the think time (R6-6)', () => {
  it('time up: timer gone on every screen, answers locked, nothing revealed until Begin Answer Reveals', async () => {
    const { s, h, phones, profiles } = await game(['Alex', 'Sam']);
    const tv = await client(s, 'public');
    const ids = profiles.map((p) => h.state!.competitors.find((c) => c.profileId === p.id)!.id);
    for (const id of ids) await h.act({ type: 'adjustScore', competitorId: id, delta: 500, note: 't' });
    // (R11-9: answers close at time-up with the 'timer' rule; the default waits for the host.)
    await h.act({ type: 'updateRules', rules: { ...h.state!.rules, finalClose: 'timer', timers: { ...h.state!.rules.timers, finalSeconds: 1 } } });
    await h.act({ type: 'startFinal' });
    await h.act({ type: 'finalNext' });
    for (const p of phones) p.send({ t: 'finalWager', amount: 100 });
    await h.waitState((g) => !!g?.final?.entries.every((e) => e.hasWager));
    await h.act({ type: 'finalNext' });
    phones[0].send({ t: 'finalAnswer', answer: 'Budapest', submit: true });
    for (const c of [h, tv]) await c.waitState((g) => g?.final?.stage === 'closed', 5000);
    expect(h.state!.timer).toBeNull();
    expect(tv.state!.timer).toBeNull();
    expect(tv.state!.final!.entries.every((e) => e.answer === null)).toBe(true);
    await sleep(300);
    expect(tv.state!.final!.stage).toBe('closed'); // no automatic reveal
    await h.act({ type: 'finalNext' });
    await tv.waitState((g) => g?.final?.stage === 'reveal' && g.final.cursor === 0);
  });
});
