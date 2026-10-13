// Input bridge for trusted local windows (the Electron app on the game PC).
// Reads Nintendo Joy-Cons via WebHID, other controllers via the Gamepad API and
// keyboard keys, and forwards raw button edges to the server's unified buzzer engine.
import { onControllerFx, send } from './socket';
import { encodeRumble, RUMBLE_OFF, RUMBLE_PATTERNS, type RumbleFx } from '../../shared/joyconRumble';
import type { ControllerEvent } from '../../shared/protocol';

const NINTENDO = 0x057e;
const PRODUCTS: Record<number, { side: 'L' | 'R' | null; label: string }> = {
  0x2006: { side: 'L', label: 'Joy-Con (L)' },
  0x2007: { side: 'R', label: 'Joy-Con (R)' },
  0x2009: { side: null, label: 'Pro Controller' },
};

// Standard full input report (0x30) button bits — see RESEARCH_NOTES.md.
const RIGHT_BITS = ['Y', 'X', 'B', 'A', 'SR', 'SL', 'R', 'ZR'];
const SHARED_BITS = ['MINUS', 'PLUS', 'RSTICK', 'LSTICK', 'HOME', 'CAPTURE', '', ''];
const LEFT_BITS = ['DOWN', 'UP', 'RIGHT', 'LEFT', 'SR', 'SL', 'L', 'ZL'];

type HIDDeviceLike = {
  vendorId: number;
  productId: number;
  productName: string;
  opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(id: number, data: Uint8Array): Promise<void>;
  addEventListener(t: 'inputreport', cb: (e: { reportId: number; data: DataView }) => void): void;
  removeEventListener(t: 'inputreport', cb: (e: { reportId: number; data: DataView }) => void): void;
};
type HIDLike = {
  getDevices(): Promise<HIDDeviceLike[]>;
  requestDevice(o: { filters: { vendorId: number; productId?: number }[] }): Promise<HIDDeviceLike[]>;
  addEventListener(t: 'connect' | 'disconnect', cb: (e: { device: HIDDeviceLike }) => void): void;
};

function emit(ev: ControllerEvent) {
  send({ t: 'controller', ev });
}

// ---------------- Joy-Con (WebHID) ----------------

interface JoyConHandle {
  device: HIDDeviceLike;
  id: string;
  side: 'L' | 'R' | null;
  label: string;
  pressed: Set<string>;
  packet: number;
  rumbling?: boolean;
  onReport: (e: { reportId: number; data: DataView }) => void;
}

const joycons = new Map<HIDDeviceLike, JoyConHandle>();
let seq = 0;

async function subcommand(h: JoyConHandle, cmd: number, args: number[] = []) {
  const rumble = [...RUMBLE_OFF, ...RUMBLE_OFF];
  h.packet = (h.packet + 1) & 0x0f;
  await h.device.sendReport(0x01, new Uint8Array([h.packet, ...rumble, cmd, ...args]));
}

/** Rumble-only output report (0x10): same 4 bytes for both halves (a single Joy-Con uses its own). */
async function rumbleReport(h: JoyConHandle, amp: number) {
  const side = amp > 0 ? encodeRumble(320, 160, amp) : [...RUMBLE_OFF];
  h.packet = (h.packet + 1) & 0x0f;
  await h.device.sendReport(0x10, new Uint8Array([h.packet, ...side, ...side]));
}

async function playRumble(h: JoyConHandle, fx: RumbleFx) {
  if (h.rumbling) return; // never stack patterns
  h.rumbling = true;
  try {
    for (const [amp, ms] of RUMBLE_PATTERNS[fx]) {
      // Joy-Cons stop vibrating on their own after a moment, so long steps are refreshed.
      const end = Date.now() + ms;
      do {
        await rumbleReport(h, amp);
        await new Promise((r) => setTimeout(r, Math.min(80, Math.max(0, end - Date.now()))));
      } while (Date.now() < end);
    }
  } catch {
    /* device went away */
  } finally {
    await rumbleReport(h, 0).catch(() => {});
    h.rumbling = false;
  }
}

