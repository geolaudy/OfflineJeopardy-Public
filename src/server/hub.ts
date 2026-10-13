// WebSocket hub: authenticates clients by role, routes messages, and broadcasts
// role-specific projections of the authoritative state.
import type { WebSocket } from 'ws';
import type { DB } from './db/db.js';
import { readSession } from './auth.js';
import { ClientMessageSchema, type ServerMessage } from '../shared/protocol.js';
import { hostActionSchema, type HostAction } from '../shared/actions.js';
import type { GameManager } from './gameManager.js';
import type { ControllerRegistry } from './controllers.js';
import { playerContext, projectState } from './engine/projection.js';
import { getProfile } from './repos.js';
import type { GameView } from '../shared/views.js';
import type { LobbyManager } from './lobby.js';

interface Client {
  ws: WebSocket;
  role: 'host' | 'public' | 'player' | null;
  profileId: string | null;
  observer?: boolean; // the game computer's start screen: a host connection that is not a host controller
  trusted: boolean; // authenticated host session: may manage the game and report controller input
  deviceIds: Set<string>; // controllers reported by this client
  lastBuzz: number;
  msgCount: number;
  msgWindow: number;
  joinFails: number[]; // timestamps of wrong room codes (rate limiting)
}

export class Hub {
  private clients = new Set<Client>();
  private pending = false;
  private closed = false;

  lobby: LobbyManager | null = null;

  constructor(
    private db: DB,
    private games: GameManager,
    private controllers: ControllerRegistry,
  ) {
    games.onChange = () => {
      this.scheduleBroadcast();
      this.lobby?.refreshSoon();
    };
    controllers.onChange = () => this.sendControllers();
    controllers.onInput = (controllerId, button, at) => this.toHosts({ t: 'controllerInput', controllerId, button, at });
  }

  get size() {
    return this.clients.size;
  }

  attach(ws: WebSocket) {
    const c: Client = { ws, role: null, profileId: null, trusted: false, deviceIds: new Set(), lastBuzz: 0, msgCount: 0, msgWindow: Date.now(), joinFails: [] };
    this.clients.add(c);
    ws.on('message', (raw) => this.onMessage(c, raw.toString()));
    ws.on('close', () => {
      this.clients.delete(c);
      if (c.role === 'player') {
        this.scheduleBroadcast();
        this.lobby?.refreshSoon(); // phone readiness on the TV lobby
      }
      if (c.role === 'host') this.sendPresentation();
      if (c.deviceIds.size) this.controllers.disconnectAll(c.deviceIds);
    });
    ws.on('error', () => {});
  }

