// Podium-style score strip along the bottom of the TV. No layout animations (they measure on every
// render); score changes get a brief one-shot pop and a "+$400" / "−$400" label instead (R5-7).
import type { CSSProperties } from 'react';
import type { CompetitorView, GameView } from '../../../shared/views';
import { Avatar, Lives, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorColor, competitorName, profileName } from '../../lib/view';
import { useBoard, useScoreChange, vhPx } from './common';
import { ScoreDelta } from './ScoreDelta';
import { T } from './timing';

export function Scoreboard({ g }: { g: GameView }) {
  const early = new Set(g.phase === 'clue' && g.clue ? g.buzzer.early.map((e) => e.competitorId) : []);
  return (
    <div className="bt-scores" data-testid="scoreboard">
      {g.competitors.map((c) => (
        <Podium
          key={c.id}
          c={c}
          g={g}
          winner={g.buzzer.winner?.competitorId === c.id}
          control={g.controlCompetitorId === c.id && (g.phase === 'board' || g.phase === 'clue')}
          early={early.has(c.id)}
        />
      ))}
    </div>
  );
}

function Podium({ c, g, winner, control, early }: { c: CompetitorView; g: GameView; winner: boolean; control: boolean; early: boolean }) {
  const ctx = useBoard();
  return (
    <div className={cx('bt-podium', winner && 'is-winner', control && 'is-control', c.lives === 0 && 'is-out')} style={{ '--pc': competitorColor(c, g) } as CSSProperties} data-testid="podium" data-control={control || undefined}>
      <div className="bt-podium-name">
        <Avatar profile={competitorAvatar(c, g)} size={vhPx(ctx, 3.2)} />
        <span className="truncate">{competitorName(c, g)}</span>
        {control && <span className="sr-only">(picks the next clue)</span>}
      </div>
      {c.kind === 'team' && <div className="bt-podium-members">{c.memberIds.map((m) => profileName(g.profiles[m])).join(' · ')}</div>}
      <Score score={c.score} />
      {c.lives !== undefined && (c.lives > 0 ? <Lives lives={c.lives} max={g.rules.survivalLives} size={vhPx(ctx, 1.9)} className="bt-podium-lives" /> : <span className="bt-out">OUT</span>)}
      {early && (
        <span className="bt-early" aria-label="Buzzed early">
          Early
        </span>
      )}
    </div>
  );
}

function Score({ score }: { score: number }) {
  const change = useScoreChange(score);
  return (
    <div
      className={cx('bt-podium-score', score < 0 && 'is-neg', change && (change.delta > 0 ? 'bt-flash-up' : 'bt-flash-down'))}
      style={{ '--bt-flash': `${T.scoreFlash}s` } as CSSProperties}
      data-testid="score"
    >
      <span className="bt-score-wrap">
        {/* Re-keyed on change so the one-shot pop restarts. */}
        <span key={change?.n ?? 0} className="bt-score-num">
          {fmtScore(score)}
        </span>
        <ScoreDelta change={change} />
      </span>
    </div>
  );
}