function decodeButtons(h: JoyConHandle, e: { reportId: number; data: DataView }): Set<string> | null {
  const d = e.data;
  const now = new Set<string>();
  if ((e.reportId === 0x30 || e.reportId === 0x21) && d.byteLength >= 5) {
    const r = d.getUint8(2);
    const s = d.getUint8(3);
    const l = d.getUint8(4);
    RIGHT_BITS.forEach((n, i) => {
      if (r & (1 << i) && h.side !== 'L') now.add(n);
    });
    SHARED_BITS.forEach((n, i) => {
      if (n && s & (1 << i)) now.add(n);
    });
    LEFT_BITS.forEach((n, i) => {
      if (l & (1 << i) && h.side !== 'R') now.add(n);
    });
    return now;
  }
  if (e.reportId === 0x3f && d.byteLength >= 2) {
    // Simple HID mode (before our mode switch takes effect): treat set bits generically.
    for (let byte = 0; byte < 2; byte++) for (let bit = 0; bit < 8; bit++) if (d.getUint8(byte) & (1 << bit)) now.add(`BTN${byte * 8 + bit}`);
    return now;
  }
  return null;
}

async function readMac(h: JoyConHandle): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      h.device.removeEventListener('inputreport', on);
      resolve(null);
    }, 1200);
    const on = (e: { reportId: number; data: DataView }) => {
      // 0x21 reply: data[13] = subcommand id; device info payload starts at data[14]; MAC at data[18..23]
      if (e.reportId !== 0x21 || e.data.byteLength < 24 || e.data.getUint8(13) !== 0x02) return;
      clearTimeout(timer);
      h.device.removeEventListener('inputreport', on);
      const mac = Array.from({ length: 6 }, (_, i) => e.data.getUint8(18 + i).toString(16).padStart(2, '0')).join('');
      resolve(mac);
    };
    h.device.addEventListener('inputreport', on);
    subcommand(h, 0x02).catch(() => resolve(null));
  });
}

async function attachJoyCon(device: HIDDeviceLike) {
  const info = PRODUCTS[device.productId];
  if (device.vendorId !== NINTENDO || !info || joycons.has(device)) return;
  try {
    if (!device.opened) await device.open();
  } catch {
    return; // in use by another application
  }
  const h: JoyConHandle = { device, id: '', side: info.side, label: info.label, pressed: new Set(), packet: 0, onReport: () => {} };
  joycons.set(device, h);
  const mac = await readMac(h);
  h.id = `joycon:${mac ?? `${info.side ?? 'P'}-${++seq}`}`;
  h.onReport = (e) => {
    const now = decodeButtons(h, e);
    if (!now) return;
    for (const b of now) if (!h.pressed.has(b)) emit({ type: 'button', controllerId: h.id, kind: 'joycon', label: h.label, side: h.side, button: b, pressed: true });
    for (const b of h.pressed) if (!now.has(b)) emit({ type: 'button', controllerId: h.id, button: b, pressed: false });
    h.pressed = now;
  };
  device.addEventListener('inputreport', h.onReport);
  emit({ type: 'connected', controllerId: h.id, kind: 'joycon', label: h.label, side: h.side });
  try {
    await subcommand(h, 0x03, [0x30]); // standard full input report mode
    await subcommand(h, 0x30, [0x01]); // player light 1 so players see it's connected
    await subcommand(h, 0x48, [0x01]); // enable vibration (feedback when buzzing)
  } catch {
    /* ignore — simple mode still works */
  }
}

function detachJoyCon(device: HIDDeviceLike) {
  const h = joycons.get(device);
  if (!h) return;
  device.removeEventListener('inputreport', h.onReport);
  joycons.delete(device);
  if (h.id) emit({ type: 'disconnected', controllerId: h.id });
}

export async function identifyJoyCon(controllerId: string) {
  for (const h of joycons.values())
    if (h.id === controllerId) {
      void playRumble(h, 'identify');
      // flash the player lights for ~2 seconds
      for (let i = 0; i < 4; i++) {
        await subcommand(h, 0x30, [i % 2 ? 0x0f : 0x00]).catch(() => {});
        await new Promise((r) => setTimeout(r, 250));
      }
      await subcommand(h, 0x30, [0x01]).catch(() => {});
    }
}

