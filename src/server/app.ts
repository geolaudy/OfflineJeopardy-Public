// Local game server: Fastify HTTP API + WebSocket hub + static web app.
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import QRCode from 'qrcode';
import { audit, getSetting, integrityCheck, openDatabase, schemaVersion, setSetting, type DB } from './db/db.js';
import {
  createSession,
  deleteProfileSessions,
  deleteSession,
  hashPin,
  lockoutMs,
  newPairingCode,
  PIN_RE,
  RateLimiter,
  readSession,
  tokenHash,
  verifyPin,
  type Session,
} from './auth.js';
import * as repo from './repos.js';
import { GameManager } from './gameManager.js';
import { ControllerRegistry } from './controllers.js';
import { Hub } from './hub.js';
import { lanAddresses, pickAddress } from './network.js';
import { ImageError, MAX_UPLOAD_BYTES, processClueImage, processProfilePicture, safeJoin, sniffMedia } from './images.js';
import * as stats from './stats.js';
import { createZip, isZip, readZip, ZipError, type ZipEntry } from './zip.js';
import { registerImportRoutes } from './importRoutes.js';
import { LobbyManager } from './lobby.js';
import { INTRO_STEP_MS, normalizeTvFx, SOUND_CUES, tvFxSchema } from '../shared/tvFx.js';
import { ratingOf } from '../shared/teamBalance.js';
import * as tour from './tournaments.js';
import { normalizeRules, rulesFromPreset, RULE_PRESETS } from '../shared/game.js';
import { customThemeSchema, isPreset, newThemeData, type ThemeFile } from '../shared/themes.js';
import { rulesSchema } from '../shared/actions.js';
import { boardContentSchema, exportBoardCsv, exportBoardJson, importBoardCsv, importBoardJson } from '../shared/boardIO.js';
import { reassignIds, validateBoard } from '../shared/boardUtils.js';
import { SAMPLE_BOARD, SAMPLE_BOARD_TITLE } from '../shared/sampleBoards.js';

export const APP_VERSION = '0.2.0'; // keep in sync with package.json "version"
const MAX_PACKAGE_BYTES = 300 * 1024 * 1024;
const MAX_BACKUP_BYTES = 1024 * 1024 * 1024;

export interface ServerOptions {
  dataDir: string;
  port?: number; // 0 = random (tests)
  host?: string; // bind address
  webDir?: string | null; // built web app
  logger?: boolean;
  seed?: boolean;
}

const COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const NAME = z.string().trim().min(1).max(30);
const AVATAR = z.string().regex(/^[a-z0-9-]{1,24}$/);

