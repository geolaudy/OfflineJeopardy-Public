// Buzzer check state (Z11). Short-lived and in memory only: nothing is saved or counted.
import type { BuzzCheckExpected, BuzzCheckView } from '../shared/buzzCheck.js';
import type { InputKind } from '../shared/game.js';

export const CHECK_SECONDS = 20;

export class BuzzCheck {
  view: BuzzCheckView | null = null;
  onChange: () => void = () => {};
  private timer: NodeJS.Timeout | null = null;
  private firstAt: number | null = null;

  constructor(private clock: () => number = Date.now) {}

  get active() {
    return !!this.view?.active;
  }

  start(expected: BuzzCheckExpected[], seconds = CHECK_SECONDS) {
    this.clearTimer();
    const now = this.clock();
    this.firstAt = null;
    this.view = { active: true, startedAt: now, endsAt: now + seconds * 1000, presses: [], waiting: expected };
    this.timer = setTimeout(() => this.stop(), seconds * 1000);
    this.onChange();
  }

  /** Ends the check but keeps the results on screen until the next one. */
  stop() {
    this.clearTimer();
    if (!this.view?.active) return;
    this.view = { ...this.view, active: false, endsAt: this.clock() };
    this.onChange();
  }

  /** Records a press while a check runs. Returns true when the press was used by the check (not the game). */
  press(p: { key: string; name: string; kind: InputKind; label: string; rttMs: number | null }): boolean {
    const v = this.view;
    if (!v?.active) return false;
    if (v.presses.some((x) => x.key === p.key)) return true; // first press only; still never reaches the game
    const now = this.clock();
    this.firstAt ??= now;
    v.presses.push({ ...p, order: v.presses.length + 1, afterMs: now - this.firstAt });
    v.waiting = v.waiting.filter((w) => w.key !== p.key);
    this.onChange();
    return true;
  }

  pressed(key: string) {
    return !!this.view?.presses.some((p) => p.key === key);
  }

  dispose() {
    this.clearTimer();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
