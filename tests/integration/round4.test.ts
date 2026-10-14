// User feedback round 4: Final Jeopardy! submitted by players and revealed one at a time (R4-2),
// Return to the existing lobby across restarts and three consecutive games (R4-20), the
// Jeopardy!/Buzzinga sound pack (R4-1) with its defaults/migration (R4-6) and media-only clues (R4-10).
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, boot, createProfile, hostToken, sampleBoardId, tempDir, TestClient } from './helpers';
import { DEFAULT_TV_FX, normalizeTvFx } from '../../src/shared/tvFx';
import { boardStats, clueComplete, validateBoard } from '../../src/shared/boardUtils';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

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

/** A tiny valid WAV file (8 kHz mono, 100 samples of silence). */
function wav(): Buffer {
  const samples = 100;
  const b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(samples * 2, 40);
  return b;
}

describe('Final Jeopardy! (R4-2)', () => {
  it('players submit privately on their phones; reveal goes lowest → highest score; scores change only when judged', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    const [alex, sam, kim] = await Promise.all([createProfile(s, 'Alex'), createProfile(s, 'Sam'), createProfile(s, 'Kim')]);
    await api(s, 'POST', '/api/lobby', {}, host);
    await api(s, 'POST', '/api/games', { boardId: await sampleBoardId(s, host), mode: 'solo' }, host);
    const h = await client(s, 'host', host);
    const tv = await client(s, 'public');
    const phones = await Promise.all([alex, sam, kim].map((p) => client(s, 'player', p.token)));
    for (const ph of phones) ph.send({ t: 'join' });
    await h.waitState((g) => g?.competitors.length === 3);
    const cid = (pid: string) => h.state!.competitors.find((c) => c.profileId === pid)!.id;
    await h.act({ type: 'startGame' });
    await h.act({ type: 'introSkip' });
    await h.act({ type: 'adjustScore', competitorId: cid(alex.id), delta: 1000, note: 'test' });
    await h.act({ type: 'adjustScore', competitorId: cid(sam.id), delta: 400, note: 'test' });
    await h.act({ type: 'adjustScore', competitorId: cid(kim.id), delta: 400, note: 'test' });
    await h.act({ type: 'startFinal' });
    // Sam and Kim tie: join order decides (Sam joined before Kim).
    expect(h.state!.final!.order).toEqual([cid(sam.id), cid(kim.id), cid(alex.id)]);
    await h.act({ type: 'finalNext' });
    const [pa, ps, pk] = phones;
    pa.send({ t: 'finalWager', amount: 1000 }); // maximum
    ps.send({ t: 'finalWager', amount: 0 }); // zero
    await h.waitState((g) => g!.final!.entries.filter((e) => e.hasWager).length === 2);
    // Kim never wagers. Nobody — not the host, not the TV — sees amounts before the reveal.
    for (const view of [h.state!, tv.state!]) expect(view.final!.entries.every((e) => e.wager === null)).toBe(true);
    expect(JSON.stringify(h.state)).not.toContain('"wager":1000');
    expect(pa.me.final).toEqual({ wager: 1000, answer: null }); // own submission only
    expect(ps.me.final).toEqual({ wager: 0, answer: null });
    await h.act({ type: 'finalNext' }); // lock wagers (Kim → 0), clue + think time
    pa.send({ t: 'finalAnswer', answer: 'Alexs guess Budapesht' });
    ps.send({ t: 'finalAnswer', answer: 'Vienna' });
    await h.waitState((g) => g!.final!.entries.filter((e) => e.hasAnswer).length === 2);
    expect(JSON.stringify(h.state)).not.toContain('Budapesht');
    expect(JSON.stringify(tv.state)).not.toContain('Budapesht');
    // Kim's phone drops out and comes back: still in the Final, nothing lost.
    pk.close();
    const pk2 = await client(s, 'player', kim.token);
    await pk2.waitState((g) => g?.phase === 'final');
    expect(pk2.me.final).toEqual({ wager: 0, answer: null });
    // The host's controller reconnects mid-Final.
    h.close();
    const h2 = await client(s, 'host', host);
    await h2.waitState((g) => g?.final?.stage === 'clue');
    await h2.act({ type: 'finalNext' }); // close answers → reveal
    const reveal = async (pid: string, correct: boolean) => {
      await h2.act({ type: 'finalReveal' }); // wager
      await h2.act({ type: 'finalReveal' }); // answer
      await h2.act({ type: 'judgeFinal', competitorId: cid(pid), correct });
      await h2.act({ type: 'finalReveal' }); // next
    };
    await h2.act({ type: 'finalReveal' });
    await tv.waitState((g) => g!.final!.step === 'wager');
    expect(tv.state!.final!.entries.find((e) => e.competitorId === cid(sam.id))).toMatchObject({ wager: 0, answer: null });
    await h2.act({ type: 'finalReveal' });
    await tv.waitState((g) => g!.final!.entries.find((e) => e.competitorId === cid(sam.id))?.answer === 'Vienna');
    expect(tv.state!.final!.entries.find((e) => e.competitorId === cid(alex.id))?.answer).toBeNull();
    await h2.act({ type: 'judgeFinal', competitorId: cid(sam.id), correct: false });
    await h2.act({ type: 'finalReveal' });
    await reveal(kim.id, false);
    expect(h2.state!.competitors.find((c) => c.profileId === alex.id)!.score).toBe(1000); // not judged yet
    await reveal(alex.id, true);
    expect(h2.state!.final!.stage).toBe('done');
    await h2.act({ type: 'endGame' });
    const scores = Object.fromEntries(h2.state!.competitors.map((c) => [c.profileId, c.score]));
    expect(scores).toEqual({ [alex.id]: 2000, [sam.id]: 400, [kim.id]: 400 });
    // Wagers and answers are kept in the game history.
    const hist = (await api(s, 'GET', `/api/history/${h2.state!.id}`, undefined, host)).data;
    expect(JSON.stringify(hist)).toContain('Budapesht');
  });
});

