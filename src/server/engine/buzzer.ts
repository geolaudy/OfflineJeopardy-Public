// Unified buzzer input layer. Every device (Joy-Con, phone, keyboard, gamepad) is
// reduced to a RawPress, filtered (edge-trigger + debounce), resolved to a
// competitor/profile, and then submitted to the single engine 'buzz' action.
import type { GameState, Id, InputKind } from '../../shared/game.js';
import { competitorForProfile } from './engine.js';

export interface RawButtonEvent {
  controllerId: Id;
  kind: InputKind;
  button: string;
  pressed: boolean;
  at: number;
}

/**
 * Edge-triggered, debounced button filter. Emits a press only on an up->down
 * transition, ignores held buttons, and ignores presses within `debounceMs` of the
 * previous accepted press on the same controller.
 */
export class InputFilter {
  private down = new Map<string, Set<string>>();
  private lastPress = new Map<string, number>();
  constructor(public debounceMs = 120) {}

  accept(ev: RawButtonEvent): boolean {
    let set = this.down.get(ev.controllerId);
    if (!set) this.down.set(ev.controllerId, (set = new Set()));
    if (!ev.pressed) {
      set.delete(ev.button);
      return false;
    }
    if (set.has(ev.button)) return false; // held / repeated report
    set.add(ev.button);
    const last = this.lastPress.get(ev.controllerId);
    if (last !== undefined && ev.at - last < this.debounceMs) return false;
    this.lastPress.set(ev.controllerId, ev.at);
    return true;
  }

  /** Forget controller state (e.g. on disconnect) so a stuck "down" can't block it. */
  reset(controllerId: Id) {
    this.down.delete(controllerId);
    this.lastPress.delete(controllerId);
  }
}

export type Resolution =
  | { ok: true; competitorId: Id; profileId: Id | null }
  | { ok: false; reason: 'unassigned' | 'not-playing' | 'shared-team-device' | 'unassigned-player' };

/**
 * Resolve an input to the competitor that is buzzing and, when identifiable, the
 * individual profile. Phones identify a profile directly via the authenticated
 * session; physical controllers go through bindings.
 */
export function resolveInput(s: GameState, input: { controllerId: Id; profileId?: Id | null }): Resolution {
  if (input.profileId) {
    // Phone buzzer: explicit binding to a team wins (e.g. phone used as shared buzzer)
    const b = s.bindings.find((x) => x.controllerId === input.controllerId);
    if (b?.target.kind === 'competitor') return { ok: true, competitorId: b.target.competitorId, profileId: null };
    const c = competitorForProfile(s, input.profileId);
    if (!c) return { ok: false, reason: s.unassigned.some((u) => u.profileId === input.profileId) ? 'unassigned-player' : 'not-playing' };
    if (c.kind === 'team' && c.buzzerMode === 'shared') return { ok: false, reason: 'shared-team-device' };
    return { ok: true, competitorId: c.id, profileId: input.profileId };
  }
  const b = s.bindings.find((x) => x.controllerId === input.controllerId);
  if (!b) return { ok: false, reason: 'unassigned' };
  if (b.target.kind === 'competitor') {
    const competitorId = b.target.competitorId;
    if (!s.competitors.some((c) => c.id === competitorId)) return { ok: false, reason: 'not-playing' };
    return { ok: true, competitorId, profileId: null };
  }
  const c = competitorForProfile(s, b.target.profileId);
  if (!c) return { ok: false, reason: 'unassigned-player' };
  // Shared-buzzer teams buzz only through the device bound to the team itself.
  if (c.kind === 'team' && c.buzzerMode === 'shared') return { ok: false, reason: 'shared-team-device' };
  return { ok: true, competitorId: c.id, profileId: b.target.profileId };
}
