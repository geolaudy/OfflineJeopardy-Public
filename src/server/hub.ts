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
import { BuzzCheck } from './buzzCheck.js';
import { rttQuality, type BuzzCheckExpected, type ConnectionRow } from '../shared/buzzCheck.js';
import type { InputKind } from '../shared/game.js';
import { performance } from 'node:perf_hooks';
import { ClockSync } from './clockSync.js';
import { correctPress, deviceCapMs } from './buzzTiming.js';
import { LatencyDisplay } from './lobbyLatency.js';
import type { BuzzDevice } from './gameManager.js';
import type { BuzzFairness } from '../shared/buzzTiming.js';

/** R6-22 clock probes: a burst on connect / new clue, then every 500 ms while a clue is up
 *  (also keeps phone Wi-Fi out of power save), every 3 s otherwise. */
const PROBE_BURST = 5;
const PROBE_BURST_MS = 100;
const PROBE_CLUE_MS = 500;
const PROBE_IDLE_MS = 3000;
/** R7-4: how often the lobby's phone delays are re-read (shown values change rarely). */
const LATENCY_MS = 2000;

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
  rtt: number | null; // last round trip the client reported
  /** R6-22: server-measured clock offset / round trip (phones and controller bridges). */
  sync: ClockSync;
  nextProbe: number;
  burst: number;
}

export class Hub {
  private clients = new Set<Client>();
  private pending = false;
  private closed = false;

  lobby: LobbyManager | null = null;
  readonly check = new BuzzCheck();
  private probeTimer: NodeJS.Timeout | null = null;
  private latencyTimer: NodeJS.Timeout | null = null;
  private latency = new LatencyDisplay();
  private lastClueKey = '';

  constructor(
    private db: DB,
    private games: GameManager,
    private controllers: ControllerRegistry,
  ) {
    games.onChange = () => {
      this.scheduleBroadcast();
      this.lobby?.refreshSoon();
      // A new clue: fresh clock samples from every buzzer device right away.
      const clue = games.current?.clue;
      const key = clue ? `${games.current!.id}:${clue.clueId}` : '';
      if (key && key !== this.lastClueKey) for (const c of this.clients) c.burst = PROBE_BURST;
      this.lastClueKey = key;
    };
    games.buzzDevices = (mode) => this.buzzDevices(mode);
    this.probeTimer = setInterval(() => this.probe(), PROBE_BURST_MS);
    this.probeTimer.unref?.();
    this.latencyTimer = setInterval(() => this.refreshLatency(), LATENCY_MS);
    this.latencyTimer.unref?.();
    controllers.onChange = () => this.sendControllers();
    controllers.onInput = (controllerId, button, at) => this.toHosts({ t: 'controllerInput', controllerId, button, at });
    this.check.onChange = () => this.sendBuzzCheck();
  }

  // ---------- buzzer check (Z11) ----------

  private profileName(id: string) {
    const p = getProfile(this.db, id);
    return p ? p.nickname || p.display_name : 'Player';
  }

  // ---------- fair buzzer timing (R6-22) ----------

  /** Phones and controller bridges are probed; TVs and host tablets are not. */
  private probed(c: Client) {
    return (c.role === 'player' && !!c.profileId) || (c.trusted && c.deviceIds.size > 0);
  }

  private probe() {
    if (this.closed) return;
    const mono = performance.now();
    const clueUp = this.games.current?.phase === 'clue';
    for (const c of this.clients) {
      if (!this.probed(c) || c.ws.readyState !== 1 || mono < c.nextProbe) continue;
      this.send(c, { t: 'sync', n: c.sync.probe(mono) });
      if (c.burst > 0) c.burst--;
      c.nextProbe = mono + (c.burst > 0 ? PROBE_BURST_MS : clueUp ? PROBE_CLUE_MS : PROBE_IDLE_MS) - 5;
    }
  }

  private fairness(): BuzzFairness {
    return this.games.current?.rules.buzzFairness ?? 'standard';
  }

