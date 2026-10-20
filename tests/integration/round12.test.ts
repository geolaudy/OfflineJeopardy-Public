// Round 12 over real sockets: Play as Guest (R12-11) and the lobby buzzer test (R12-12).
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { api, boot, createProfile, hostToken, sampleBoardId, TestClient } from './helpers';

const servers: { close: () => Promise<void> }[] = [];
afterAll(async () => {
  for (const s of servers) await s.close();
});
const client = (s: { url: string }, role: 'host' | 'public' | 'player', token?: string) => TestClient.connect(s, role, token);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const guest = async (s: { url: string }, name: string) => {
  const r = await api(s, 'POST', '/api/guests', { name });
  expect(r.status, JSON.stringify(r.data)).toBe(200);
  return { id: r.data.profile.id as string, token: r.data.token as string, profile: r.data.profile };
};

describe('Play as Guest (R12-11)', () => {
  it('joins with a nickname only, plays, reconnects, stays out of profiles and leaderboards, and is cleaned up', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    // No lobby, no guests (the portal is for joining a game).
    expect((await api(s, 'POST', '/api/guests', { name: 'Early' })).status).toBe(409);
    await api(s, 'POST', '/api/lobby', {}, host);
    await api(s, 'POST', '/api/games', { boardId: await sampleBoardId(s, host), mode: 'solo' }, host);
    expect((await api(s, 'POST', '/api/guests', { name: '' })).status).toBe(400);
    expect((await api(s, 'POST', '/api/guests', { name: 'x'.repeat(31) })).status).toBe(400);

    const ann = await createProfile(s, 'Ann');
    const g1 = await guest(s, 'Quiz Kid');
    const g2 = await guest(s, 'Lurker'); // never joins the game
    expect(g1.profile).toMatchObject({ name: 'Quiz Kid', guest: true });
    expect(g1.id).not.toBe(g2.id);
    // Not a profile anyone can pick or sign in to.
    const listed = (await api(s, 'GET', '/api/profiles')).data as { id: string }[];
    expect(listed.map((p) => p.id)).toEqual([ann.id]);
    expect((await api(s, 'POST', `/api/profiles/${g1.id}/login`, { pin: '0000' })).status).toBe(404);
    expect((await api(s, 'POST', '/api/me/pin', { currentPin: '0000', newPin: '1111' }, g1.token)).status).toBe(400);
    expect((await api(s, 'GET', '/api/me', undefined, g1.token)).data).toMatchObject({ id: g1.id, guest: true });

    const h = await client(s, 'host', host);
    const tv = await client(s, 'public');
    const pa = await client(s, 'player', ann.token);
    const pg = await client(s, 'player', g1.token);
    pa.send({ t: 'join' });
    pg.send({ t: 'join' });
    await h.waitState((g) => g?.competitors.length === 2);
    expect(h.state!.profiles[g1.id]).toMatchObject({ name: 'Quiz Kid', guest: true });

    // The guest renames themselves in the lobby: every screen follows.
    expect((await api(s, 'PATCH', '/api/me', { name: 'Quiz Champ' }, g1.token)).status).toBe(200);
    for (const c of [h, tv, pa, pg]) await c.waitState((g) => g?.profiles[g1.id]?.name === 'Quiz Champ');

    // A guest plays like anyone: buzz in, score.
    await h.act({ type: 'startGame' });
    await h.act({ type: 'introSkip' });
    const clue = h.state!.rounds[h.state!.roundIndex].categories[0].clues[0];
    await h.act({ type: 'selectClue', clueId: clue.id });
    await h.waitState((g) => g?.clue?.stage === 'question');
    await h.act({ type: 'unlockBuzzers' });
    await pg.waitState((g, me) => g?.buzzer.status === 'open' && !!me?.canBuzz);
    pg.send({ t: 'buzz' });
    await h.waitState((g) => g?.buzzer.winner?.profileId === g1.id);
    await h.act({ type: 'judge', result: 'correct' });
    const mine = () => h.state!.competitors.find((c) => c.profileId === g1.id)!;
    await h.waitState(() => mine().score === clue.value);

    // Reconnecting with the same token: the same player, the same score.
    pg.close();
    const again = await client(s, 'player', g1.token);
    await again.waitState((g, me) => !!me?.competitorId && me.competitorId === mine().id);

    // The game ends: the guest has a result in this game's history, but no leaderboard entry.
    await h.act({ type: 'endGame' });
    await h.waitState((g) => g?.phase === 'ended');
    const lb = await api(s, 'GET', '/api/stats/leaderboard', undefined, host);
    expect(lb.status).toBe(200);
    expect(JSON.stringify(lb.data)).not.toContain(g1.id);
    expect(JSON.stringify(lb.data)).toContain(ann.id);

    // Closing the lobby removes the guest who never played; the one who played stays hidden.
    for (const c of [h, tv, pa, again]) c.close();
    expect((await api(s, 'DELETE', '/api/lobby', undefined, host)).status).toBe(200);
    const db = new DatabaseSync(path.join((s as unknown as { dataDir: string }).dataDir, 'offlinejeopardy.db'), { readOnly: true });
    const rows = db.prepare('SELECT id, guest FROM profiles WHERE guest = 1').all() as { id: string }[];
    db.close();
    expect(rows.map((r) => r.id)).toEqual([g1.id]);
    expect((await api(s, 'GET', '/api/me', undefined, g2.token)).status).toBe(401);
    expect((await api(s, 'GET', '/api/profiles')).data.map((p: { id: string }) => p.id)).toEqual([ann.id]);
  });
});

