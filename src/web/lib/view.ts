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
  if (c.bot) return c.name;
  if (c.kind === 'player') return profileName(g.profiles[c.profileId!]);
  return c.name;
}

export function competitorColor(c: CompetitorView | undefined, g: GameView) {
  if (!c) return '#64748b';
  if (c.bot) return c.color;
  if (c.kind === 'player') return g.profiles[c.profileId!]?.color ?? c.color;
  return c.color;
}

/** Avatar-ish descriptor for a competitor: players use their profile, teams their logo. */
export function competitorAvatar(c: CompetitorView | undefined, g: GameView): Pick<ProfilePublic, 'name' | 'color' | 'avatar' | 'pictureUrl'> {
  if (!c) return { name: '', color: '#64748b', avatar: 'shield', pictureUrl: null };
  if (c.bot) return { name: c.name, color: c.color, avatar: 'robot', pictureUrl: null };
  if (c.kind === 'player') {
    const p = g.profiles[c.profileId!];
    return { name: profileName(p), color: p?.color ?? c.color, avatar: p?.avatar ?? 'fox', pictureUrl: p?.pictureUrl ?? null };
  }
  return { name: c.name, color: c.color, avatar: c.avatar ?? 'shield', pictureUrl: null };
}

export function findCompetitor(g: GameView, id: string | null | undefined) {
  return g.competitors.find((c) => c.id === id);
}

/**
 * The one mustard highlight a score box gets (R6-3): the contestant who buzzed in wins over the
 * one picking clues, and while someone is buzzed in nobody else is highlighted. The picker's ring
 * comes back when the buzz is over (judged, timed out, clue closed).
 */
export function competitorHighlight(g: Pick<GameView, 'phase' | 'buzzer' | 'controlCompetitorId'>, id: string): 'buzz' | 'pick' | null {
  const buzzed = g.phase === 'clue' ? g.buzzer.winner?.competitorId : undefined;
  if (buzzed) return buzzed === id ? 'buzz' : null;
  return g.controlCompetitorId === id && (g.phase === 'board' || g.phase === 'clue') ? 'pick' : null;
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

export const TIMER_LABELS: Record<string, string> = { buzz: 'Buzz in', answer: 'Answer', wager: 'Wager', final: 'Final Jeopardy!', custom: 'Timer' };

export function phaseLabel(g: GameView) {
  if (g.paused) return 'Paused';
  switch (g.phase) {
    case 'lobby':
      return 'Setting up';
    case 'board':
      return g.intro ? `${g.rounds[g.intro.roundIndex]?.name ?? 'Round'} — introducing the categories` : `${g.rounds[g.roundIndex]?.name ?? 'Board'} — choose a clue`;
    case 'clue':
      return g.clue?.isDailyWager ? 'Daily Double!' : 'Clue';
    case 'final':
      return `Final Jeopardy! — ${({ category: 'category', wagers: 'wagers', clue: 'answers', reveal: 'reveal', done: 'done' } as Record<string, string>)[g.final?.stage ?? ''] ?? ''}`;
    case 'ended':
      return 'Game over';
  }
}

/** Unplayed clues left in the current round. */
export function cluesLeft(g: GameView) {
  return g.rounds[g.roundIndex]?.categories.reduce((a, c) => a + c.clues.filter((q) => !q.used).length, 0) ?? 0;
}

/** R10-10: what follows the current round once it has no clues left — the next standard round,
 *  the Final, or (neither) the end of the game. Works for any number of rounds. */
export function nextStage(g: GameView): { kind: 'round'; index: number; name: string } | { kind: 'final' } | { kind: 'end' } {
  const index = g.rounds.findIndex((r, i) => i > g.roundIndex && r.kind === 'standard');
  if (index >= 0) return { kind: 'round', index, name: g.rounds[index].name };
  return g.rounds.some((r) => r.kind === 'final') ? { kind: 'final' } : { kind: 'end' };
}
