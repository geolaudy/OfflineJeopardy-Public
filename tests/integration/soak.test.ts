// Soak play-test over WebSockets: six phones buzz at the same moment, drop out and come back while
// the host plays clues, a Final Jeopardy! and three Return-to-Lobby cycles. Host, TV and phones
// must always agree, nothing stale may carry over, and the server must keep answering.
import { afterEach, describe, expect, it } from 'vitest';
import { api, boot, createProfile, hostToken, sampleBoardId, TestClient } from './helpers';

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('soak play-test', () => {
  it('six phones, simultaneous buzzes, reconnects, a Final and three rematches stay consistent', async () => {
    const s = await boot(undefined, { logger: !!process.env.SOAK_LOG });
    servers.push(s);
    const host = await hostToken(s);
    const people = await Promise.all(['A', 'B', 'C', 'D', 'E', 'F'].map((n) => createProfile(s, `Soak ${n}`, '1234', '#1d4ed8')));
    await api(s, 'POST', '/api/lobby', {}, host);
    await api(s, 'POST', '/api/games', { boardId: await sampleBoardId(s, host), mode: 'solo', rules: undefined }, host);
    const h = await client(s, 'host', host);
    const tv = await client(s, 'public');
    let phones = await Promise.all(people.map((p) => client(s, 'player', p.token)));
    for (const ph of phones) ph.send({ t: 'join' });
    await h.waitState((g) => g?.competitors.length === 6);
    // Everyone preferred the same blue: all six colours must still differ.
    expect(new Set(Object.values(h.state!.profiles).map((p) => p.color)).size).toBe(6);

    const consistent = async () => {
      await sleep(150);
      const want = Object.fromEntries(h.state!.competitors.map((c) => [c.id, c.score]));
      for (const v of [tv.state!, ...phones.map((p) => p.state!)]) {
        expect(v.id).toBe(h.state!.id);
        expect(Object.fromEntries(v.competitors.map((c) => [c.id, c.score]))).toEqual(want);
      }
    };

    for (let game = 0; game < 3; game++) {
      if (game > 0) {
        const r = await api(s, 'POST', '/api/games/current/rematch', {}, host);
        expect(r.status).toBe(200);
        await h.waitState((g) => g?.id === r.data.id && g?.phase === 'lobby');
        expect(h.state!.competitors).toHaveLength(6);
        expect(h.state!.competitors.every((c) => c.score === 0)).toBe(true);
      }
      await h.act({ type: 'startGame' });
      await h.act({ type: 'introSkip' }).catch(() => {});
      const clues = ['hist_1', 'geo_2', 'food_3', 'tech_1', 'words_2'];
      for (const [i, clueId] of clues.entries()) {
        await h.act({ type: 'selectClue', clueId });
        await h.act({ type: 'unlockBuzzers' }).catch(() => {}); // may already be open
        // All six press at once; exactly one wins.
        // (Arrival order decides; rotate who presses first so different players win.)
        for (const ph of [...phones.slice(i + game), ...phones.slice(0, i + game)]) ph.send({ t: 'buzz' });
        const g = await h.waitState((x) => !!x?.buzzer.winner);
        expect(g!.buzzer.queue.length).toBeLessThanOrEqual(5);
        // Someone drops out and comes back mid-clue.
        const k = (i + game) % phones.length;
        phones[k].close();
        phones[k] = await client(s, 'player', people[k].token);
        await phones[k].waitState((x) => x?.id === h.state!.id);
        await h.act({ type: 'judge', result: i % 2 ? 'correct' : 'incorrect' });
        if (h.state!.clue && !h.state!.clue.answerRevealed) await h.act({ type: 'revealAnswer', clueId });
        await h.act({ type: 'closeClue', clueId });
        await consistent();
      }
      // Final Jeopardy!: everyone with a positive score wagers half and answers on the phone.
      await h.act({ type: 'startFinal' });
      if (!h.state!.final!.entries.length) {
        // Nobody finished positive: straight to the results.
        await h.act({ type: 'endGame' });
        await h.waitState((x) => x?.phase === 'ended');
        await consistent();
        continue;
      }
      await h.act({ type: 'finalNext' });
      const f = h.state!.final!;
      for (const e of f.entries) {
        const idx = phones.findIndex((p) => p.me?.competitorId === e.competitorId);
        const score = h.state!.competitors.find((c) => c.id === e.competitorId)!.score;
        phones[idx].send({ t: 'finalWager', amount: Math.floor(score / 2) });
      }
      await h.waitState((x) => x!.final!.entries.every((e) => e.hasWager));
      await h.act({ type: 'finalNext' });
      for (const e of f.entries) phones[phones.findIndex((p) => p.me?.competitorId === e.competitorId)].send({ t: 'finalAnswer', answer: 'Budapest' });
      await h.waitState((x) => x!.final!.entries.every((e) => e.hasAnswer));
      await h.act({ type: 'finalNext' }); // close answers
      await h.act({ type: 'finalNext' }); // begin the reveal (R6-6)
      for (let n = 0; n < f.entries.length; n++) {
        if (process.env.SOAK_DBG) console.log('DBG', game, n, JSON.stringify(h.state!.final && { st: h.state!.final.stage, o: h.state!.final.order, c: h.state!.final.cursor, step: h.state!.final.step, e: h.state!.final.entries.length }), h.closed, h.messages.slice(-3).map((m) => m.t + ((m as any).ok === false ? ':' + (m as any).error : '')));
        await h.act({ type: 'finalReveal' });
        await h.act({ type: 'finalReveal' });
        await h.act({ type: 'judgeFinal', competitorId: h.state!.final!.order[h.state!.final!.cursor], correct: n % 2 === 0 });
        await h.act({ type: 'finalReveal' });
      }
      await h.waitState((x) => x?.final?.stage === 'done');
      await h.act({ type: 'endGame' });
      await h.waitState((x) => x?.phase === 'ended');
      await consistent();
    }
    // Statistics count every game once per player; nobody was duplicated.
    for (const p of people) {
      const st = (await api(s, 'GET', `/api/stats/profiles/${p.id}`, undefined, host)).data.stats;
      expect(st.solo.games.played).toBe(3);
    }
    expect((await api(s, 'GET', '/api/profiles')).data.filter((p: { name: string }) => p.name.startsWith('Soak '))).toHaveLength(6);
    // The server still answers promptly.
    expect((await api(s, 'GET', '/api/info')).status).toBe(200);
  }, 60_000);
});