  /** Every connected buzzer device with how far its presses may be corrected right now. */
  buzzDevices(mode: BuzzFairness): BuzzDevice[] {
    const mono = performance.now();
    const out: BuzzDevice[] = [];
    for (const c of this.clients) {
      if (!this.probed(c)) continue;
      const est = c.sync.estimate(mono);
      if (c.role === 'player' && c.profileId) out.push({ controllerId: `phone:${c.profileId}`, profileId: c.profileId, capMs: deviceCapMs('phone', est, mode) });
      for (const id of c.deviceIds) {
        const kind = this.controllers.list().find((d) => d.id === id)?.kind ?? 'keyboard';
        out.push({ controllerId: id, capMs: deviceCapMs(kind, est, mode) });
      }
    }
    return out;
  }

  /** R7-4: smoothed phone delay for the TV lobby cards (server-measured round trips only); the
   *  lobby is rebuilt only when a shown value changes. */
  private refreshLatency() {
    const current = new Map<string, number | null>();
    for (const c of this.clients) {
      if (c.role !== 'player' || !c.profileId) continue;
      const rtt = c.sync.rtt;
      const prev = current.get(c.profileId);
      current.set(c.profileId, prev == null ? rtt : rtt == null ? prev : Math.min(prev, rtt));
    }
    if (this.latency.update(current)) this.lobby?.refreshSoon();
  }

  /** R7-31 developer diagnostics: every connection's role and clock sync, numbered instead of
   *  named (no ids, names, tokens or addresses, so the report can be shared). */
  diagnostics() {
    const mono = performance.now();
    const round = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
    let n = 0;
    return [...this.clients].map((c) => {
      const est = c.sync.estimate(mono);
      const probed = this.probed(c);
      return {
        connection: ++n,
        role: c.role ?? 'connecting',
        kind: c.observer ? 'game computer' : c.role === 'host' ? (c.trusted ? 'host' : 'host (not signed in)') : c.role === 'player' ? (c.profileId ? 'player' : 'portal') : c.role === 'public' ? 'TV / public' : 'connecting',
        controllers: c.deviceIds.size,
        clockSync: probed
          ? { synced: est.synced, rttMedianMs: round(est.rttMedian), jitterMs: round(est.jitter), uncertaintyMs: round(est.uSync), samples: est.samples }
          : null,
        clientReportedRttMs: round(c.rtt),
        lobbyDelayShownMs: c.role === 'player' && c.profileId ? (this.latency.get(c.profileId) ?? null) : null,
      };
    });
  }

  /** Shown phone delay of a player (undefined while measuring or not connected). */
  phoneLatency(profileId: string) {
    return this.latency.get(profileId);
  }

  /** Phones connected right now with their delay (measured by the server when available). */
  connections(): ConnectionRow[] {
    const best = new Map<string, number | null>();
    for (const c of this.clients) {
      if (c.role !== 'player' || !c.profileId) continue;
      const prev = best.get(c.profileId);
      const rtt = c.sync.rtt ?? c.rtt;
      best.set(c.profileId, prev == null ? rtt : rtt == null ? prev : Math.min(prev, rtt));
    }
    return [...best].map(([id, rtt]) => ({ name: this.profileName(id), rttMs: rtt, quality: rttQuality(rtt) })).sort((a, b) => a.name.localeCompare(b.name));
  }

  startBuzzCheck() {
    const expected: BuzzCheckExpected[] = [];
    for (const id of this.onlineProfiles()) expected.push({ key: `phone:${id}`, name: this.profileName(id), kind: 'phone' });
    for (const d of this.controllers.list()) if (d.connected) expected.push({ key: d.id, name: this.controllerName(d.id, d.label), kind: d.kind });
    this.check.start(expected); // phones ping right away when told a check started (fresh delay numbers)
  }

  /** The player a controller is assigned to in the current game, else its own label. */
  private controllerName(controllerId: string, label: string) {
    const g = this.games.current;
    const b = g?.bindings.find((x) => x.controllerId === controllerId);
    if (!g || !b) return label;
    if (b.target.kind === 'profile') return this.profileName(b.target.profileId);
    const target = b.target;
    return g.competitors.find((c) => c.id === target.competitorId)?.name || label;
  }