describe('Return to the existing lobby (R4-20)', () => {
  it('survives an app restart and works for three games in a row without anyone rejoining', async () => {
    const dataDir = tempDir();
    let s = await boot(dataDir);
    servers.push(s);
    const host = await hostToken(s);
    const [alex, sam] = await Promise.all([createProfile(s, 'Alex'), createProfile(s, 'Sam')]);
    await api(s, 'POST', '/api/lobby', { name: 'Friday' }, host);
    await api(s, 'POST', '/api/games', { boardId: await sampleBoardId(s, host), mode: 'solo' }, host);
    let h = await client(s, 'host', host);
    for (const p of [alex, sam]) (await client(s, 'player', p.token)).send({ t: 'join' });
    await h.waitState((g) => g?.competitors.length === 2);
    await h.act({ type: 'addBot', name: 'Robo Rita', level: 'easy' });
    const roomCode = h.state!.roomCode;

    // The game computer restarts during the first game: lobby and game come back.
    await h.act({ type: 'startGame' });
    await h.act({ type: 'introSkip' });
    h.close();
    await s.close();
    servers.splice(servers.indexOf(s), 1);
    s = await boot(dataDir);
    servers.push(s);
    expect((await api(s, 'GET', '/api/lobby', undefined, host)).data.lobby).toMatchObject({ name: 'Friday' });
    h = await client(s, 'host', host);
    const tv = await client(s, 'public');
    const phones = [await client(s, 'player', alex.token), await client(s, 'player', sam.token)];
    await h.waitState((g) => g?.phase === 'board');
    const ids: string[] = [h.state!.id];

    for (let game = 1; game <= 3; game++) {
      if (game > 1) {
        await h.act({ type: 'startGame' });
        await h.act({ type: 'introSkip' });
      }
      const winner = game % 2 ? alex.id : sam.id;
      const wc = h.state!.competitors.find((c) => c.profileId === winner)!.id;
      await h.act({ type: 'selectClue', clueId: 'hist_2' });
      await h.act({ type: 'unlockBuzzers' });
      await h.act({ type: 'hostBuzz', competitorId: wc });
      await h.act({ type: 'judge', result: 'correct' });
      await h.act({ type: 'closeClue' });
      await h.act({ type: 'endGame' });
      const r = await api(s, 'POST', '/api/games/current/rematch', {}, host);
      expect(r.status).toBe(200);
      const g = await h.waitState((x) => x?.phase === 'lobby' && x.id === r.data.id);
      ids.push(g!.id);
      // Same people, bot, room code; nothing from the last match; lobby still open.
      expect(g!.competitors.map((c) => c.profileId ?? c.name).sort()).toEqual([alex.id, sam.id, 'Robo Rita'].sort());
      expect(g!.competitors.filter((c) => c.bot)).toEqual([expect.objectContaining({ bot: 'easy' })]);
      expect(g!.roomCode).toBe(roomCode);
      expect(g!.competitors.every((c) => c.score === 0)).toBe(true);
      expect(g!.buzzer.winner ?? null).toBeNull();
      expect(g!.final).toBeNull();
      expect(g!.timer).toBeNull();
      expect((await api(s, 'GET', '/api/lobby', undefined, host)).data.lobby).toMatchObject({ name: 'Friday' });
      // Phones are still in the game without joining again.
      for (const [i, ph] of phones.entries()) await ph.waitState((x) => x?.id === g!.id && !!x.competitors.some((c) => c.profileId === [alex.id, sam.id][i]));
      await tv.waitState((x) => x?.id === g!.id);
    }
    expect(new Set(ids).size).toBe(4);
    const hist = (await api(s, 'GET', '/api/history', undefined, host)).data as { id: string }[];
    for (const id of ids.slice(0, 3)) expect(hist.map((x) => x.id)).toContain(id);
    const st = (await api(s, 'GET', `/api/stats/profiles/${alex.id}`, undefined, host)).data.stats;
    expect(st.solo.games).toMatchObject({ played: 3, wins: 2 });
    const profiles = (await api(s, 'GET', '/api/profiles')).data as { name: string }[];
    expect(profiles.filter((p) => p.name === 'Alex')).toHaveLength(1);
  });
});

