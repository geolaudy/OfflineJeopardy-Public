// Resilient WebSocket client + Zustand store for live game state.
import { create } from 'zustand';
import type { ControllerInfo, ServerMessage } from '../../shared/protocol';
import type { GameView, PlayerContext } from '../../shared/views';
import type { HostAction } from '../../shared/actions';
import type { BindingTarget } from '../../shared/game';

type Role = 'host' | 'public' | 'player';
export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'unauthorized';

interface LiveState {
  status: ConnStatus;
  role: Role | null;
  game: GameView | null;
  me: PlayerContext | null;
  profileId: string | null;
  trustedDevice: boolean;
  offset: number; // serverTime - clientTime
  controllers: ControllerInfo[];
  listening: { target: BindingTarget; label?: string } | null;
  lastInput: { controllerId: string; button: string; at: number } | null;
  profilesVersion: number;
  lastBuzz: { ok: boolean; info?: string; at: number } | null;
  /** True once the first state snapshot has arrived on this connection. */
  ready: boolean;
}

export const useLive = create<LiveState>(() => ({
  status: 'connecting',
  role: null,
  game: null,
  me: null,
  profileId: null,
  trustedDevice: false,
  offset: 0,
  controllers: [],
  listening: null,
  lastInput: null,
  profilesVersion: 0,
  lastBuzz: null,
  ready: false,
}));

let ws: WebSocket | null = null;
let currentRole: Role = 'public';
let tokenFn: () => string | null | undefined = () => null;
let retry = 0;
let reqId = 1;
const pending = new Map<number, (r: { ok: boolean; error?: string; info?: string }) => void>();
let pingTimer: ReturnType<typeof setInterval> | null = null;
let stopped = false;

export function connect(role: Role, getToken: () => string | null | undefined) {
  currentRole = role;
  tokenFn = getToken;
  stopped = false;
  open();
}

export function reconnectNow() {
  retry = 0;
  ws?.close();
  if (!ws) open();
}

export function disconnect() {
  stopped = true;
  ws?.close();
  ws = null;
}

function open() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const sock = new WebSocket(`${proto}://${location.host}/ws`);
  ws = sock;
  useLive.setState({ status: retry ? 'reconnecting' : 'connecting', role: currentRole });
  sock.onopen = () => {
    retry = 0;
    sock.send(JSON.stringify({ t: 'hello', role: currentRole, token: tokenFn() ?? undefined }));
    ping();
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(ping, 10_000);
  };
  sock.onmessage = (e) => handle(JSON.parse(e.data) as ServerMessage);
  sock.onclose = (e) => {
    if (pingTimer) clearInterval(pingTimer);
    for (const [, cb] of pending) cb({ ok: false, error: 'Connection lost' });
    pending.clear();
    if (ws === sock) ws = null;
    if (stopped) return;
    if (e.code === 4003) {
      useLive.setState({ status: 'unauthorized' });
      return;
    }
    retry++;
    useLive.setState({ status: 'reconnecting' });
    setTimeout(() => !stopped && !ws && open(), Math.min(5000, 300 * 2 ** Math.min(retry, 4)));
  };
}

function ping() {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'ping', c: Date.now() }));
}

function handle(m: ServerMessage) {
  switch (m.t) {
    case 'welcome':
      useLive.setState({ status: 'open', role: m.role, profileId: m.profileId, trustedDevice: m.trustedDevice });
      break;
    case 'state': {
      // Structural sharing: keep the previous object for every unchanged part of the state so
      // React/Zustand selectors see stable references and only the changed parts re-render.
      const prev = useLive.getState();
      const game = replaceEqualDeep(prev.game, m.game);
      const me = replaceEqualDeep(prev.me, m.me ?? null);
      if (game === prev.game && me === prev.me && prev.ready) break;
      useLive.setState({ game, me, ready: true });
      break;
    }
    case 'pong': {
      const now = Date.now();
      const rtt = now - m.c;
      useLive.setState({ offset: m.s - (m.c + rtt / 2) });
      break;
    }
    case 'result':
      if (m.id != null) {
        pending.get(m.id)?.({ ok: m.ok, error: m.error, info: m.info });
        pending.delete(m.id);
      } else if (!m.ok && m.error) window.dispatchEvent(new CustomEvent('oj-error', { detail: m.error }));
      break;
    case 'controllers':
      useLive.setState({ controllers: m.list, listening: m.listening });
      break;
    case 'controllerInput':
      useLive.setState({ lastInput: { controllerId: m.controllerId, button: m.button, at: m.at } });
      break;
    case 'buzzResult':
      useLive.setState({ lastBuzz: { ok: m.ok, info: m.info, at: Date.now() } });
      break;
    case 'profilesChanged':
      useLive.setState((s) => ({ profilesVersion: s.profilesVersion + 1 }));
      break;
    case 'error':
      if (m.message === 'host-auth-required') useLive.setState({ status: 'unauthorized' });
      break;
  }
}

export function send(msg: unknown) {
  if (ws?.readyState === 1) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

/** Send a host action and await the server's verdict. */
export function act(action: HostAction): Promise<{ ok: boolean; error?: string; info?: string }> {
  const id = reqId++;
  return new Promise((resolve) => {
    if (!send({ t: 'host', id, action })) return resolve({ ok: false, error: 'Not connected to the game computer' });
    pending.set(id, resolve);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ ok: false, error: 'No response from the game computer' });
      }
    }, 8000);
  });
}

export const serverNow = () => Date.now() + useLive.getState().offset;

/** Returns `prev` (or parts of it) wherever `next` is deep-equal, so unchanged subtrees keep identity. */
export function replaceEqualDeep<T>(prev: unknown, next: T): T {
  if (prev === next) return prev as T;
  if (Array.isArray(prev) && Array.isArray(next)) {
    let same = prev.length === next.length;
    const out = next.map((v, i) => {
      const r = replaceEqualDeep(prev[i], v);
      if (r !== prev[i]) same = false;
      return r;
    });
    return (same ? prev : out) as T;
  }
  if (isPlainObject(prev) && isPlainObject(next)) {
    const pk = Object.keys(prev);
    const nk = Object.keys(next);
    let same = pk.length === nk.length;
    const out: Record<string, unknown> = {};
    for (const k of nk) {
      out[k] = replaceEqualDeep(prev[k], next[k]);
      if (out[k] !== prev[k] || !(k in prev)) same = false;
    }
    return (same ? prev : out) as T;
  }
  return next;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}
