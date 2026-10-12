// Registry of physical input devices (Joy-Cons, keyboards, gamepads). Devices are
// detected by trusted local clients (the Electron windows) and reported here.
// Controllers are interchangeable input devices — never player identities.
import type { DB } from './db/db.js';
import type { BindingTarget, InputKind } from '../shared/game.js';
import { isBuzzButton, type ControllerEvent, type ControllerInfo } from '../shared/protocol.js';
import { InputFilter } from './engine/buzzer.js';

export interface ControllerHandlers {
  onPress: (p: { controllerId: string; kind: InputKind; label: string; button: string; at: number }) => void;
  onAssign: (p: { controllerId: string; kind: InputKind; label: string; target: BindingTarget }) => void;
}

export class ControllerRegistry {
  private devices = new Map<string, ControllerInfo>();
  readonly filter = new InputFilter(120);
  listening: { target: BindingTarget; label?: string } | null = null;
  onChange: () => void = () => {};
  onInput: (controllerId: string, button: string, at: number) => void = () => {};

  constructor(
    private db: DB,
    private handlers: ControllerHandlers,
  ) {
    const rows = db.prepare('SELECT * FROM controllers').all() as { id: string; kind: InputKind; label: string; side: 'L' | 'R' | null; buzz_buttons: string }[];
    for (const r of rows)
      this.devices.set(r.id, { id: r.id, kind: r.kind, label: r.label, side: r.side, connected: false, buzzButtons: r.buzz_buttons, lastButton: null, lastInputAt: null, presses: 0 });
  }

  list(): ControllerInfo[] {
    return [...this.devices.values()].sort((a, b) => Number(b.connected) - Number(a.connected) || a.label.localeCompare(b.label));
  }

  get(id: string) {
    return this.devices.get(id);
  }

  private upsert(id: string, kind: InputKind, label: string, side: 'L' | 'R' | null) {
    let d = this.devices.get(id);
    const now = Date.now();
    if (!d) {
      d = { id, kind, label, side, connected: true, buzzButtons: 'any', lastButton: null, lastInputAt: null, presses: 0 };
      this.devices.set(id, d);
      this.db
        .prepare('INSERT OR IGNORE INTO controllers (id, kind, label, side, buzz_buttons, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, kind, label, side, 'any', now, now);
    } else {
      d.connected = true;
      this.db.prepare('UPDATE controllers SET last_seen_at = ? WHERE id = ?').run(now, id);
    }
    return d;
  }

  handle(ev: ControllerEvent, at = Date.now()) {
    if (ev.type === 'connected') {
      this.upsert(ev.controllerId, ev.kind, ev.label, ev.side ?? null);
      this.filter.reset(ev.controllerId);
      this.onChange();
      return;
    }
    if (ev.type === 'disconnected') {
      const d = this.devices.get(ev.controllerId);
      if (d) d.connected = false;
      this.filter.reset(ev.controllerId);
      this.onChange();
      return;
    }
    // button
    let d = this.devices.get(ev.controllerId);
    if (!d || !d.connected) {
      const kind = ev.kind ?? 'keyboard';
      d = this.upsert(ev.controllerId, kind, ev.label ?? defaultLabel(kind, ev.controllerId), ev.side ?? null);
      this.onChange();
    }
    const buzzButton = isBuzzButton(d.buzzButtons, ev.button);
    if (!this.filter.accept({ controllerId: ev.controllerId, kind: d.kind, button: ev.button, pressed: ev.pressed, at }, buzzButton || !!this.listening)) return;
    d.lastButton = ev.button;
    d.lastInputAt = at;
    d.presses++;
    this.onInput(d.id, ev.button, at);
    // Controller assignment: the next press from any controller is bound to the waiting target.
    if (this.listening && !(d.kind === 'keyboard' && ev.button === 'Escape')) {
      const l = this.listening;
      this.listening = null;
      this.handlers.onAssign({ controllerId: d.id, kind: d.kind, label: d.label, target: l.target });
      this.onChange();
      return;
    }
    if (!buzzButton) return;
    this.handlers.onPress({ controllerId: d.id, kind: d.kind, label: d.label, button: ev.button, at });
  }

  configure(id: string, patch: { label?: string; buzzButtons?: string }) {
    const d = this.devices.get(id);
    if (!d) return false;
    if (patch.label) d.label = patch.label;
    if (patch.buzzButtons) d.buzzButtons = patch.buzzButtons;
    this.db.prepare('UPDATE controllers SET label = ?, buzz_buttons = ? WHERE id = ?').run(d.label, d.buzzButtons, id);
    this.onChange();
    return true;
  }

  forget(id: string) {
    this.devices.delete(id);
    this.db.prepare('DELETE FROM controllers WHERE id = ?').run(id);
    this.onChange();
  }

  /** Mark every device from a disconnected bridge client as disconnected. */
  disconnectAll(ids: Iterable<string>) {
    let changed = false;
    for (const id of ids) {
      const d = this.devices.get(id);
      if (d?.connected) {
        d.connected = false;
        this.filter.reset(id);
        changed = true;
      }
    }
    if (changed) this.onChange();
  }
}

function defaultLabel(kind: InputKind, id: string) {
  if (kind === 'keyboard') return `Key ${id.replace(/^kb:(Key|Digit)?/, '')}`;
  return id;
}
