import { useEffect, useState } from 'react';
import type { CompetitorView, GameView, ProfilePublic } from '../../shared/views';
import { timerRemaining, type TimerState } from '../../shared/game';
import { serverNow } from './socket';

export function profileName(p?: ProfilePublic | null) {
  if (!p) return 'Player';
  return p.nickname?.trim() || p.name;
}

export function competitorName(c: CompetitorView | undefined, g: GameView) {
  if (!c) return '';
  if (c.kind === 'player') return profileName(g.profiles[c.profileId!]);
  return c.name;
}

export function competitorColor(c: CompetitorView | undefined, g: GameView) {
  if (!c) return '#64748b';
  if (c.kind === 'player') return g.profiles[c.profileId!]?.color ?? c.color;
  return c.color;
}

/** Avatar-ish descriptor for a competitor: players use their profile, teams their logo. */
export function competitorAvatar(c: CompetitorView | undefined, g: GameView): Pick<ProfilePublic, 'name' | 'color' | 'avatar' | 'pictureUrl'> {
  if (!c) return { name: '', color: '#64748b', avatar: 'shield', pictureUrl: null };
  if (c.kind === 'player') {
    const p = g.profiles[c.profileId!];
    return { name: profileName(p), color: p?.color ?? c.color, avatar: p?.avatar ?? 'fox', pictureUrl: p?.pictureUrl ?? null };
  }
  return { name: c.name, color: c.color, avatar: c.avatar ?? 'shield', pictureUrl: null };
}

export function findCompetitor(g: GameView, id: string | null | undefined) {
  return g.competitors.find((c) => c.id === id);
}

/** Re-render periodically and return remaining milliseconds of a server timer. */
export function useTimer(t: TimerState | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!t?.running) return;
    const id = setInterval(() => setTick((x) => x + 1), 100);
    return () => clearInterval(id);
  }, [t?.running, t?.startedAt]);
  if (!t) return null;
  return timerRemaining(t, serverNow());
}

/** Whole seconds remaining on a server timer. Re-renders only when the displayed second changes
 *  (cheaper than useTimer on phones/tablets). Returns null when there is no timer. */
export function useTimerSeconds(t: TimerState | null) {
  const calc = () => (t ? Math.ceil(timerRemaining(t, serverNow()) / 1000) : null);
  const [secs, setSecs] = useState(calc);
  useEffect(() => {
    setSecs(calc());
    if (!t?.running) return;
    const id = setInterval(() => {
      const v = calc();
      setSecs((old) => (old === v ? old : v));
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.running, t?.startedAt, t?.remainingMs, !!t]);
  return t ? secs : null;
}

export const TIMER_LABELS: Record<string, string> = { buzz: 'Buzz in', answer: 'Answer', wager: 'Wager', final: 'Final', custom: 'Timer' };

export function phaseLabel(g: GameView) {
  if (g.paused) return 'Paused';
  switch (g.phase) {
    case 'lobby':
      return 'Setting up';
    case 'board':
      return `${g.rounds[g.roundIndex]?.name ?? 'Board'} — choose a clue`;
    case 'clue':
      return g.clue?.isDailyWager ? 'Daily Wager' : 'Clue';
    case 'final':
      return `Final — ${g.final?.stage ?? ''}`;
    case 'ended':
      return 'Game over';
  }
}