  private send(c: Client, m: ServerMessage) {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m));
  }

  private toHosts(m: ServerMessage) {
    for (const c of this.clients) if (c.trusted) this.send(c, m);
  }

  scheduleBroadcast() {
    if (this.pending || this.closed) return;
    this.pending = true;
    setImmediate(() => {
      this.pending = false;
      if (!this.closed) this.broadcast();
    });
  }

  broadcast() {
    const s = this.games.current;
    const now = Date.now();
    let host: GameView | null = null;
    let pub: GameView | null = null;
    let profiles = {};
    if (s) {
      profiles = this.games.profilesFor(s);
      const online = [...new Set([...this.clients].filter((c) => c.role === 'player' && c.profileId).map((c) => c.profileId!))];
      host = { ...projectState(s, 'host', profiles), online };
      pub = { ...projectState(s, 'public', profiles), online };
    }
    for (const c of this.clients) {
      if (!c.role) continue;
      if (c.role === 'host') this.send(c, { t: 'state', game: host, serverTime: now });
      else if (c.role === 'player') {
        const view = s ? { ...pub!, role: 'player' as const, roomCode: null } : null;
        this.send(c, { t: 'state', game: view, me: s && c.profileId ? playerContext(s, c.profileId, now) : null, serverTime: now });
      } else this.send(c, { t: 'state', game: pub, serverTime: now });
    }
  }

  sendControllers() {
    this.toHosts({ t: 'controllers', list: this.controllers.list(), listening: this.controllers.listening });
  }

  /** Tell every client that profile data changed (names, pictures, colours). */
  profilesChanged() {
    for (const c of this.clients) this.send(c, { t: 'profilesChanged' });
    this.scheduleBroadcast();
    this.lobby?.refreshSoon();
  }

  /** Profiles with a connected phone/portal. */
  onlineProfiles() {
    return [...new Set([...this.clients].filter((c) => c.role === 'player' && c.profileId).map((c) => c.profileId!))];
  }

  /** Feedback on a physical controller, sent only to the trusted window(s) that read it. */
  controllerFx(controllerId: string, fx: 'identify' | 'test' | 'buzzWin' | 'early') {
    for (const c of this.clients) if (c.trusted && c.deviceIds.has(controllerId)) this.send(c, { t: 'controllerFx', controllerId, fx });
  }

  private hostCount() {
    return [...this.clients].filter((c) => c.role === 'host' && !c.observer).length;
  }

  /** Public lobby info + presentation to the TV(s) and hosts (never to phones). */
  sendPresentation(only?: Client) {
    if (!this.lobby) return;
    const m: ServerMessage = { t: 'presentation', lobby: this.lobby.publicLobby(this.hostCount() > 0), p: this.lobby.presentation };
    if (only) return this.send(only, m);
    for (const c of this.clients) if (c.role === 'host' || c.role === 'public') this.send(c, m);
  }

  /** Revoke live connections of a profile (e.g. after a PIN reset or deletion). */
  dropProfile(profileId: string) {
    for (const c of this.clients) if (c.profileId === profileId && c.role === 'player') c.ws.close(4001, 'signed-out');
  }

  private onMessage(c: Client, raw: string) {
    // basic flood protection
    const now = Date.now();
    if (now - c.msgWindow > 1000) {
      c.msgWindow = now;
      c.msgCount = 0;
    }
    if (++c.msgCount > 120) return;
    if (raw.length > 20_000) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return this.send(c, { t: 'error', message: 'Invalid message' });
    }
    const parsed = ClientMessageSchema.safeParse(data);
    if (!parsed.success) return this.send(c, { t: 'error', message: 'Invalid message' });
    const m = parsed.data;

    if (m.t === 'ping') return this.send(c, { t: 'pong', c: m.c, s: Date.now() });

    if (m.t === 'hello') {
      const sess = readSession(this.db, m.token);
      if (m.role === 'host') {
        if (sess?.kind !== 'host') {
          this.send(c, { t: 'error', message: 'host-auth-required' });
          return c.ws.close(4003, 'host-auth-required');
        }
        c.role = 'host';
        c.trusted = true;
        c.observer = !!m.observer;
      } else if (m.role === 'player') {
        c.role = 'player';
        c.profileId = sess?.kind === 'profile' ? sess.profileId : null;
      } else {
        c.role = 'public';
        // A trusted local display (e.g. the Electron TV window) may present a host token to report keyboard/controller input.
        c.trusted = sess?.kind === 'host';
      }
      this.send(c, { t: 'welcome', role: c.role, profileId: c.profileId, trustedDevice: c.trusted, serverTime: Date.now() });
      if (c.role === 'player') {
        this.scheduleBroadcast();
        this.lobby?.refreshSoon();
      }
      else this.broadcastTo(c);
      if (c.trusted) this.send(c, { t: 'controllers', list: this.controllers.list(), listening: this.controllers.listening });
      if (c.role === 'host') this.sendPresentation();
      else if (c.role === 'public') this.sendPresentation(c);
      return;
    }
    if (!c.role) return this.send(c, { t: 'error', message: 'Say hello first' });

    switch (m.t) {
      case 'host': {
        if (c.role !== 'host') return this.send(c, { t: 'result', id: m.id, ok: false, error: 'Not authorized' });
        const a = hostActionSchema.safeParse(m.action);
        if (!a.success) return this.send(c, { t: 'result', id: m.id, ok: false, error: 'Invalid action' });
        const pre = this.validateRefs(a.data);
        if (pre) return this.send(c, { t: 'result', id: m.id, ok: false, error: pre });
        const res = this.games.dispatch(a.data, 'host');
        return this.send(c, res.ok ? { t: 'result', id: m.id, ok: true, info: res.info } : { t: 'result', id: m.id, ok: false, error: res.error });
      }
      case 'buzz': {
        if (c.role !== 'player' || !c.profileId) return this.send(c, { t: 'buzzResult', ok: false, info: 'sign-in-required' });
        if (now - c.lastBuzz < 150) return; // debounce rapid taps
        c.lastBuzz = now;
        const r = this.games.buzz({ controllerId: `phone:${c.profileId}`, kind: 'phone', profileId: c.profileId });
        return this.send(c, { t: 'buzzResult', ok: r.ok, info: r.info });
      }
      case 'join': {
        if (c.role !== 'player' || !c.profileId) return this.send(c, { t: 'result', ok: false, error: 'Sign in first' });
        c.joinFails = c.joinFails.filter((t) => now - t < 60_000);
        if (c.joinFails.length >= 5) return this.send(c, { t: 'result', ok: false, error: 'Too many wrong room codes — wait a minute and try again' });
        const res = this.games.dispatch({ type: 'playerJoin', profileId: c.profileId, code: m.code }, `profile:${c.profileId}`);
        if (!res.ok && /room code/.test(res.error)) c.joinFails.push(now);
        return this.send(c, res.ok ? { t: 'result', ok: true, info: res.info } : { t: 'result', ok: false, error: res.error });
      }
      case 'finalWager':
      case 'finalAnswer': {
        if (c.role !== 'player' || !c.profileId) return this.send(c, { t: 'result', ok: false, error: 'Sign in first' });
        const s = this.games.current;
        const comp = s?.competitors.find((x) => x.memberIds.includes(c.profileId!));
        if (!comp) return this.send(c, { t: 'result', ok: false, error: 'You are not playing in this game' });
        const res =
          m.t === 'finalWager'
            ? this.games.dispatch({ type: 'setFinalWager', competitorId: comp.id, amount: m.amount }, `profile:${c.profileId}`)
            : this.games.dispatch({ type: 'setFinalAnswer', competitorId: comp.id, answer: m.answer }, `profile:${c.profileId}`);
        return this.send(c, res.ok ? { t: 'result', ok: true } : { t: 'result', ok: false, error: res.error });
      }
      case 'controller': {
        if (!c.trusted) return;
        const ev = m.ev;
        if (ev.type !== 'disconnected') c.deviceIds.add(ev.controllerId);
        this.controllers.handle(ev);
        return;
      }
      case 'controllerFx': {
        if (c.role !== 'host') return;
        this.controllerFx(m.controllerId, m.fx);
        return;
      }
      case 'assignListen': {
        if (c.role !== 'host') return;
        this.controllers.listening = m.target ? { target: m.target, label: m.label } : null;
        return this.sendControllers();
      }
      case 'controllerConfig': {
        if (c.role !== 'host') return;
        this.controllers.configure(m.controllerId, { label: m.label, buzzButtons: m.buzzButtons });
        return;
      }
      case 'present': {
        if (c.role !== 'host') return;
        this.lobby?.present(m.req);
        return;
      }
      case 'controllerForget': {
        if (c.role !== 'host') return;
        this.controllers.forget(m.controllerId);
        return;
      }
    }
  }

  private validateRefs(a: HostAction): string | null {
    const ids: string[] = [];
    if (a.type === 'addPlayer') ids.push(a.profileId);
    if (a.type === 'addTeam') ids.push(...a.memberIds);
    if (a.type === 'assignMember') ids.push(a.profileId);
    for (const id of ids) if (!getProfile(this.db, id)) return 'Unknown player profile';
    return null;
  }

  private broadcastTo(c: Client) {
    const s = this.games.current;
    const now = Date.now();
    if (!s) return this.send(c, { t: 'state', game: null, me: null, serverTime: now });
    const profiles = this.games.profilesFor(s);
    const view = projectState(s, c.role === 'host' ? 'host' : c.role === 'player' ? 'player' : 'public', profiles);
    this.send(c, { t: 'state', game: view, me: c.role === 'player' && c.profileId ? playerContext(s, c.profileId, now) : null, serverTime: now });
  }

  closeAll() {
    this.closed = true;
    for (const c of this.clients) c.ws.close(1001, 'server-shutdown');
  }
}