export async function startServer(opts: ServerOptions) {
  const dataDir = path.resolve(opts.dataDir);
  const mediaDir = path.join(dataDir, 'media');
  const profileMediaDir = path.join(mediaDir, 'profiles');
  const clueMediaDir = path.join(mediaDir, 'clues');
  const soundMediaDir = path.join(mediaDir, 'sounds');
  fs.mkdirSync(profileMediaDir, { recursive: true });
  fs.mkdirSync(clueMediaDir, { recursive: true });
  fs.mkdirSync(soundMediaDir, { recursive: true });

  const dbFile = path.join(dataDir, 'offlinejeopardy.db');
  applyPendingRestore(dataDir, dbFile);
  const db = openDatabase(dbFile);
  if (opts.seed !== false) seed(db);

  const games = new GameManager(db);
  const controllers = new ControllerRegistry(db, {
    onPress: (p) => {
      if (hub.checkControllerPress(p.controllerId, p.kind, p.label)) return; // buzzer check: never reaches the game
      const r = games.buzz({ controllerId: p.controllerId, kind: p.kind });
      // Joy-Con feedback (Z12): a firm pulse for the first buzz, two taps when too early.
      if (p.kind === 'joycon' && getSetting(db, 'joyconRumble', true)) {
        if (r.ok) hub.controllerFx(p.controllerId, 'buzzWin');
        else if (r.info === 'early') hub.controllerFx(p.controllerId, 'early');
      }
    },
    onAssign: (p) => {
      const res = games.dispatch({ type: 'bindController', controllerId: p.controllerId, kind: p.kind as 'joycon' | 'keyboard' | 'gamepad', label: p.label, target: p.target });
      if (!res.ok) hub.sendControllers();
    },
    debounceMs: () => games.current?.rules.buzzDebounceMs ?? 120,
  });
  const hub = new Hub(db, games, controllers);
  const lobby = new LobbyManager(db, () => games.current, controllers, () => hub.onlineProfiles());
  hub.lobby = lobby;
  lobby.onChange = () => hub.sendPresentation();
  games.recover();

  const pinLimiter = new RateLimiter(20, 60_000);
  const hostLimiter = new RateLimiter(10, 60_000);

  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 5 * 1024 * 1024, trustProxy: false, forceCloseConnections: true });
  await app.register(fastifyWebsocket, { options: { maxPayload: 64 * 1024 } });
  await app.register(fastifyMultipart, { limits: { fileSize: MAX_UPLOAD_BYTES * 5, files: 1, fields: 10 } });

  // ---------- auth helpers ----------
  const bearer = (req: FastifyRequest) => {
    const h = req.headers.authorization;
    return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
  };
  const sessionOf = (req: FastifyRequest): Session | null => readSession(db, bearer(req));
  const isLoopback = (req: FastifyRequest) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  function requireHost(req: FastifyRequest, reply: FastifyReply): boolean {
    if (sessionOf(req)?.kind === 'host') return true;
    reply.code(401).send({ error: 'Host sign-in required' });
    return false;
  }
  function requireProfile(req: FastifyRequest, reply: FastifyReply): repo.ProfileRow | null {
    const s = sessionOf(req);
    const p = s?.kind === 'profile' && s.profileId ? repo.getProfile(db, s.profileId) : undefined;
    if (!p) {
      reply.code(401).send({ error: 'Please sign in to your profile' });
      return null;
    }
    return p;
  }
  const bad = (reply: FastifyReply, error: string, code = 400) => reply.code(code).send({ error });
  const parse = <T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | null => {
    const r = schema.safeParse(body);
    if (!r.success) {
      bad(reply, r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
      return null;
    }
    return r.data;
  };

  // ---------- websocket ----------
  app.get('/ws', { websocket: true }, (socket) => hub.attach(socket));

  // ---------- info / QR ----------
  const baseUrl = () => {
    const addr = pickAddress(getSetting<string | null>(db, 'preferredAddress', null));
    const port = (app.server.address() as { port: number } | null)?.port ?? opts.port;
    return `http://${addr}:${port}`;
  };
  app.get('/api/info', async () => {
    const base = baseUrl();
    const g = games.current;
    return {
      name: 'OfflineJeopardy',
      version: APP_VERSION,
      addresses: lanAddresses(),
      baseUrl: base,
      urls: { join: `${base}/join`, host: `${base}/host`, board: `${base}/board` },
      game: g ? { id: g.id, title: g.title, phase: g.phase, mode: g.mode } : null,
      clients: hub.size,
    };
  });
  app.get('/api/qr', async (req, reply) => {
    const q = req.query as { target?: string };
    if (q.target === 'hostPair') {
      // Host pairing QR (shown only on the game computer): includes the temporary lobby code in the
      // URL fragment so scanning pairs the iPad in one step. Requires a host session to fetch.
      if (!requireHost(req, reply)) return;
      if (!lobby.lobby) return bad(reply, 'Create a lobby first', 409);
      const svg = await QRCode.toString(`${baseUrl()}/host#pair=${lobby.lobby.pairingCode}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      return reply.header('content-type', 'image/svg+xml').header('cache-control', 'no-store').send(svg);
    }
    const target = q.target === 'host' ? 'host' : q.target === 'board' ? 'board' : 'join';
    // Public QR codes only ever contain plain URLs — never credentials.
    const svg = await QRCode.toString(`${baseUrl()}/${target}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    reply.header('content-type', 'image/svg+xml').header('cache-control', 'no-store').send(svg);
  });

  // ---------- host auth ----------
  app.post('/api/host/login', async (req, reply) => {
    const wait = hostLimiter.check(req.ip);
    if (wait) return bad(reply, `Too many attempts. Try again in ${Math.ceil(wait / 1000)}s.`, 429);
    const body = parse(z.object({ code: z.string().regex(/^\d{6}$/), label: z.string().max(60).optional() }), req.body, reply);
    if (!body) return;
    // Pairing codes belong to the current lobby and stop working when it closes.
    if (!lobby.lobby) return bad(reply, 'No lobby is open. Create a lobby on the game computer first.', 409);
    if (body.code !== lobby.lobby.pairingCode) return bad(reply, 'Incorrect host code', 401);
    audit(db, 'host', 'host.login', { ip: req.ip });
    return { token: createSession(db, 'host', null, body.label ?? 'Host device') };
  });
  app.post('/api/host/local-login', async (req, reply) => {
    if (!isLoopback(req) || !getSetting(db, 'trustLocalhost', true)) return bad(reply, 'Only available on the game computer', 403);
    return { token: createSession(db, 'host', null, 'This computer') };
  });
  app.get('/api/host/check', async (req) => ({ host: sessionOf(req)?.kind === 'host' }));
  app.post('/api/host/logout', async (req) => {
    const t = bearer(req);
    if (t) deleteSession(db, t);
    return { ok: true };
  });
  app.get('/api/host/pairing-code', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    return { code: lobby.lobby?.pairingCode ?? null };
  });
  app.post('/api/host/pairing-code', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    return { code: lobby.newPairingCode() };
  });

  // ---------- lobby session ----------
  app.get('/api/lobby', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const l = lobby.lobby;
    return { lobby: l ? { name: l.name, createdAt: l.createdAt } : null, pairingCode: l?.pairingCode ?? null, hostUrl: `${baseUrl()}/host`, joinUrl: `${baseUrl()}/join` };
  });
  app.post('/api/lobby', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const body = parse(z.object({ name: z.string().trim().max(60).optional() }), req.body ?? {}, reply);
    if (!body) return;
    const l = lobby.lobby ?? lobby.create(body.name);
    audit(db, 'host', 'lobby.create', { name: l.name });
    return { lobby: { name: l.name, createdAt: l.createdAt }, pairingCode: l.pairingCode };
  });
  app.delete('/api/lobby', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    lobby.close();
    // The game (if any) stays saved; the TV goes back to its start screen.
    games.unload();
    audit(db, 'host', 'lobby.close');
    return { ok: true };
  });
  app.post('/api/host/revoke-devices', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    db.prepare(`DELETE FROM sessions WHERE kind = 'host' AND token_hash <> ?`).run(tokenHash(bearer(req)!));
    lobby.newPairingCode();
    return { ok: true };
  });

  // ---------- profiles (public) ----------
  app.get('/api/profiles', async () => repo.listProfiles(db).map(repo.toPublic));

  const createProfileSchema = z.object({ name: NAME, nickname: z.string().trim().max(30).optional(), color: COLOR, avatar: AVATAR, pin: z.string().regex(PIN_RE) });
  app.post('/api/profiles', async (req, reply) => {
    const wait = pinLimiter.check(`create:${req.ip}`);
    if (wait) return bad(reply, 'Too many requests, slow down', 429);
    const body = parse(createProfileSchema, req.body, reply);
    if (!body) return;
    const p = repo.insertProfile(db, { name: body.name, nickname: body.nickname, color: body.color, avatar: body.avatar, pinHash: hashPin(body.pin) });
    const token = createSession(db, 'profile', p.id, 'Player device');
    hub.profilesChanged();
    return { token, profile: repo.toPrivate(p) };
  });

  app.post('/api/profiles/:id/login', async (req, reply) => {
    const { id } = req.params as { id: string };
    const wait = pinLimiter.check(`pin:${req.ip}`);
    if (wait) return reply.code(429).send({ error: `Too many attempts. Try again in ${Math.ceil(wait / 1000)}s.`, retryAfterMs: wait });
    const body = parse(z.object({ pin: z.string().regex(PIN_RE, 'PIN must be 4 digits') }), req.body, reply);
    if (!body) return;
    const p = repo.getProfile(db, id);
    if (!p) return bad(reply, 'Profile not found', 404);
    const now = Date.now();
    if (p.locked_until > now)
      return reply.code(429).send({ error: `Too many wrong PINs. Try again in ${Math.ceil((p.locked_until - now) / 1000)}s or ask the host.`, retryAfterMs: p.locked_until - now });
    if (!verifyPin(body.pin, p.pin_hash)) {
      const fails = p.failed_attempts + 1;
      const lock = lockoutMs(fails);
      db.prepare('UPDATE profiles SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(fails, lock ? now + lock : 0, id);
      return reply.code(401).send({ error: lock ? `Wrong PIN. Locked for ${Math.ceil(lock / 1000)}s.` : 'Wrong PIN', retryAfterMs: lock || undefined });
    }
    db.prepare('UPDATE profiles SET failed_attempts = 0, locked_until = 0 WHERE id = ?').run(id);
    return { token: createSession(db, 'profile', id, 'Player device'), profile: repo.toPrivate(p) };
  });

  // ---------- my profile ----------
  app.get('/api/me', async (req, reply) => {
    const p = requireProfile(req, reply);
    if (!p) return;
    return repo.toPrivate(p);
  });
  const patchMeSchema = z.object({
    name: NAME.optional(),
    nickname: z.string().trim().max(30).optional(),
    color: COLOR.optional(),
    avatar: AVATAR.optional(),
    preferredBuzzer: z.enum(['phone', 'joycon', 'keyboard', 'gamepad']).optional(),
    preferredButton: z.string().max(20).optional(),
    preferredSide: z.enum(['any', 'L', 'R']).optional(),
    preferredKey: z.string().max(20).nullable().optional(),
    statsPrivate: z.boolean().optional(),
  });
  app.patch('/api/me', async (req, reply) => {
    const p = requireProfile(req, reply);
    if (!p) return;
    const body = parse(patchMeSchema, req.body, reply);
    if (!body) return;
    repo.updateProfile(db, p.id, body);
    hub.profilesChanged();
    return repo.toPrivate(repo.getProfile(db, p.id)!);
  });
  app.post('/api/me/picture', async (req, reply) => {
    const p = requireProfile(req, reply);
    if (!p) return;
    return uploadPicture(req, reply, p);
  });
  app.delete('/api/me/picture', async (req, reply) => {
    const p = requireProfile(req, reply);
    if (!p) return;
    removePictureFile(p.picture_file);
    repo.updateProfile(db, p.id, { pictureFile: null });
    hub.profilesChanged();
    return repo.toPrivate(repo.getProfile(db, p.id)!);
  });
  app.post('/api/me/pin', async (req, reply) => {
    const p = requireProfile(req, reply);
    if (!p) return;
    const body = parse(z.object({ currentPin: z.string().regex(PIN_RE), newPin: z.string().regex(PIN_RE) }), req.body, reply);
    if (!body) return;
    if (pinLimiter.check(`pin:${req.ip}`)) return bad(reply, 'Too many attempts', 429);
    if (!verifyPin(body.currentPin, p.pin_hash)) return bad(reply, 'Current PIN is incorrect', 401);
    repo.updateProfile(db, p.id, { pinHash: hashPin(body.newPin) });
    return { ok: true };
  });
  app.post('/api/me/logout', async (req) => {
    const t = bearer(req);
    if (t) deleteSession(db, t);
    return { ok: true };
  });
  app.post('/api/me/logout-all', async (req, reply) => {
    const p = requireProfile(req, reply);
    if (!p) return;
    deleteProfileSessions(db, p.id);
    return { ok: true };
  });
  app.delete('/api/me', async (req, reply) => {
    const p = requireProfile(req, reply);
    if (!p) return;
    const body = parse(z.object({ pin: z.string().regex(PIN_RE) }), req.body, reply);
    if (!body) return;
    if (!verifyPin(body.pin, p.pin_hash)) return bad(reply, 'PIN is incorrect', 401);
    removePictureFile(p.picture_file);
    repo.softDeleteProfile(db, p.id);
    hub.profilesChanged();
    return { ok: true };
  });
  app.get('/api/me/stats', async (req, reply) => {
    const p = requireProfile(req, reply);
    if (!p) return;
    return stats.profileStats(db, p.id);
  });
  app.get('/api/me/history', async (req, reply) => {
    const p = requireProfile(req, reply);
    if (!p) return;
    return stats.profileHistory(db, p.id);
  });
  app.get('/api/me/export', async (req, reply) => {
    const p = requireProfile(req, reply);
    if (!p) return;
    reply.header('content-disposition', `attachment; filename="profile-${repo.toPublic(p).name.replace(/[^a-z0-9]/gi, '_')}.json"`);
    return { format: 'offline-jeopardy-profile', version: 1, profile: repo.toPrivate(p), stats: stats.profileStats(db, p.id), history: stats.profileHistory(db, p.id) };
  });

  async function uploadPicture(req: FastifyRequest, reply: FastifyReply, p: repo.ProfileRow) {
    let file;
    try {
      file = await req.file();
    } catch {
      return bad(reply, 'Upload failed');
    }
    if (!file) return bad(reply, 'No file uploaded');
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      return bad(reply, 'Image is too large (max 10 MB)', 413);
    }
    const f = file.fields as Record<string, { value?: string } | undefined>;
    const crop = ['cropX', 'cropY', 'cropW', 'cropH'].every((k) => f[k]?.value != null)
      ? { x: +f.cropX!.value!, y: +f.cropY!.value!, w: +f.cropW!.value!, h: +f.cropH!.value! }
      : undefined;
    if (crop && Object.values(crop).some((v) => !Number.isFinite(v) || v < 0 || v > 1)) return bad(reply, 'Invalid crop');
    try {
      const name = await processProfilePicture(buf, profileMediaDir, p.id, crop);
      removePictureFile(p.picture_file);
      repo.updateProfile(db, p.id, { pictureFile: name });
    } catch (e) {
      if (e instanceof ImageError) return bad(reply, e.message);
      throw e;
    }
    hub.profilesChanged();
    return repo.toPrivate(repo.getProfile(db, p.id)!);
  }
  function removePictureFile(file: string | null) {
    if (!file) return;
    const full = safeJoin(profileMediaDir, file);
    if (full) fs.rm(full, { force: true }, () => {});
  }

  // ---------- host: profile administration ----------
  app.get('/api/admin/profiles', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    return repo.listProfiles(db).map((p) => ({ ...repo.toPrivate(p), locked: p.locked_until > Date.now() }));
  });
  app.post('/api/admin/profiles', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const body = parse(createProfileSchema, req.body, reply);
    if (!body) return;
    const p = repo.insertProfile(db, { name: body.name, nickname: body.nickname, color: body.color, avatar: body.avatar, pinHash: hashPin(body.pin) });
    audit(db, 'host', 'profile.create', { id: p.id });
    hub.profilesChanged();
    return repo.toPrivate(p);
  });
  app.patch('/api/admin/profiles/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const { id } = req.params as { id: string };
    if (!repo.getProfile(db, id)) return bad(reply, 'Profile not found', 404);
    const body = parse(patchMeSchema, req.body, reply);
    if (!body) return;
    repo.updateProfile(db, id, body);
    audit(db, 'host', 'profile.update', { id, fields: Object.keys(body) });
    hub.profilesChanged();
    return repo.toPrivate(repo.getProfile(db, id)!);
  });
  app.post('/api/admin/profiles/:id/picture', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const p = repo.getProfile(db, (req.params as { id: string }).id);
    if (!p) return bad(reply, 'Profile not found', 404);
    return uploadPicture(req, reply, p);
  });
  app.post('/api/admin/profiles/:id/reset-pin', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const { id } = req.params as { id: string };
    const body = parse(z.object({ pin: z.string().regex(PIN_RE) }), req.body, reply);
    if (!body) return;
    if (!repo.getProfile(db, id)) return bad(reply, 'Profile not found', 404);
    repo.updateProfile(db, id, { pinHash: hashPin(body.pin) });
    db.prepare('UPDATE profiles SET failed_attempts = 0, locked_until = 0 WHERE id = ?').run(id);
    deleteProfileSessions(db, id);
    hub.dropProfile(id);
    audit(db, 'host', 'profile.resetPin', { id });
    return { ok: true };
  });
  app.delete('/api/admin/profiles/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const { id } = req.params as { id: string };
    const p = repo.getProfile(db, id);
    if (!p) return bad(reply, 'Profile not found', 404);
    removePictureFile(p.picture_file);
    repo.softDeleteProfile(db, id);
    hub.dropProfile(id);
    audit(db, 'host', 'profile.delete', { id });
    hub.profilesChanged();
    return { ok: true };
  });

  // ---------- teams ----------
  const teamSchema = z.object({
    name: z.string().trim().min(1).max(40),
    color: COLOR,
    avatar: AVATAR.default('shield'),
    buzzerMode: z.enum(['individual', 'shared']),
    memberIds: z.array(z.string()).max(50),
    archived: z.boolean().optional(),
  });
  app.get('/api/teams', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    return repo.listTeams(db, (req.query as { archived?: string }).archived === '1');
  });
  app.post('/api/teams', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const body = parse(teamSchema, req.body, reply);
    if (!body) return;
    for (const m of body.memberIds) if (!repo.getProfile(db, m)) return bad(reply, 'Unknown player in team');
    return repo.saveTeam(db, body);
  });
  app.put('/api/teams/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const { id } = req.params as { id: string };
    if (!repo.getTeam(db, id)) return bad(reply, 'Team not found', 404);
    const body = parse(teamSchema, req.body, reply);
    if (!body) return;
    for (const m of body.memberIds) if (!repo.getProfile(db, m)) return bad(reply, 'Unknown player in team');
    return repo.saveTeam(db, { ...body, id });
  });
  app.delete('/api/teams/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    repo.deleteTeam(db, (req.params as { id: string }).id);
    return { ok: true };
  });

  // ---------- boards ----------
  const boardSaveSchema = z.object({
    title: z.string().trim().min(1).max(120),
    description: z.string().max(2000).default(''),
    tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
    folder: z.string().trim().max(60).default(''),
    favorite: z.boolean().default(false),
    archived: z.boolean().default(false),
    isTemplate: z.boolean().default(false),
    content: boardContentSchema,
    version: z.boolean().default(false), // manual save creates a version-history entry
  });
  app.get('/api/boards', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    return repo.listBoards(db);
  });
  app.get('/api/boards/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const b = repo.getBoard(db, (req.params as { id: string }).id);
    return b ?? bad(reply, 'Board not found', 404);
  });
  app.post('/api/boards', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const body = parse(boardSaveSchema, req.body, reply);
    if (!body) return;
    const { version, ...b } = body;
    return repo.saveBoard(db, b, { version: true });
  });
  app.put('/api/boards/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const { id } = req.params as { id: string };
    if (!repo.getBoard(db, id)) return bad(reply, 'Board not found', 404);
    const body = parse(boardSaveSchema, req.body, reply);
    if (!body) return;
    const { version, ...b } = body;
    return { board: repo.saveBoard(db, { ...b, id }, { version }), issues: validateBoard(b.content) };
  });
  app.patch('/api/boards/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const { id } = req.params as { id: string };
    const b = repo.getBoard(db, id);
    if (!b) return bad(reply, 'Board not found', 404);
    const body = parse(z.object({ title: z.string().trim().min(1).max(120).optional(), favorite: z.boolean().optional(), archived: z.boolean().optional(), folder: z.string().max(60).optional(), tags: z.array(z.string().max(40)).max(30).optional() }), req.body, reply);
    if (!body) return;
    return repo.saveBoard(db, { ...b, ...body });
  });
  app.post('/api/boards/:id/duplicate', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const b = repo.getBoard(db, (req.params as { id: string }).id);
    if (!b) return bad(reply, 'Board not found', 404);
    return repo.saveBoard(db, { title: `${b.title} (copy)`, description: b.description, tags: b.tags, folder: b.folder, content: reassignIds(b.content) }, { version: true });
  });
  app.delete('/api/boards/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    repo.deleteBoard(db, (req.params as { id: string }).id);
    return { ok: true };
  });
  app.get('/api/boards/:id/versions', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    return repo.listBoardVersions(db, (req.params as { id: string }).id);
  });
  app.post('/api/boards/:id/versions/:vid/restore', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const { id, vid } = req.params as { id: string; vid: string };
    const b = repo.getBoard(db, id);
    const v = repo.getBoardVersion(db, id, Number(vid));
    if (!b || !v) return bad(reply, 'Version not found', 404);
    return repo.saveBoard(db, { ...b, title: v.title, content: v.content }, { version: true });
  });
  app.get('/api/boards/:id/export', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const b = repo.getBoard(db, (req.params as { id: string }).id);
    if (!b) return bad(reply, 'Board not found', 404);
    const fmt = (req.query as { format?: string }).format === 'csv' ? 'csv' : 'json';
    const safe = b.title.replace(/[^a-z0-9 _-]/gi, '').trim() || 'board';
    reply.header('content-disposition', `attachment; filename="${safe}.${fmt}"`);
    if (fmt === 'csv') return reply.type('text/csv; charset=utf-8').send(exportBoardCsv(b.content));
    return reply.type('application/json').send(exportBoardJson(b));
  });
  app.post('/api/boards/import', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const body = parse(z.object({ format: z.enum(['csv', 'json']), text: z.string().max(4_000_000), title: z.string().max(120).optional(), preview: z.boolean().default(false) }), req.body, reply);
    if (!body) return;
    const r: ReturnType<typeof importBoardJson> = body.format === 'csv' ? importBoardCsv(body.text) : importBoardJson(body.text);
    const title: string = body.title?.trim() || r.title || 'Imported board';
    const existing = repo.listBoards(db).some((b) => b.title.toLowerCase() === title.toLowerCase());
    const warnings = [...r.warnings, ...(existing ? [`A board named "${title}" already exists — the import will be saved as a separate board.`] : [])];
    if (body.preview || !r.content) return { ...r, warnings, title, saved: null };
    const saved = repo.saveBoard(db, { title, description: r.description ?? '', tags: r.tags ?? [], content: reassignIds(r.content) }, { version: true });
    return { ...r, warnings, title, saved: { id: saved.id } };
  });

  // ---------- media for clues ----------
  /** Validates (content sniffing / image decoding), stores and registers one clue media file. */
  async function storeClueMedia(buf: Buffer, originalName: string) {
    const id = repo.newId();
    const av = sniffMedia(buf);
    let out: { file: string; mime: string; kind: 'image' | 'audio' | 'video' };
    if (av) {
      const name = `${id}.${av.ext}`;
      fs.writeFileSync(path.join(clueMediaDir, name), buf);
      out = { file: name, mime: av.mime, kind: av.kind };
    } else {
      const img = await processClueImage(buf, clueMediaDir);
      out = { ...img, kind: 'image' };
    }
    db.prepare('INSERT INTO media (id, kind, file, mime, size, original_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, out.kind, out.file, out.mime, buf.length, originalName.slice(0, 200), Date.now());
    return { id, kind: out.kind, url: `/media/clues/${out.file}` };
  }

  app.post('/api/media', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const file = await req.file().catch(() => undefined);
    if (!file) return bad(reply, 'No file uploaded');
    const buf = await file.toBuffer().catch(() => null);
    if (!buf) return bad(reply, 'File is too large', 413);
    try {
      return await storeClueMedia(buf, file.filename);
    } catch (e) {
      if (e instanceof ImageError) return bad(reply, e.message);
      throw e;
    }
  });

  // ---------- board packages (board + its media in one .zip) ----------
  const clueFileOf = (url: string) => /^\/media\/clues\/([A-Za-z0-9._-]{1,120})$/.exec(url)?.[1] ?? null;
  app.get('/api/boards/:id/package', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const b = repo.getBoard(db, (req.params as { id: string }).id);
    if (!b) return bad(reply, 'Board not found', 404);
    const entries: ZipEntry[] = [{ name: 'board.json', data: Buffer.from(exportBoardJson(b), 'utf8') }];
    const seen = new Set<string>();
    const missing: string[] = [];
    for (const r of b.content.rounds)
      for (const c of r.categories)
        for (const q of c.clues)
          for (const m of [...(q.media ?? []), ...(q.answerMedia ?? [])]) {
            const f = clueFileOf(m.url);
            if (!f || seen.has(f)) continue;
            seen.add(f);
            const full = safeJoin(clueMediaDir, f);
            if (full && fs.existsSync(full)) entries.push({ name: `media/${f}`, data: fs.readFileSync(full) });
            else missing.push(f);
          }
    entries.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify({ format: 'offline-jeopardy-board-package', version: 1, appVersion: APP_VERSION, createdAt: Date.now(), title: b.title, mediaFiles: seen.size - missing.length, missing }, null, 2)) });
    const safe = b.title.replace(/[^a-z0-9 _-]/gi, '').trim() || 'board';
    reply.header('content-disposition', `attachment; filename="${safe}.ojboard.zip"`);
    return reply.type('application/zip').send(createZip(entries));
  });
  app.post('/api/boards/import-package', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const preview = (req.query as { preview?: string }).preview === '1';
    const file = await req.file({ limits: { fileSize: MAX_PACKAGE_BYTES } }).catch(() => undefined);
    if (!file) return bad(reply, 'No file uploaded');
    const buf = await file.toBuffer().catch(() => null);
    if (!buf) return bad(reply, 'The package is too large (max 300 MB)', 413);
    let entries: ZipEntry[];
    try {
      entries = readZip(buf, { maxEntries: 5000, maxTotalBytes: MAX_PACKAGE_BYTES * 2 });
    } catch (e) {
      return bad(reply, e instanceof ZipError ? e.message : 'That file is not a board package');
    }
    const boardEntry = entries.find((e) => e.name === 'board.json');
    if (!boardEntry) return bad(reply, 'This ZIP is not an OfflineJeopardy board package (board.json is missing)');
    const r = importBoardJson(boardEntry.data.toString('utf8'));
    const title: string = ((req.query as { title?: string }).title ?? '').trim().slice(0, 120) || r.title || 'Imported board';
    const media = new Map(entries.filter((e) => e.name.startsWith('media/')).map((e) => [e.name.slice(6), e]));
    const warnings = [...r.warnings];
    if (repo.listBoards(db).some((b) => b.title.toLowerCase() === title.toLowerCase())) warnings.push(`A board named "${title}" already exists — the import will be saved as a separate board.`);
    const summary = { ...r.summary, mediaFiles: media.size };
    if (preview || !r.content) return { ...r, summary, warnings, title, saved: null };
    // Store each referenced file (validated again here — never trust package contents) and
    // rewrite the board's media URLs to the newly stored copies.
    const mapped = new Map<string, string | null>();
    const content = reassignIds(r.content);
    for (const round of content.rounds)
      for (const cat of round.categories)
        for (const q of cat.clues)
          for (const side of ['media', 'answerMedia'] as const) {
            const list = q[side];
            if (!list?.length) continue;
            const kept = [];
            for (const m of list) {
              const f = clueFileOf(m.url);
              if (!f) continue; // only local media can be packaged
              if (!mapped.has(f)) {
                const entry = media.get(f);
                if (!entry) {
                  mapped.set(f, null);
                  warnings.push(`Media file ${f} is missing from the package; the clue keeps its text.`);
                } else {
                  try {
                    mapped.set(f, (await storeClueMedia(entry.data, f)).url);
                  } catch (e) {
                    mapped.set(f, null);
                    warnings.push(`Media file ${f} was rejected: ${e instanceof ImageError ? e.message : 'unsupported file'}`);
                  }
                }
              }
              const url = mapped.get(f);
              if (url) kept.push({ ...m, url });
            }
            q[side] = kept.length ? kept : undefined;
          }
    const saved = repo.saveBoard(db, { title, description: r.description ?? '', tags: r.tags ?? [], content }, { version: true });
    audit(db, 'host', 'board.importPackage', { id: saved.id, media: [...mapped.values()].filter(Boolean).length });
    return { ...r, summary, warnings, title, saved: { id: saved.id } };
  });

  // ---------- importing from links, Buzzinga exports and clue datasets (src/server/importers) ----------
  registerImportRoutes(app, {
    requireHost,
    storeClueMedia,
    saveBoard: (input) => repo.saveBoard(db, input, { version: true }),
    listBoardTitles: () => repo.listBoards(db).map((b) => b.title),
    removeClueMedia: (url) => {
      const f = clueFileOf(url);
      if (!f) return;
      const full = safeJoin(clueMediaDir, f);
      if (full) fs.rmSync(full, { force: true });
      db.prepare('DELETE FROM media WHERE file = ?').run(f);
    },
    deleteBoard: (id) => repo.deleteBoard(db, id),
    audit: (action, detail) => audit(db, 'host', action, detail),
  });
  app.get('/media/:dir/:file', async (req, reply) => {
    const { dir, file } = req.params as { dir: string; file: string };
    const base = dir === 'profiles' ? profileMediaDir : dir === 'clues' ? clueMediaDir : dir === 'sounds' ? soundMediaDir : null;
    const full = base ? safeJoin(base, file) : null;
    if (!full || !fs.existsSync(full)) return reply.code(404).send({ error: 'Not found' });
    const ext = path.extname(full).slice(1).toLowerCase();
    const types: Record<string, string> = { webp: 'image/webp', gif: 'image/gif', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm' };
    reply.header('cache-control', 'public, max-age=31536000, immutable').header('x-content-type-options', 'nosniff');
    return reply.type(types[ext] ?? 'application/octet-stream').send(fs.createReadStream(full));
  });

  // ---------- games ----------
  app.get('/api/games', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    return { current: games.current?.id ?? null, games: repo.listGames(db, ['setup', 'active']), presets: RULE_PRESETS };
  });
  app.post('/api/games', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const body = parse(
      z.object({ boardId: z.string(), title: z.string().trim().max(120).optional(), mode: z.enum(['solo', 'team']), preset: z.string().max(32).default('classic'), rules: rulesSchema.optional(), practice: z.boolean().default(false), tournamentId: z.string().max(64).nullable().optional() }),
      req.body,
      reply,
    );
    if (!body) return;
    const b = repo.getBoard(db, body.boardId);
    if (!b) return bad(reply, 'Board not found', 404);
    const errors = validateBoard(b.content).filter((i) => i.level === 'error');
    if (errors.length) return bad(reply, errors.map((e) => e.message).join(' '));
    const t = body.tournamentId ? tour.getTournament(db, body.tournamentId) : null;
    if (body.tournamentId) {
      if (!t) return bad(reply, 'Tournament not found', 404);
      if (t.status !== 'active') return bad(reply, 'That tournament is finished');
      if (t.mode !== body.mode) return bad(reply, t.mode === 'team' ? 'This tournament is for teams' : 'This tournament is for individuals');
      if (body.practice) return bad(reply, 'Practice games do not count in tournaments');
    }
    const s = games.create({ title: body.title || b.title, boardId: b.id, board: structuredClone(b.content), mode: body.mode, rules: body.rules ? normalizeRules(body.rules) : rulesFromPreset(body.preset), practice: body.practice });
    if (t) tour.attachGame(db, s.id, t.id);
    return { id: s.id };
  });
  // ---------- tournaments (O8) ----------
  const tournamentBody = z.object({ name: z.string().trim().min(1).max(60), mode: z.enum(['solo', 'team']), scoring: z.enum(['placement', 'total']) });
  app.get('/api/tournaments', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    return tour.listTournaments(db).map((t) => {
      const st = tour.standings(db, t);
      return { ...t, games: tour.tournamentGames(db, t.id).filter((g) => g.status === 'completed').length, leader: st[0]?.name ?? null };
    });
  });
  app.post('/api/tournaments', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const body = parse(tournamentBody, req.body, reply);
    if (!body) return;
    const t = tour.createTournament(db, body);
    audit(db, 'host', 'tournament.create', { id: t.id, name: t.name });
    return t;
  });
  app.get('/api/tournaments/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const t = tour.getTournament(db, (req.params as { id: string }).id);
    if (!t) return bad(reply, 'Tournament not found', 404);
    return { tournament: t, standings: tour.standings(db, t), games: tour.tournamentGames(db, t.id) };
  });
  app.patch('/api/tournaments/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const body = parse(z.object({ name: z.string().trim().min(1).max(60).optional(), status: z.enum(['active', 'finished']).optional(), scoring: z.enum(['placement', 'total']).optional() }), req.body, reply);
    if (!body) return;
    const t = tour.updateTournament(db, (req.params as { id: string }).id, body);
    if (!t) return bad(reply, 'Tournament not found', 404);
    lobby.refreshSoon();
    return t;
  });
  app.delete('/api/tournaments/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const id = (req.params as { id: string }).id;
    tour.deleteTournament(db, id);
    audit(db, 'host', 'tournament.delete', { id });
    return { ok: true };
  });
  /** Which tournament a game belongs to (host). */
  app.get('/api/games/:id/tournament', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const tid = tour.tournamentOfGame(db, (req.params as { id: string }).id);
    return { tournament: tid ? tour.getTournament(db, tid) : null };
  });

  // Lobby control: play a different board in the open game (before it starts). Players, teams and
  // buzzers stay; a title that was just the old board's name follows the new board.
  app.post('/api/games/current/board', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const body = parse(z.object({ boardId: z.string() }), req.body, reply);
    if (!body) return;
    const g = games.current;
    if (!g) return bad(reply, 'No game is loaded', 409);
    const b = repo.getBoard(db, body.boardId);
    if (!b) return bad(reply, 'Board not found', 404);
    const errors = validateBoard(b.content).filter((i) => i.level === 'error');
    if (errors.length) return bad(reply, errors.map((e) => e.message).join(' '));
    const old = g.boardId ? repo.getBoard(db, g.boardId) : null;
    const retitle = !old || old.title === g.title;
    const res = games.dispatch({ type: 'setBoard', boardId: b.id, board: structuredClone(b.content), title: retitle ? b.title : undefined });
    return res.ok ? { ok: true } : bad(reply, res.error ?? 'Could not change the board');
  });
  app.post('/api/games/:id/load', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const s = games.load((req.params as { id: string }).id);
    return s ? { id: s.id } : bad(reply, 'Game not found', 404);
  });
  app.post('/api/games/close', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    games.unload();
    return { ok: true };
  });
  app.post('/api/games/save', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    // Every action is already saved transactionally; this forces a checkpoint for peace of mind.
    if (games.current) repo.persistGame(db, games.current, []);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    return { ok: true, savedAt: Date.now() };
  });
  app.delete('/api/games/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const { id } = req.params as { id: string };
    if (games.current?.id === id) games.unload();
    db.prepare(`UPDATE games SET status = 'abandoned', updated_at = ? WHERE id = ? AND status <> 'completed'`).run(Date.now(), id);
    return { ok: true };
  });
  app.get('/api/games/:id/export', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const s = repo.loadGame(db, (req.params as { id: string }).id);
    if (!s) return bad(reply, 'Game not found', 404);
    reply.header('content-disposition', `attachment; filename="save-${s.id.slice(0, 8)}.json"`);
    const { undoStack: _u, ...rest } = s;
    return { format: 'offline-jeopardy-save', version: 1, state: rest };
  });

  // ---------- statistics & history ----------
  app.get('/api/stats/profiles/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = sessionOf(req);
    const p = repo.getProfile(db, id);
    if (!p) return bad(reply, 'Profile not found', 404);
    const own = s?.kind === 'profile' && s.profileId === id;
    if (!own && s?.kind !== 'host' && (p.stats_private || !s)) return bad(reply, 'These statistics are private', 403);
    if (p.deleted_at) return bad(reply, 'Profile not found', 404);
    // Public view of another player: public profile fields, statistics and game results only —
    // never PINs, sessions, preferences or other private settings.
    const history = (stats.profileHistory(db, id) as Record<string, unknown>[]).slice(0, 25).map((h) => ({
      id: h.id, title: h.title, mode: h.mode, endedAt: h.endedAt, competitorName: h.competitorName, kind: h.kind,
      finalScore: h.finalScore, placement: h.placement, isWinner: h.isWinner, competitorCount: h.competitorCount, winners: h.winners,
      correct: h.correct, incorrect: h.incorrect, practice: h.practice,
    }));
    return { profile: repo.toPublic(p), own, stats: stats.profileStats(db, id), history };
  });
  app.get('/api/stats/teams/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const t = repo.getTeam(db, (req.params as { id: string }).id);
    if (!t) return bad(reply, 'Team not found', 404);
    return { team: t, stats: stats.teamStats(db, t.id) };
  });
  // Head to head (T10): two players' record against (and with) each other. Same privacy as a
  // player's statistics: signed in, and neither profile private unless it is your own (host sees all).
  app.get('/api/stats/compare', async (req, reply) => {
    const q = req.query as { a?: string; b?: string };
    const s = sessionOf(req);
    if (!s) return bad(reply, 'Sign in first', 401);
    if (!q.a || !q.b || q.a === q.b) return bad(reply, 'Choose two different players');
    const side = (id: string) => {
      const p = repo.getProfile(db, id);
      if (!p || p.deleted_at) return { ok: false as const, error: 'Profile not found', code: 404 };
      const own = s.kind === 'profile' && s.profileId === id;
      if (!own && s.kind !== 'host' && p.stats_private) return { ok: false as const, error: `${repo.toPublic(p).name} keeps their statistics private`, code: 403 };
      const st = stats.profileStats(db, id);
      const c = st.combined;
      return {
        ok: true as const,
        profile: repo.toPublic(p),
        summary: {
          games: c.gamesPlayed,
          wins: c.wins,
          accuracy: c.correct + c.incorrect ? c.correct / (c.correct + c.incorrect) : null,
          bestScore: st.solo.games.highestScore ?? null,
          avgReactionMs: st.solo.buzzer.averageReactionMs ?? st.team.buzzer.averageReactionMs ?? null,
        },
      };
    };
    const a = side(q.a);
    if (!a.ok) return bad(reply, a.error, a.code);
    const b = side(q.b);
    if (!b.ok) return bad(reply, b.error, b.code);
    return { a, b, h2h: stats.headToHead(db, q.a, q.b) };
  });
  // Team balancing (T11): a skill estimate per player from their history (host only).
  app.get('/api/stats/ratings', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const ids = String((req.query as { ids?: string }).ids ?? '')
      .split(',')
      .filter((x) => /^[A-Za-z0-9_-]{1,64}$/.test(x))
      .slice(0, 200);
    return ids.map((id) => {
      const c = stats.profileStats(db, id).combined;
      const rec = { games: c.gamesPlayed, wins: c.wins, correct: c.correct, incorrect: c.incorrect };
      return { id, rating: ratingOf(rec), games: rec.games };
    });
  });
  app.get('/api/stats/leaderboard', async (req, reply) => {
    const s = sessionOf(req);
    if (!s) return bad(reply, 'Sign in to view the leaderboard', 401);
    if (s.kind !== 'host' && !getSetting(db, 'publicLeaderboard', true)) return bad(reply, 'The host has turned off the leaderboard', 403);
    return stats.leaderboard(db);
  });
  app.get('/api/stats/export/:kind', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const { kind } = req.params as { kind: string };
    if (kind !== 'players.csv' && kind !== 'games.csv') return bad(reply, 'Unknown export', 404);
    const body = kind === 'players.csv' ? stats.playersCsv(db) : stats.gamesCsv(db);
    reply.header('content-disposition', `attachment; filename="offlinejeopardy-${kind}"`);
    return reply.type('text/csv; charset=utf-8').send('\uFEFF' + body); // BOM so Excel reads UTF-8
  });
  app.get('/api/history', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    return stats.listHistory(db);
  });
  app.get('/api/history/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = sessionOf(req);
    const allowed = s?.kind === 'host' || (s?.kind === 'profile' && s.profileId && stats.isParticipant(db, id, s.profileId));
    if (!allowed) return bad(reply, 'You can only view games you played', 403);
    const d = stats.gameDetail(db, id);
    return d ?? bad(reply, 'Game not found', 404);
  });

  // ---------- settings & maintenance ----------
  const settingsSchema = z.object({
    preferredAddress: z.string().max(60).nullable().optional(),
    trustLocalhost: z.boolean().optional(),
    publicLeaderboard: z.boolean().optional(),
    theme: z.string().max(40).optional(),
    boardTheme: z.string().max(80).optional(),
    sound: z.boolean().optional(),
    volume: z.number().min(0).max(1).optional(),
    reducedMotion: z.boolean().optional(),
    keyboardBuzzers: z.boolean().optional(),
    joyconRumble: z.boolean().optional(),
    tvFx: tvFxSchema.optional(),
  });
  const SETTING_DEFAULTS = { preferredAddress: null, trustLocalhost: true, publicLeaderboard: true, theme: 'classic', boardTheme: 'classic', sound: true, volume: 0.7, reducedMotion: false, keyboardBuzzers: true, joyconRumble: true };
  const readSettings = () => {
    const base: Record<string, string | boolean | number | null> = Object.fromEntries(Object.entries(SETTING_DEFAULTS).map(([k, v]) => [k, getSetting(db, k, v)]));
    return Object.assign(base, { tvFx: normalizeTvFx(getSetting(db, 'tvFx', null)) });
  };
  // The automatic category-introduction pace follows the chosen intro speed.
  games.introStepMs = INTRO_STEP_MS(readSettings().tvFx.introSpeed);
  app.get('/api/settings/public', async () => {
    const s = readSettings();
    // "custom:<id>" selects a saved custom theme; the TV gets its full definition (public look only).
    const customId = typeof s.boardTheme === 'string' && s.boardTheme.startsWith('custom:') ? s.boardTheme.slice(7) : null;
    const custom = customId ? repo.getTheme(db, customId) ?? null : null;
    return { theme: custom ? custom.base : isPreset(String(s.boardTheme)) ? s.boardTheme : 'classic', custom, sound: s.sound, volume: s.volume, reducedMotion: s.reducedMotion, tvFx: s.tvFx };
  });

  // ---------- custom sound cues (R2-22): the host's own audio files, stored locally ----------
  const MAX_SOUND_BYTES = 2 * 1024 * 1024;
  app.post('/api/sounds/:cue', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const cue = (req.params as { cue: string }).cue;
    if (!(SOUND_CUES as readonly string[]).includes(cue)) return bad(reply, 'Unknown sound cue', 404);
    const file = await req.file().catch(() => undefined);
    if (!file) return bad(reply, 'No file uploaded');
    const buf = await file.toBuffer().catch(() => null);
    if (!buf || buf.length > MAX_SOUND_BYTES) return bad(reply, 'Sound files can be up to 2 MB', 413);
    const kind = sniffMedia(buf);
    if (!kind || kind.kind !== 'audio') return bad(reply, 'Choose an MP3, WAV, OGG or M4A audio file');
    const name = `${cue}-${Date.now().toString(36)}.${kind.ext}`;
    fs.writeFileSync(path.join(soundMediaDir, name), buf);
    const fx = readSettings().tvFx;
    const old = fx.customSounds[cue as keyof typeof fx.customSounds];
    fx.customSounds = { ...fx.customSounds, [cue]: `/media/sounds/${name}` };
    setSetting(db, 'tvFx', fx);
    if (old) fs.rmSync(path.join(soundMediaDir, path.basename(old)), { force: true });
    hub.profilesChanged();
    return fx;
  });
  app.delete('/api/sounds/:cue', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const cue = (req.params as { cue: string }).cue;
    const fx = readSettings().tvFx;
    const old = fx.customSounds[cue as keyof typeof fx.customSounds];
    if (old) {
      const rest = { ...fx.customSounds };
      delete rest[cue as keyof typeof rest];
      fx.customSounds = rest;
      setSetting(db, 'tvFx', fx);
      fs.rmSync(path.join(soundMediaDir, path.basename(old)), { force: true });
      hub.profilesChanged();
    }
    return fx;
  });

  // ---------- custom TV themes ----------
  app.get('/api/themes', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    return repo.listThemes(db);
  });
  app.post('/api/themes', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const body = parse(customThemeSchema, req.body, reply);
    if (!body) return;
    return repo.saveTheme(db, body);
  });
  app.put('/api/themes/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const { id } = req.params as { id: string };
    if (!repo.getTheme(db, id)) return bad(reply, 'Theme not found', 404);
    const body = parse(customThemeSchema, req.body, reply);
    if (!body) return;
    const t = repo.saveTheme(db, body, id);
    if (getSetting(db, 'boardTheme', 'classic') === `custom:${id}`) hub.profilesChanged(); // live update on the TV
    return t;
  });
  app.delete('/api/themes/:id', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const { id } = req.params as { id: string };
    repo.deleteTheme(db, id);
    if (getSetting(db, 'boardTheme', 'classic') === `custom:${id}`) {
      setSetting(db, 'boardTheme', 'classic');
      hub.profilesChanged();
    }
    return { ok: true };
  });
  app.get('/api/themes/:id/export', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const t = repo.getTheme(db, (req.params as { id: string }).id);
    if (!t) return bad(reply, 'Theme not found', 404);
    const { id: _i, createdAt: _c, updatedAt: _u, ...theme } = t;
    const images: ThemeFile['images'] = {};
    for (const url of [theme.backgroundImage, theme.logo]) {
      const f = url ? clueFileOf(url) : null;
      const full = f ? safeJoin(clueMediaDir, f) : null;
      if (url && full && fs.existsSync(full)) images[url] = { mime: url.endsWith('.gif') ? 'image/gif' : 'image/webp', base64: fs.readFileSync(full).toString('base64') };
    }
    const file: ThemeFile = { format: 'offline-jeopardy-theme', version: 1, theme, images };
    const safe = t.name.replace(/[^a-z0-9 _-]/gi, '').trim() || 'theme';
    reply.header('content-disposition', `attachment; filename="${safe}.ojtheme.json"`);
    return reply.type('application/json').send(JSON.stringify(file, null, 2));
  });
  app.post('/api/themes/import', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const body = parse(
      z.object({
        format: z.literal('offline-jeopardy-theme'),
        version: z.literal(1),
        theme: z.unknown(),
        images: z.record(z.string().max(200), z.object({ mime: z.string().max(40), base64: z.string().max(6_000_000) })).default({}),
      }),
      req.body,
      reply,
    );
    if (!body) return;
    // Images are decoded, re-validated and re-encoded like any upload; URLs are rewritten.
    const warnings: string[] = [];
    const raw = { ...newThemeData(), ...(body.theme as object) } as Record<string, unknown>;
    for (const key of ['backgroundImage', 'logo'] as const) {
      const url = raw[key];
      if (typeof url !== 'string') {
        raw[key] = null;
        continue;
      }
      const img = body.images[url];
      if (!img) {
        raw[key] = null;
        warnings.push(`The ${key === 'logo' ? 'logo' : 'background image'} is missing from the file.`);
        continue;
      }
      try {
        raw[key] = (await storeClueMedia(Buffer.from(img.base64, 'base64'), `theme-${key}`)).url;
      } catch {
        raw[key] = null;
        warnings.push(`The ${key === 'logo' ? 'logo' : 'background image'} was rejected (not a supported image).`);
      }
    }
    raw.colors = { ...newThemeData().colors, ...((raw.colors as object) ?? {}) };
    const parsed = customThemeSchema.safeParse(raw);
    if (!parsed.success) return bad(reply, `This theme file is not valid: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    const t = repo.saveTheme(db, parsed.data);
    audit(db, 'host', 'theme.import', { id: t.id });
    return { theme: t, warnings };
  });
  app.get('/api/settings', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    return readSettings();
  });
  app.put('/api/settings', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const body = parse(settingsSchema, req.body, reply);
    if (!body) return;
    // Custom sound files are managed by /api/sounds only (a settings save cannot point at other files).
    if (body.tvFx) body.tvFx = { ...body.tvFx, customSounds: readSettings().tvFx.customSounds };
    for (const [k, v] of Object.entries(body)) if (v !== undefined) setSetting(db, k, v);
    if (body.tvFx) games.introStepMs = INTRO_STEP_MS(body.tvFx.introSpeed);
    hub.profilesChanged(); // nudges clients to refetch public settings
    return readSettings();
  });
  app.get('/api/admin/diagnostics', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    return { integrity: integrityCheck(db), schemaVersion: schemaVersion(db), dataDir, clients: hub.size, addresses: lanAddresses(), version: APP_VERSION };
  });
  app.get('/api/admin/backup', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const tmp = path.join(dataDir, `backup-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const buf = fs.readFileSync(tmp);
    fs.rmSync(tmp, { force: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    if ((req.query as { media?: string }).media === '0') {
      reply.header('content-disposition', `attachment; filename="offlinejeopardy-backup-${stamp}.db"`);
      return reply.type('application/octet-stream').send(buf);
    }
    // Full backup: database + profile pictures + clue media in one ZIP.
    const entries: ZipEntry[] = [{ name: 'offlinejeopardy.db', data: buf }];
    for (const [sub, dir] of [['profiles', profileMediaDir], ['clues', clueMediaDir]] as const)
      for (const f of fs.readdirSync(dir)) {
        const full = safeJoin(dir, f);
        if (full && fs.statSync(full).isFile()) entries.push({ name: `media/${sub}/${f}`, data: fs.readFileSync(full) });
      }
    entries.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify({ format: 'offline-jeopardy-backup', version: 1, appVersion: APP_VERSION, schemaVersion: schemaVersion(db), createdAt: Date.now(), mediaFiles: entries.length - 1 }, null, 2)) });
    reply.header('content-disposition', `attachment; filename="offlinejeopardy-backup-${stamp}.zip"`);
    return reply.type('application/zip').send(createZip(entries));
  });
  app.post('/api/admin/restore', async (req, reply) => {
    if (!requireHost(req, reply)) return;
    const file = await req.file({ limits: { fileSize: MAX_BACKUP_BYTES } }).catch(() => undefined);
    if (!file) return bad(reply, 'No file uploaded');
    const upload = await file.toBuffer().catch(() => null);
    if (!upload) return bad(reply, 'The backup is too large', 413);
    // Accept a full ZIP backup (database + media) or a database-only .db backup.
    let dbBuf = upload;
    let mediaEntries: ZipEntry[] = [];
    if (isZip(upload)) {
      try {
        const entries = readZip(upload, { maxEntries: 100_000, maxTotalBytes: MAX_BACKUP_BYTES * 2 });
        const manifest = entries.find((e) => e.name === 'manifest.json');
        const dbEntry = entries.find((e) => e.name === 'offlinejeopardy.db');
        if (!manifest || !dbEntry || JSON.parse(manifest.data.toString('utf8')).format !== 'offline-jeopardy-backup') throw new ZipError('not a backup');
        dbBuf = dbEntry.data;
        mediaEntries = entries.filter((e) => /^media\/(profiles|clues)\/[A-Za-z0-9._-]{1,120}$/.test(e.name));
      } catch {
        return bad(reply, 'That ZIP is not an OfflineJeopardy backup');
      }
    }
    if (dbBuf.subarray(0, 16).toString('latin1') !== 'SQLite format 3\u0000') return bad(reply, 'That is not an OfflineJeopardy backup file');
    const pending = path.join(dataDir, 'restore-pending.db');
    const pendingMedia = path.join(dataDir, 'restore-pending-media');
    fs.rmSync(pendingMedia, { recursive: true, force: true });
    fs.writeFileSync(pending, dbBuf);
    try {
      const test = openDatabase(pending);
      const ok = integrityCheck(test) === 'ok' && !!test.prepare(`SELECT name FROM sqlite_master WHERE name = 'profiles'`).get();
      test.close();
      if (!ok) throw new Error('bad');
    } catch {
      fs.rmSync(pending, { force: true });
      return bad(reply, 'The backup file is damaged or not compatible');
    }
    if (isZip(upload)) {
      // Media is staged next to the database and swapped in on the next start, like the database.
      for (const sub of ['profiles', 'clues']) fs.mkdirSync(path.join(pendingMedia, sub), { recursive: true });
      for (const e of mediaEntries) fs.writeFileSync(path.join(pendingMedia, e.name.slice('media/'.length)), e.data);
    }
    audit(db, 'host', 'db.restoreScheduled', { media: isZip(upload) ? mediaEntries.length : null });
    return { ok: true, media: isZip(upload) ? mediaEntries.length : null, message: 'Backup verified. Restart OfflineJeopardy to finish restoring.' };
  });

  // ---------- static web app ----------
  const webDir = opts.webDir;
  if (webDir && fs.existsSync(webDir)) {
    await app.register(fastifyStatic, { root: webDir, prefix: '/', wildcard: false, index: false });
    const indexHtml = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/media/') || req.url === '/ws') return reply.code(404).send({ error: 'Not found' });
      reply.type('text/html').header('cache-control', 'no-cache').send(indexHtml);
    });
  }

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    return payload;
  });

  await app.listen({ port: opts.port ?? 3000, host: opts.host ?? '0.0.0.0' });
  const port = (app.server.address() as { port: number }).port;

  return {
    app,
    db,
    games,
    controllers,
    hub,
    port,
    url: `http://127.0.0.1:${port}`,
    lobby,
    /** Current lobby pairing code (null when no lobby is open). */
    get pairingCode() {
      return lobby.lobby?.pairingCode ?? null;
    },
    async close() {
      lobby.dispose();
      games.dispose();
      hub.closeAll();
      await app.close();
      db.close();
    },
  };
}