function hid(): HIDLike | null {
  return (navigator as unknown as { hid?: HIDLike }).hid ?? null;
}

export function webHidAvailable() {
  return !!hid();
}

/** Ask for permission to Nintendo controllers (needs a user gesture in browsers; Electron auto-grants). */
export async function scanJoyCons() {
  const h = hid();
  if (!h) return 0;
  try {
    const picked = await h.requestDevice({ filters: [{ vendorId: NINTENDO }] });
    for (const d of picked) await attachJoyCon(d);
  } catch {
    /* user cancelled */
  }
  for (const d of await h.getDevices()) await attachJoyCon(d);
  return joycons.size;
}

// ---------------- Gamepad API (other controllers) ----------------

const padState = new Map<string, boolean[]>();
let padTimer: ReturnType<typeof setInterval> | null = null;

function pollPads() {
  const pads = navigator.getGamepads?.() ?? [];
  const seen = new Set<string>();
  for (const gp of pads) {
    if (!gp) continue;
    // Nintendo controllers are handled through WebHID when available (avoids double input).
    if (joycons.size && /057e/i.test(gp.id)) continue;
    const id = `gamepad:${gp.index}:${gp.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 30)}`;
    seen.add(id);
    const prev = padState.get(id);
    const cur = gp.buttons.map((b) => b.pressed);
    if (!prev) emit({ type: 'connected', controllerId: id, kind: 'gamepad', label: gp.id.slice(0, 40) || `Controller ${gp.index + 1}` });
    cur.forEach((p, i) => {
      if (p !== (prev?.[i] ?? false)) emit({ type: 'button', controllerId: id, kind: 'gamepad', button: `B${i}`, pressed: p });
    });
    padState.set(id, cur);
  }
  for (const id of [...padState.keys()])
    if (!seen.has(id)) {
      padState.delete(id);
      emit({ type: 'disconnected', controllerId: id });
    }
}

// ---------------- Keyboard ----------------

const RESERVED = new Set(['F11', 'F12', 'Escape', 'Tab', 'F5', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight']);
let keyboardOn = false;
function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
function onKey(e: KeyboardEvent) {
  if (!keyboardOn || e.repeat || RESERVED.has(e.code) || isTyping(e) || e.ctrlKey || e.metaKey) return;
  const pressed = e.type === 'keydown';
  emit({ type: 'button', controllerId: `kb:${e.code}`, kind: 'keyboard', label: `Key ${e.key.length === 1 ? e.key.toUpperCase() : e.code}`, button: e.code, pressed });
}

// ---------------- lifecycle ----------------

let keysStarted = false;
let devicesStarted = false;
/** keyboard: capture keyboard buzzers in this window; devices: read Joy-Cons (WebHID) + gamepads. */
export async function startInputBridge(opts: { keyboard: boolean; devices: boolean }) {
  keyboardOn = opts.keyboard;
  if (opts.keyboard && !keysStarted) {
    keysStarted = true;
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
  }
  if (!opts.devices || devicesStarted) return;
  devicesStarted = true;
  padTimer = setInterval(pollPads, 16);
  // Feedback the server routes to this window (host taps Identify/Test, or a Joy-Con buzzes).
  onControllerFx((id, fx) => {
    for (const h of joycons.values()) if (h.id === id) void (fx === 'identify' ? identifyJoyCon(id) : playRumble(h, fx));
  });
  const h = hid();
  if (h) {
    h.addEventListener('connect', (e) => void attachJoyCon(e.device));
    h.addEventListener('disconnect', (e) => detachJoyCon(e.device));
    for (const d of await h.getDevices().catch(() => [])) await attachJoyCon(d);
  }
}

export function setKeyboardBuzzers(on: boolean) {
  keyboardOn = on;
}

/** Re-announce connected devices after the WebSocket reconnects. */
export function reannounce() {
  for (const h of joycons.values()) if (h.id) emit({ type: 'connected', controllerId: h.id, kind: 'joycon', label: h.label, side: h.side });
  padState.clear();
}

export function stopInputBridge() {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  if (padTimer) clearInterval(padTimer);
  keysStarted = false;
  devicesStarted = false;
}
