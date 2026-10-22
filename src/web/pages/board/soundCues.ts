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
  // R19-2 / R19-3 / R19-5: the Final's steps — the buzz-in ding when the last wager and the last
  // answer arrive (from the states themselves: once per phase, never again after a reconnect), and
  // the Final category's ding when the host shows the clue.
  if (g.final && p.final && g.phase === 'final') {
    const all = (v: GameView, k: 'hasWager' | 'submitted') => !!v.final && v.final.entries.length > 0 && v.final.entries.every((e) => e[k]);
    if (g.final.stage === 'wagers' && p.final.stage === 'wagers' && all(g, 'hasWager') && !all(p, 'hasWager')) out.push('buzz');
    if (g.final.stage === 'clue' && p.final.stage === 'clue' && all(g, 'submitted') && !all(p, 'submitted')) out.push('buzz');
    if (g.final.stage === 'clue' && p.final.stage === 'wagers') out.push('final');
  }
  if (g.clue && g.clue.clueId !== p.clue?.clueId && !g.clue.isDailyWager) out.push('clueSelect');
  if (g.buzzer.status === 'open' && p.buzzer.status !== 'open' && g.phase === 'clue') out.push('unlock');
  if (g.buzzer.winner && g.buzzer.winner.at !== p.buzzer.winner?.at) out.push('buzz');
  if (g.clue?.isDailyWager && g.clue.clueId !== p.clue?.clueId) out.push('dailyWager');
  // The think music ends on its own; no "time's up" on top of it.
  if (g.timer?.expired && !p.timer?.expired && g.timer.kind !== 'final') out.push('timeUp');
  if (g.phase === 'ended' && p.phase !== 'ended') out.push('winner');
  // R7-8: a Final Jeopardy! judgment sounds once, from the judgment itself — a $0 wager (common for
  // bots) changes no score but is still right or wrong.
  const judged = finalJudgments(p, g);
  if (judged !== null) {
    out.push(judged ? 'correct' : 'incorrect');
    return out;
  }
  // R7-11: manual adjustments and undo change the score silently.
  if (g.scoreCause?.quiet) return out;
  const before = new Map(p.competitors.map((c) => [c.id, c.score]));
  let delta = 0;
  for (const c of g.competitors) delta += c.score - (before.get(c.id) ?? c.score);
  if (g.phase !== 'ended') {
    if (delta > 0) out.push('correct');
    else if (delta < 0) out.push('incorrect');
  }
  return out;
}

/** The verdict of a Final answer judged between two states (null = none). */
function finalJudgments(p: GameView, g: GameView): boolean | null {
  if (!g.final || !p.final) return null;
  const was = new Map(p.final.entries.map((e) => [e.competitorId, e.judged]));
  let verdict: boolean | null = null;
  for (const e of g.final.entries) if (e.judged && was.get(e.competitorId) === false) verdict = !!e.correct;
  return verdict;
}