describe('Lobby buzzer test (R12-12)', () => {
  it('lights the player card on every screen, for repeated and simultaneous presses, with no game effect', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    await api(s, 'POST', '/api/lobby', {}, host);
    await api(s, 'POST', '/api/games', { boardId: await sampleBoardId(s, host), mode: 'solo' }, host);
    const ann = await createProfile(s, 'Ann');
    const ben = await createProfile(s, 'Ben');
    const h = await client(s, 'host', host);
    const tv = await client(s, 'public');
    const pa = await client(s, 'player', ann.token);
    const pb = await client(s, 'player', ben.token);
    pa.send({ t: 'join' });
    pb.send({ t: 'join' });
    await h.waitState((g) => g?.competitors.length === 2);
    const before = JSON.stringify({ ...h.state, online: undefined, serverTime: undefined });
    const eventsBefore = h.state!.undoLabel;
    const buzzesOf = (c: TestClient, pid: string) => c.messages.filter((m) => (m as { t: string }).t === 'lobbyBuzz' && (m as { profileId: string }).profileId === pid).length;

    // One press: every screen hears it, with the right player.
    pa.send({ t: 'buzz' });
    for (const c of [h, tv, pa, pb]) await c.seen((m) => (m as { t: string }).t === 'lobbyBuzz' && (m as { profileId: string }).profileId === ann.id);
    const r = (await pa.seen((m) => (m as { t: string }).t === 'buzzResult')) as unknown as { ok: boolean; info: string };
    expect(r).toMatchObject({ ok: true, info: 'lobby-test' });
    // Repeated presses (slower than the finger-bounce guard) and two phones at once.
    await sleep(200);
    pa.send({ t: 'buzz' });
    pb.send({ t: 'buzz' });
    await tv.wait((m) => (m as { t: string }).t === 'lobbyBuzz' && (m as { profileId: string }).profileId === ben.id);
    await sleep(150);
    expect(buzzesOf(tv, ann.id)).toBe(2);
    expect(buzzesOf(h, ben.id)).toBe(1);

    // Nothing about the game changed: still the lobby, no scores, no buzzer state, nothing to undo.
    await sleep(100);
    const after = h.state!;
    expect(after.phase).toBe('lobby');
    expect(after.competitors.every((c) => c.score === 0)).toBe(true);
    expect(after.buzzer.winner).toBeFalsy();
    expect(after.timer).toBeFalsy();
    expect(after.undoLabel).toBe(eventsBefore);
    expect(JSON.stringify({ ...after, online: undefined, serverTime: undefined })).toBe(before);

    // Once the game runs, a press is a real buzz again (not a lobby test).
    await h.act({ type: 'startGame' });
    await h.act({ type: 'introSkip' });
    const lobbyBuzzes = tv.messages.filter((m) => (m as { t: string }).t === 'lobbyBuzz').length;
    pb.send({ t: 'buzz' });
    await pb.wait((m) => (m as { t: string }).t === 'buzzResult');
    await sleep(100);
    expect(tv.messages.filter((m) => (m as { t: string }).t === 'lobbyBuzz').length).toBe(lobbyBuzzes);
    for (const c of [h, tv, pa, pb]) c.close();
  });
});

