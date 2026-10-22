// User feedback round 5 over the real server: wagers only when the host opens them, also against
// hand-written WebSocket messages (R5-18); Daily Double! wagers from the phone (R5-20); Final
// answers submitted / changed (R5-19); undo back into answering restarts the timer for everyone
// (R5-15); uploaded profile pictures survive choosing a default picture (R5-16).
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
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

async function soloGame(names: string[]) {
  const s = await boot();
  servers.push(s);
  const host = await hostToken(s);
  const profiles = await Promise.all(names.map((n) => createProfile(s, n)));
  await api(s, 'POST', '/api/lobby', {}, host);
  await api(s, 'POST', '/api/games', { boardId: await sampleBoardId(s, host), mode: 'solo' }, host);
  const h = await client(s, 'host', host);
  const tv = await client(s, 'public');
  const phones = await Promise.all(profiles.map((p) => client(s, 'player', p.token)));
  for (const ph of phones) ph.send({ t: 'join' });
  await h.waitState((g) => g?.competitors.length === names.length);
  const cid = (pid: string) => h.state!.competitors.find((c) => c.profileId === pid)!.id;
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  return { s, host, h, tv, phones, profiles, cid };
}
const result = (c: TestClient) => c.wait((m) => m.t === 'result');

describe('wagering permissions (R5-18) and Final answers (R5-19, R5-15)', () => {
  it('rejects early and late wagers sent directly over the socket; Change answer turns the TV gray; undo restarts the think time', async () => {
    const { h, tv, phones, profiles, cid } = await soloGame(['Alex', 'Sam']);
    const [pa, ps] = phones;
    const [alex, sam] = profiles;
    await h.act({ type: 'adjustScore', competitorId: cid(alex.id), delta: 1000, note: 'test' });
    await h.act({ type: 'adjustScore', competitorId: cid(sam.id), delta: 600, note: 'test' });
    await h.act({ type: 'startFinal' });
    // A hand-written message before the host opens wagering is refused.
    let r = result(pa);
    pa.send({ t: 'finalWager', amount: 500 });
    expect(await r).toMatchObject({ ok: false });
    expect(h.state!.final!.entries.every((e) => !e.hasWager)).toBe(true);
    await h.act({ type: 'finalNext' });
    r = result(pa);
    pa.send({ t: 'finalWager', amount: 500 });
    expect(await r).toMatchObject({ ok: true });
    ps.send({ t: 'finalWager', amount: 600 });
    await h.waitState((g) => g!.final!.entries.every((e) => e.hasWager));
    await h.act({ type: 'finalNext' }); // wagers locked, think time runs
    r = result(pa);
    pa.send({ t: 'finalWager', amount: 1 });
    expect(await r).toMatchObject({ ok: false });

    // Submitted → green; Change answer → gray (the old answer still counts) → resubmitted → green.
    pa.send({ t: 'finalAnswer', answer: 'Vienna', submit: true });
    const tvEntry = (g: any) => g?.final?.entries.find((e: any) => e.competitorId === cid(alex.id));
    await tv.waitState((g) => tvEntry(g)?.submitted === true);
    expect(tvEntry(tv.state).answer).toBeNull(); // never the text
    pa.send({ t: 'finalAnswer', answer: 'Vienna', submit: false });
    await tv.waitState((g) => tvEntry(g)?.submitted === false);
    await pa.waitState((_g, me) => me?.final?.submitted === false && me.final.answer === 'Vienna');
    pa.send({ t: 'finalAnswer', answer: 'Salzburg', submit: true });
    await tv.waitState((g) => tvEntry(g)?.submitted === true);
    ps.send({ t: 'finalAnswer', answer: 'Graz', submit: true });
    await h.waitState((g) => g!.final!.entries.every((e) => e.submitted));

    await h.act({ type: 'finalNext' }); // close answers (the reveal waits for the host, R6-6)
    r = result(pa);
    pa.send({ t: 'finalAnswer', answer: 'too late', submit: true });
    expect(await r).toMatchObject({ ok: false });
    // Undo: back to answering with the full think time running on every screen.
    await h.act({ type: 'undo' });
    for (const c of [h, tv, pa]) await c.waitState((g) => g?.final?.stage === 'clue' && g.timer?.kind === 'final' && g.timer.running === true);
    expect(h.state!.timer!.remainingMs).toBe(h.state!.timer!.durationMs);
    await pa.waitState((_g, me) => me?.final?.answer === 'Salzburg' && me.final.submitted === true);
  });

  it('Daily Double!: the picking player wagers on their phone, the host locks it, then the clue shows', async () => {
    const { h, tv, phones, profiles, cid } = await soloGame(['Alex', 'Sam']);
    const [pa, ps] = phones;
    const [alex] = profiles;
    await h.act({ type: 'updateRules', rules: { ...h.state!.rules, dailyWagerEntry: 'player' } }); // R17-2: the phone entry
    await h.act({ type: 'setControl', competitorId: cid(alex.id) });
    await h.act({ type: 'selectClue', clueId: 'sci_4' }); // the sample board's Daily Double!
    await pa.waitState((_g, me) => !!me?.dailyWager);
    expect(ps.me?.dailyWager ?? null).toBeNull();
    // R16-7: locked until the host unlocks the wager.
    let r = result(pa);
    pa.send({ t: 'dailyWager', amount: 400 });
    expect(await r).toMatchObject({ ok: false });
    await h.act({ type: 'openDailyWager' });
    await pa.waitState((_g, me) => !!me?.dailyWager?.open);
    r = result(ps);
    ps.send({ t: 'dailyWager', amount: 100 }); // not Sam's Daily Double!
    expect(await r).toMatchObject({ ok: false });
    r = result(pa);
    pa.send({ t: 'dailyWager', amount: 400 });
    expect(await r).toMatchObject({ ok: true });
    await h.waitState((g) => g?.clue?.pendingWager?.amount === 400);
    expect(tv.state!.clue!.question).toBeNull();
    expect(tv.state!.clue!.pendingWager?.amount ?? null).toBeNull();
    await h.act({ type: 'setDailyWager', competitorId: cid(alex.id), amount: 400, profileId: alex.id });
    await tv.waitState((g) => !!g?.clue?.question && g.clue.wager?.amount === 400);
    r = result(pa);
    pa.send({ t: 'dailyWager', amount: 500 }); // closed
    expect(await r).toMatchObject({ ok: false });
    expect(h.state!.clue!.wager!.amount).toBe(400);
  });
});

