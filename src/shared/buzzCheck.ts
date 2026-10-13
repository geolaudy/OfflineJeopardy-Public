// Buzzer check (Z11): before a game the host asks everyone to press their buzzer once. Presses are
// recorded in arrival order and never reach the game. Phones also report their connection delay.
import type { InputKind } from './game.js';

export interface BuzzCheckPress {
  key: string; // controller id, or phone:<profileId>
  name: string; // player name, or the controller's label when it is not assigned
  kind: InputKind;
  label: string; // device label ("Joy-Con (L)", "Phone", "Key A")
  order: number; // 1 = first
  afterMs: number; // since the first press of this check
  rttMs: number | null; // phone round-trip time when known
}

export interface BuzzCheckExpected {
  key: string;
  name: string;
  kind: InputKind;
}

export interface ConnectionRow {
  name: string;
  rttMs: number | null;
  quality: Quality;
}

export type Quality = 'good' | 'ok' | 'poor' | 'unknown';

export interface BuzzCheckView {
  active: boolean;
  startedAt: number;
  endsAt: number;
  presses: BuzzCheckPress[];
  /** Connected devices that have not pressed yet. */
  waiting: BuzzCheckExpected[];
}

/** Phone round-trip time on a home network: under 60 ms is great, over 150 ms is noticeable. */
export function rttQuality(ms: number | null | undefined): Quality {
  if (ms == null) return 'unknown';
  return ms < 60 ? 'good' : ms < 150 ? 'ok' : 'poor';
}

export const QUALITY_LABEL: Record<Quality, string> = { good: 'Good', ok: 'OK', poor: 'Slow', unknown: 'Measuring…' };