describe('Wi-Fi details near the join QR (R12-13)', () => {
  it('host-only, off by default, password only when revealed, never stored, gone with the lobby', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    const ann = await createProfile(s, 'Ann');
    expect((await api(s, 'GET', '/api/host/wifi')).status).toBe(401);
    expect((await api(s, 'GET', '/api/host/wifi', undefined, ann.token)).status).toBeGreaterThanOrEqual(401);
    expect((await api(s, 'PUT', '/api/host/wifi', { show: true }, host)).status).toBe(409); // no lobby yet
    await api(s, 'POST', '/api/lobby', {}, host);
    const tv = await client(s, 'public');
    const tvWifi = () => [...tv.messages].reverse().find((m) => (m as { t: string }).t === 'presentation') as unknown as { lobby: { wifi?: { ssid: string; password?: string } } } | undefined;

    const first = (await api(s, 'GET', '/api/host/wifi', undefined, host)).data;
    expect(first).toMatchObject({ show: false, showPassword: false, shared: null });
    // Typed by the host (this test machine may have no Wi-Fi at all).
    const PW = 'pw-R12-secret-123';
    let r = await api(s, 'PUT', '/api/host/wifi', { show: true, manualSsid: 'Party WiFi', manualPassword: PW }, host);
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ show: true, manualSsid: 'Party WiFi', hasManualPassword: true, shared: { ssid: 'Party WiFi', password: false } });
    expect(JSON.stringify(r.data)).not.toContain(PW); // the host's view never carries the password
    await tv.seen((m) => (m as { t: string }).t === 'presentation' && (m as unknown as { lobby: { wifi?: { ssid: string } } }).lobby?.wifi?.ssid === 'Party WiFi');
    expect(tvWifi()!.lobby.wifi).toEqual({ ssid: 'Party WiFi' }); // masked on the TV by default

    // The host reveals it: now (and only now) the TV gets it.
    r = await api(s, 'PUT', '/api/host/wifi', { showPassword: true }, host);
    expect(r.data.shared).toEqual({ ssid: 'Party WiFi', password: true });
    await tv.seen((m) => (m as { t: string }).t === 'presentation' && (m as unknown as { lobby: { wifi?: { password?: string } } }).lobby?.wifi?.password === PW);
    expect((await api(s, 'POST', '/api/host/wifi/reveal', undefined, host)).data.password).toBe(PW);
    expect((await api(s, 'POST', '/api/host/wifi/reveal', undefined, ann.token)).status).toBeGreaterThanOrEqual(401);
    // Hidden again.
    await api(s, 'PUT', '/api/host/wifi', { show: false }, host);
    for (let i = 0; i < 50 && tvWifi()?.lobby.wifi; i++) await sleep(20);
    expect(tvWifi()!.lobby.wifi).toBeUndefined();

    // Never written anywhere in the data folder (database, logs).
    const dataDir = (s as unknown as { dataDir: string }).dataDir;
    const files = fs.readdirSync(dataDir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile());
    for (const f of files) expect(fs.readFileSync(path.join(f.parentPath, f.name)).includes(PW), f.name).toBe(false);

    // A new lobby starts without the old details.
    await api(s, 'DELETE', '/api/lobby', undefined, host);
    await api(s, 'POST', '/api/lobby', {}, host);
    expect((await api(s, 'GET', '/api/host/wifi', undefined, host)).data).toMatchObject({ show: false, manualSsid: '', hasManualPassword: false, shared: null });
    tv.close();
  });
});