describe('profile pictures (R5-16)', () => {
  it('choosing a default picture keeps the upload; switching back restores it', async () => {
    const s = await boot();
    servers.push(s);
    const alex = await createProfile(s, 'Alex');
    const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#00ff00' } }).png().toBuffer();
    const fd = new FormData();
    fd.append('file', new Blob([png], { type: 'image/png' }), 'me.png');
    const up = await (await fetch(s.url + '/api/me/picture', { method: 'POST', headers: { authorization: `Bearer ${alex.token}` }, body: fd })).json();
    expect(up.pictureUrl).toMatch(/\.webp$/);
    const off = await api(s, 'PATCH', '/api/me', { avatar: 'owl', usePicture: false }, alex.token);
    expect(off.data).toMatchObject({ pictureUrl: null, avatar: 'owl', uploadedPictureUrl: up.pictureUrl });
    expect((await fetch(s.url + up.pictureUrl)).status).toBe(200); // the file is still there
    const pub = await api(s, 'GET', '/api/profiles');
    expect(pub.data.find((p: { id: string }) => p.id === alex.id).pictureUrl).toBeNull();
    const on = await api(s, 'PATCH', '/api/me', { usePicture: true }, alex.token);
    expect(on.data.pictureUrl).toBe(up.pictureUrl);
  });
});

describe('Jeopardy!/Buzzinga sound folders (R5-9)', () => {
  it('uses every existing folder (missing ones are skipped); the first folder wins per sound', async () => {
    const { default: fs } = await import('node:fs');
    const { default: path } = await import('node:path');
    const { tempDir } = await import('./helpers');
    const resources = tempDir();
    const beside = tempDir();
    fs.writeFileSync(path.join(resources, 'buzzed_in.mp3'), Buffer.from('ID3a'));
    fs.writeFileSync(path.join(beside, 'buzzed_in.mp3'), Buffer.from('ID3b'));
    fs.writeFileSync(path.join(beside, 'winner applause.mp3'), Buffer.from('ID3c'));
    const s = await boot(undefined, { soundPackDirs: [path.join(resources, 'missing'), resources, beside] });
    servers.push(s);
    const files = (await api(s, 'GET', '/api/settings/public')).data.packFiles;
    expect(files).toEqual({ buzz: '/media/pack/bundled/buzzed_in.mp3', winner: '/media/pack/bundled/winner%20applause.mp3' });
    expect(await (await fetch(s.url + files.buzz)).text()).toBe('ID3a'); // from the first folder
    expect(await (await fetch(s.url + files.winner)).text()).toBe('ID3c'); // only in the second
  });
});