  /** A controller press during a check: recorded, and kept away from the game. */
  checkControllerPress(controllerId: string, kind: InputKind, label: string): boolean {
    if (!this.check.active) return false;
    return this.check.press({ key: controllerId, name: this.controllerName(controllerId, label), kind, label, rttMs: null });
  }

  sendBuzzCheck(only?: Client) {
    const view = this.check.view;
    const hostMsg: ServerMessage = { t: 'buzzCheck', view, connections: this.connections() };
    for (const c of only ? [only] : this.clients) {
      if (c.role === 'host') this.send(c, hostMsg);
      else if (c.role === 'player' && c.profileId && (view || only))
        this.send(c, { t: 'buzzCheckMine', active: !!view?.active, endsAt: view?.endsAt ?? 0, pressed: this.check.pressed(`phone:${c.profileId}`) });
    }
  }

  get size() {
    return this.clients.size;
  }

  attach(ws: WebSocket) {
    const c: Client = { ws, role: null, profileId: null, trusted: false, deviceIds: new Set(), lastBuzz: 0, msgCount: 0, msgWindow: Date.now(), joinFails: [], rtt: null, sync: new ClockSync(), nextProbe: 0, burst: PROBE_BURST };
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
      const pickHint = this.games.pickHint;
      host = { ...projectState(s, 'host', profiles), online, pickHint };
      pub = { ...projectState(s, 'public', profiles), online, pickHint };
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

  /** R12-12: a buzzer test in the lobby — every screen lights that player's (or team's) lobby card. */
  lobbyBuzz(competitorId: string, profileId: string | null) {
    const m: ServerMessage = { t: 'lobbyBuzz', competitorId, profileId, at: Date.now() };
    for (const c of this.clients) if (c.role) this.send(c, m);
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
    // Arrival time first, before any parsing (R6-22: the press is measured from here).
    const mono = performance.now();
    // basic flood protection
    const now = Date.now();
    if (now - c.msgWindow > 1000) {
      c.msgWindow = now;
      c.msgCount = 0;
    }
    // Phones and TVs: 120 messages a second. The host and the game computer's input bridge (every
    // Joy-Con/key press *and* release of all controllers on one connection) get far more room, and
    // a dropped host action is answered instead of silently ignored.
    const limit = c.trusted || c.role === 'host' ? 2000 : 120;
    if (++c.msgCount > limit) {
      if (c.role === 'host' && /"t":"host"/.test(raw.slice(0, 40))) {
        const id = Number(/"id":(\d+)/.exec(raw)?.[1]);
        if (Number.isFinite(id)) this.send(c, { t: 'result', id, ok: false, error: 'Too many actions at once — try again' });
      }
      return;
    }
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

    if (m.t === 'ping') {
      if (m.rtt != null) c.rtt = m.rtt;
      return this.send(c, { t: 'pong', c: m.c, s: Date.now() });
    }
    if (m.t === 'syncR') {
      c.sync.reply(m.n, m.c, m.e, mono);
      return;
    }

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
      if (c.role === 'host' || (c.role === 'player' && this.check.view)) this.sendBuzzCheck(c);
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
        // During a buzzer check the press is recorded for the check only.
        if (this.check.press({ key: `phone:${c.profileId}`, name: this.profileName(c.profileId), kind: 'phone', label: 'Phone', rttMs: c.sync.rtt ?? c.rtt })) return this.send(c, { t: 'buzzResult', ok: true, info: 'check' });
        const timing = correctPress('phone', { arrival: mono, clientAt: m.p, clientEpoch: m.e }, c.sync.estimate(mono), this.fairness());
        const r = this.games.buzz({ controllerId: `phone:${c.profileId}`, kind: 'phone', profileId: c.profileId, timing });
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
      case 'pickColor': {
        if (c.role !== 'player' || !c.profileId) return this.send(c, { t: 'result', ok: false, error: 'Sign in first' });
        const res = this.games.dispatch({ type: 'setPlayerColor', profileId: c.profileId, color: m.color }, `profile:${c.profileId}`);
        return this.send(c, res.ok ? { t: 'result', ok: true } : { t: 'result', ok: false, error: res.error });
      }
      case 'pickTeam':
      case 'teamIdentity':
      case 'nickname': {
        if (c.role !== 'player' || !c.profileId) return this.send(c, { t: 'result', ok: false, error: 'Sign in first' });
        const pid = c.profileId;
        const team = this.games.current?.competitors.find((x) => x.kind === 'team' && x.memberIds.includes(pid));
        if (m.t === 'teamIdentity' && !team) return this.send(c, { t: 'result', ok: false, error: 'Join a team first' });
        const res =
          m.t === 'pickTeam'
            ? this.games.dispatch({ type: 'joinTeam', profileId: pid, competitorId: m.competitorId }, `profile:${pid}`)
            : m.t === 'teamIdentity'
              ? this.games.dispatch({ type: 'setTeamIdentity', profileId: pid, competitorId: team!.id, name: m.name, color: m.color }, `profile:${pid}`)
              : this.games.dispatch({ type: 'setNickname', profileId: pid, nickname: m.nickname }, `profile:${pid}`);
        return this.send(c, res.ok ? { t: 'result', ok: true } : { t: 'result', ok: false, error: res.error });
      }
      case 'dailyWager': {
        if (c.role !== 'player' || !c.profileId) return this.send(c, { t: 'result', ok: false, error: 'Sign in first' });
        const comp = this.games.current?.competitors.find((x) => x.memberIds.includes(c.profileId!));
        if (!comp) return this.send(c, { t: 'result', ok: false, error: 'You are not playing in this game' });
        const res = this.games.dispatch({ type: 'submitDailyWager', competitorId: comp.id, profileId: c.profileId, amount: m.amount }, `profile:${c.profileId}`);
        return this.send(c, res.ok ? { t: 'result', ok: true } : { t: 'result', ok: false, error: res.error });
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
            : this.games.dispatch({ type: 'setFinalAnswer', competitorId: comp.id, answer: m.answer, submit: m.submit !== false }, `profile:${c.profileId}`);
        return this.send(c, res.ok ? { t: 'result', ok: true } : { t: 'result', ok: false, error: res.error });
      }
      case 'controller': {
        if (!c.trusted) return;
        const ev = m.ev;
        if (ev.type !== 'disconnected') c.deviceIds.add(ev.controllerId);
        // R6-22: a Joy-Con/keyboard press is corrected only for the TV window's own delay (its
        // event timestamp vs. arrival, at most 30 ms) — never by phone network rules.
        const at = ev.type === 'button' ? ev.at : undefined;
        const e = ev.type === 'button' ? ev.e : undefined;
        this.controllers.handle(ev, now, (kind) => correctPress(kind, { arrival: mono, clientAt: at, clientEpoch: e }, c.sync.estimate(mono), this.fairness()));
        return;
      }
      case 'controllerFx': {
        if (c.role !== 'host') return;
        this.controllerFx(m.controllerId, m.fx);
        return;
      }
      case 'buzzCheck': {
        if (c.role !== 'host') return;
        if (m.action === 'start') this.startBuzzCheck();
        else if (m.action === 'stop') this.check.stop();
        else this.sendBuzzCheck(c);
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
    const view = { ...projectState(s, c.role === 'host' ? 'host' : c.role === 'player' ? 'player' : 'public', profiles), pickHint: this.games.pickHint };
    this.send(c, { t: 'state', game: view, me: c.role === 'player' && c.profileId ? playerContext(s, c.profileId, now) : null, serverTime: now });
  }

  closeAll() {
    this.closed = true;
    this.check.dispose();
    if (this.probeTimer) clearInterval(this.probeTimer);
    if (this.latencyTimer) clearInterval(this.latencyTimer);
    for (const c of this.clients) c.ws.close(1001, 'server-shutdown');
  }
}