describe('Jeopardy!/Buzzinga sound pack (R4-1)', () => {
  it('is the default; old Classic / side-edge defaults move to the new defaults, explicit choices stay', () => {
    expect(DEFAULT_TV_FX.soundPack).toBe('buzzinga');
    expect(DEFAULT_TV_FX.unlock.style).toBe('bottom');
    const old = { boardIntro: true, introSpeed: 'normal', unlock: { style: 'edges', color: '', intensity: 'medium', durationMs: 1200, persist: true, label: true }, soundPack: 'classic', cues: {}, customSounds: {} };
    expect(normalizeTvFx(old)).toMatchObject({ soundPack: 'buzzinga', unlock: { style: 'bottom' }, v: 2 });
    expect(normalizeTvFx({ ...old, soundPack: 'arcade', unlock: { ...old.unlock, style: 'dot' } })).toMatchObject({ soundPack: 'arcade', unlock: { style: 'dot' } });
    expect(normalizeTvFx({ ...old, soundPack: 'soft' }).soundPack).toBe('soft');
    expect(normalizeTvFx({ ...old, soundPack: 'off' }).soundPack).toBe('off');
    // Saved with the new version: Classic is an explicit choice and is kept.
    expect(normalizeTvFx({ ...old, v: 2, unlock: { ...old.unlock, style: 'edges' } })).toMatchObject({ soundPack: 'classic', unlock: { style: 'edges' } });
  });

  it('serves bundled files by name, lets the host install/replace/remove files, and refuses bad ones', async () => {
    const bundled = tempDir();
    fs.writeFileSync(path.join(bundled, 'board_fill.wav'), wav());
    fs.writeFileSync(path.join(bundled, 'Final Jeopardy Think.wav'), wav());
    fs.writeFileSync(path.join(bundled, 'clue background.jpg'), Buffer.from('not audio'));
    const s = await boot(tempDir(), { soundPackDirs: [bundled] });
    servers.push(s);
    const host = await hostToken(s);
    const pub = (await api(s, 'GET', '/api/settings/public')).data;
    expect(pub.tvFx.soundPack).toBe('buzzinga');
    expect(pub.packFiles).toEqual({ boardIntro: '/media/pack/bundled/board_fill.wav', finalThink: '/media/pack/bundled/Final%20Jeopardy%20Think.wav' });
    const got = await fetch(s.url + pub.packFiles.finalThink);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toContain('audio/wav');
    expect((await fetch(s.url + '/media/pack/bundled/..%2F..%2Fsecret.wav')).status).toBe(404);
    expect((await fetch(s.url + '/media/pack/other/board_fill.wav')).status).toBe(404);

    const upload = async (files: [string, Buffer][], auth = true) => {
      const fd = new FormData();
      for (const [name, buf] of files) fd.append('files', new Blob([new Uint8Array(buf)]), name);
      const res = await fetch(s.url + '/api/soundpacks/buzzinga', { method: 'POST', body: fd, headers: auth ? { authorization: `Bearer ${host}` } : {} });
      return { status: res.status, data: await res.json() };
    };
    expect((await upload([['buzzed_in.wav', wav()]], false)).status).toBe(401);
    const r = await upload([
      ['buzzed_in.wav', wav()],
      ['board_fill.wav', wav()],
      ['mystery.wav', wav()],
      ['correct_answer.mp3', Buffer.from('<script>not audio</script>')],
    ]);
    expect(r.status).toBe(200);
    expect(r.data.installed.sort()).toEqual(['board_fill.wav', 'buzzed_in.wav']);
    expect(r.data.rejected.map((x: { name: string }) => x.name).sort()).toEqual(['correct_answer.mp3', 'mystery.wav']);
    const pub2 = (await api(s, 'GET', '/api/settings/public')).data.packFiles;
    expect(pub2.boardIntro).toBe('/media/pack/installed/board_fill.wav'); // installed wins over bundled
    expect(pub2.buzz).toBe('/media/pack/installed/buzzed_in.wav');
    // Replacing a cue removes the earlier file for it.
    await upload([['Buzzed In (new).wav', wav()]]);
    const dir = path.join(s.dataDir, 'media', 'soundpacks', 'buzzinga');
    expect(fs.readdirSync(dir).sort()).toEqual(['Buzzed In (new).wav', 'board_fill.wav']);
    await api(s, 'DELETE', `/api/soundpacks/buzzinga/${encodeURIComponent('board_fill.wav')}`, undefined, host);
    expect((await api(s, 'GET', '/api/settings/public')).data.packFiles.boardIntro).toBe('/media/pack/bundled/board_fill.wav');
    await api(s, 'DELETE', '/api/soundpacks/buzzinga', undefined, host);
    expect(fs.readdirSync(dir)).toEqual([]);
    expect((await api(s, 'GET', '/api/soundpacks')).status).toBe(401);
  });

  it('works without any sound files (public release): the pack is selectable and every cue falls back', async () => {
    const s = await boot();
    servers.push(s);
    const pub = (await api(s, 'GET', '/api/settings/public')).data;
    expect(pub.tvFx.soundPack).toBe('buzzinga');
    expect(pub.packFiles).toEqual({});
  });
});

describe('media-only clues (R4-10)', () => {
  it('count as complete and raise no "missing question" warning', () => {
    const board = structuredClone(SAMPLE_BOARD);
    const clue = board.rounds[0].categories[0].clues[0];
    clue.question = '';
    clue.media = [{ kind: 'image', url: '/media/clues/x.webp' }];
    expect(clueComplete(clue)).toBe(true);
    expect(validateBoard(board).filter((i) => i.message.includes(`${clue.value}:`) && i.message.includes(board.rounds[0].categories[0].name))).toEqual([]);
    for (const kind of ['audio', 'video'] as const) expect(clueComplete({ ...clue, media: [{ kind, url: '/media/clues/a' }] })).toBe(true);
    expect(clueComplete({ ...clue, media: [] })).toBe(false);
    expect(clueComplete({ ...clue, media: [{ kind: 'image', url: '' }] })).toBe(false); // broken media is not a clue
    expect(clueComplete({ ...clue, answer: '' })).toBe(false); // the answer is still required
    const before = boardStats(SAMPLE_BOARD).complete;
    expect(boardStats(board).complete).toBe(before);
  });
});
