// R17-15: Settings → Data & Storage through the server: show the folder, check a destination, request
// a move, cancel it, refuse a restart during a game — then a real restart moves profiles, boards,
// history and media, and the moved data is what the next server uses.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, boot, createProfile, hostToken, sampleBoardId, tempDir, TestClient } from './helpers';
import { applyPendingMove, readBootstrap } from '../../src/server/dataLocation';

const servers: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close().catch(() => {});
});

describe('game data location (R17-15)', () => {
  it('without the Windows app hooks the folder is shown but cannot be changed', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    const r = await api(s, 'GET', '/api/admin/storage', undefined, host);
    expect(r.data).toMatchObject({ dataDir: path.resolve(s.dataDir), canChange: false, canPick: false });
    expect((await api(s, 'POST', '/api/admin/storage/move', { path: tempDir() }, host)).status).toBe(409);
    expect((await api(s, 'GET', '/api/admin/storage')).status).toBe(401); // host only
  });

  it('checks, requests and cancels a move; restarting is refused during a game; the next start moves everything', async () => {
    const root = tempDir();
    const def = path.join(root, 'data');
    const bootstrapFile = path.join(root, 'config.json');
    let relaunched = 0;
    const s = await boot(def, { storage: { bootstrapFile, defaultDir: def, relaunch: () => void relaunched++ } });
    servers.push(s);
    const host = await hostToken(s);
    const alex = await createProfile(s, 'Alex Ünïcode');
    await api(s, 'POST', '/api/lobby', {}, host);
    await api(s, 'POST', '/api/games', { boardId: await sampleBoardId(s, host), mode: 'solo' }, host);
    fs.mkdirSync(path.join(def, 'media', 'clues', 'x'), { recursive: true });
    fs.writeFileSync(path.join(def, 'media', 'clues', 'x', 'pic.png'), Buffer.alloc(5000, 1));

    let info = (await api(s, 'GET', '/api/admin/storage', undefined, host)).data;
    expect(info).toMatchObject({ isDefault: true, canChange: true, canPick: false, canRestart: true, pendingMove: null });
    expect(info.size.files).toBeGreaterThan(1);

    const dest = path.join(root, 'USB Stick', 'Quiz Abend');
    const check = (await api(s, 'POST', '/api/admin/storage/check', { path: dest }, host)).data;
    expect(check).toMatchObject({ ok: true, target: dest, existingData: false });
    expect((await api(s, 'POST', '/api/admin/storage/check', { path: path.join(def, 'inside') }, host)).data.ok).toBe(false);
    expect((await api(s, 'POST', '/api/admin/storage/move', { path: dest, mode: 'use' }, host)).status).toBe(400); // nothing to use there

    info = (await api(s, 'POST', '/api/admin/storage/move', { path: dest }, host)).data;
    expect(info.pendingMove).toMatchObject({ from: path.resolve(def), to: dest, mode: 'copy' });
    info = (await api(s, 'POST', '/api/admin/storage/cancel', {}, host)).data;
    expect(info.pendingMove).toBeNull();
    await api(s, 'POST', '/api/admin/storage/move', { path: dest }, host);

    expect((await api(s, 'POST', '/api/admin/restart', {}, host)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 400));
    expect(relaunched).toBe(1);

    // The restart: the old server stops, the move happens before the next one opens the database.
    await s.close();
    servers.length = 0;
    const now = await applyPendingMove(bootstrapFile, def);
    expect(now).toBe(dest);
    const s2 = await boot(now, { storage: { bootstrapFile, defaultDir: def } });
    servers.push(s2);
    const host2 = await hostToken(s2);
    const profiles = (await api(s2, 'GET', '/api/profiles')).data as { id: string; name: string }[];
    expect(profiles.map((p) => p.name)).toContain('Alex Ünïcode');
    expect(profiles.find((p) => p.name === 'Alex Ünïcode')?.id).toBe(alex.id); // same stable id
    expect(((await api(s2, 'GET', '/api/boards', undefined, host2)).data as unknown[]).length).toBeGreaterThan(0);
    expect(fs.statSync(path.join(dest, 'media', 'clues', 'x', 'pic.png')).size).toBe(5000);
    const info2 = (await api(s2, 'GET', '/api/admin/storage', undefined, host2)).data;
    expect(info2).toMatchObject({ dataDir: dest, isDefault: false, lastMove: { ok: true }, previousDataDir: path.resolve(def) });
    expect(fs.existsSync(path.join(def, 'offlinejeopardy.db'))).toBe(true); // the old folder is kept

    // Restore the default location (requested; carried out at the next start).
    const back = (await api(s2, 'POST', '/api/admin/storage/move', { toDefault: true }, host2)).data;
    expect(back.pendingMove).toMatchObject({ to: path.resolve(def) });
    await s2.close();
    servers.length = 0;
    expect(await applyPendingMove(bootstrapFile, def)).toBe(path.resolve(def));
    expect(readBootstrap(bootstrapFile).dataDir).toBeUndefined();
    const s3 = await boot(def, { storage: { bootstrapFile, defaultDir: def } });
    servers.push(s3);
    expect(((await api(s3, 'GET', '/api/profiles')).data as { name: string }[]).map((p) => p.name)).toContain('Alex Ünïcode');
  });

  it('refuses a restart while a game is being played (unless forced)', async () => {
    const root = tempDir();
    const def = path.join(root, 'data');
    let relaunched = 0;
    const s = await boot(def, { storage: { bootstrapFile: path.join(root, 'config.json'), defaultDir: def, relaunch: () => void relaunched++ } });
    servers.push(s);
    const host = await hostToken(s);
    const sam = await createProfile(s, 'Sam');
    await api(s, 'POST', '/api/lobby', {}, host);
    await api(s, 'POST', '/api/games', { boardId: await sampleBoardId(s, host), mode: 'solo' }, host);
    const h = await TestClient.connect(s, 'host', host);
    await h.act({ type: 'addPlayer', profileId: sam.id });
    expect((await api(s, 'GET', '/api/admin/storage', undefined, host)).data.gameRunning).toBe(false); // a lobby only
    await h.act({ type: 'startGame' });
    expect((await api(s, 'GET', '/api/admin/storage', undefined, host)).data.gameRunning).toBe(true);
    const refused = await api(s, 'POST', '/api/admin/restart', {}, host);
    expect(refused.status).toBe(409);
    expect(refused.data.error).toMatch(/game is in progress/);
    expect((await api(s, 'POST', '/api/admin/restart', { force: true }, host)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 400));
    expect(relaunched).toBe(1);
    h.close();
  });
});
