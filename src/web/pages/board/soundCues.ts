// Which one-shot sound cues a TV state change triggers (R2-22). Pure, for tests; the Final think
// music (start/stop with offsets) stays in BoardPage's useSounds.
import type { GameView } from '../../../shared/views';
import type { SoundCue } from '../../../shared/tvFx';

export function transitionCues(p: GameView, g: GameView): SoundCue[] {
  const out: SoundCue[] = [];
  // Categories / new round. The board fill sound starts with its animation (Intro.tsx, R4-19).
  // One swipe sound per step change, forwards or backwards (R5-12: Previous / jump to a category).
  if (g.intro && p.intro && g.intro.roundIndex === p.intro.roundIndex && g.intro.step !== p.intro.step) out.push('categoryIntro');
  if (p.phase === 'lobby') {
    if (g.phase === 'board' && !g.intro) out.push('boardIntro'); // board appears without an intro
  } else if (p.roundIndex !== g.roundIndex && g.phase !== 'final') out.push('roundEnd');
  // R6-4: the Final moves roundIndex too, but it has its own cue — the new-round sound (which
  // plays with the board fill) must not sound for a split second underneath it.
  if (g.phase === 'final' && p.phase !== 'final') out.push('final');
  if (g.clue && g.clue.clueId !== p.clue?.clueId && !g.clue.isDailyWager) out.push('clueSelect');
  if (g.buzzer.status === 'open' && p.buzzer.status !== 'open' && g.phase === 'clue') out.push('unlock');
  if (g.buzzer.winner && g.buzzer.winner.at !== p.buzzer.winner?.at) out.push('buzz');
  if (g.clue?.isDailyWager && g.clue.clueId !== p.clue?.clueId) out.push('dailyWager');
  // The think music ends on its own; no "time's up" on top of it.
  if (g.timer?.expired && !p.timer?.expired && g.timer.kind !== 'final') out.push('timeUp');
  if (g.phase === 'ended' && p.phase !== 'ended') out.push('winner');
  const before = new Map(p.competitors.map((c) => [c.id, c.score]));
  let delta = 0;
  for (const c of g.competitors) delta += c.score - (before.get(c.id) ?? c.score);
  if (g.phase !== 'ended') {
    if (delta > 0) out.push('correct');
    else if (delta < 0) out.push('incorrect');
  }
  return out;
}