export type RunningServer = Awaited<ReturnType<typeof startServer>>;

function applyPendingRestore(dataDir: string, dbFile: string) {
  const pending = path.join(dataDir, 'restore-pending.db');
  if (!fs.existsSync(pending)) return;
  const stamp = Date.now();
  if (fs.existsSync(dbFile)) fs.copyFileSync(dbFile, path.join(dataDir, `pre-restore-${stamp}.db`));
  for (const ext of ['', '-wal', '-shm']) fs.rmSync(dbFile + ext, { force: true });
  fs.renameSync(pending, dbFile);
  // Full (ZIP) backups also carry media: keep the current media as a safety copy, then swap in.
  const pendingMedia = path.join(dataDir, 'restore-pending-media');
  if (fs.existsSync(pendingMedia)) {
    const media = path.join(dataDir, 'media');
    if (fs.existsSync(media)) fs.renameSync(media, path.join(dataDir, `pre-restore-media-${stamp}`));
    fs.renameSync(pendingMedia, media);
  }
}

function seed(db: DB) {
  if (getSetting(db, 'seeded', false)) return;
  repo.saveBoard(db, { title: SAMPLE_BOARD_TITLE, description: 'A ready-to-play example board with two rounds and a Final.', tags: ['example'], content: SAMPLE_BOARD }, { version: true });
  setSetting(db, 'seeded', true);
}
