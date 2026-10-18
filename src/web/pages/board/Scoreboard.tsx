// Podium-style score strip along the bottom of the TV. No layout animations (they measure on every
// render); a score change briefly shows "+$400" / "−$400" in the score box itself (R6-5).
// R7-6: board control is a gold star left of the picture, in a slot that is always reserved (the
// picture and name never move); the buzz-in highlight stays the box's ring. R7-14: the lobby colour
// shows as a picture border, the name colour or both (TV presentation setting).
import type { CSSProperties } from 'react';
import type { CompetitorView, GameView } from '../../../shared/views';
import { Avatar, Lives, cx } from '../../components/ui';
import { readableTextOn } from '../../lib/avatars';
import { competitorAvatar, competitorColor, competitorName, profileName } from '../../lib/view';
import { useBoard, vhPx } from './common';
import { useFx } from './fx';
import { ScoreSwap } from './ScoreDelta';
import { ControlStar } from './ControlStar';

/** The board blue behind the names; coloured names are lightened just enough to stay readable. */
const NAME_BG = '#071277';

export function Scoreboard({ g }: { g: GameView }) {
  const early = new Set(g.phase === 'clue' && g.clue ? g.buzzer.early.map((e) => e.competitorId) : []);
  const buzzed = g.phase === 'clue' ? (g.buzzer.winner?.competitorId ?? null) : null;
  // Board control exists while the board is played (not in the Final or after the game).
  const control = g.phase === 'board' || g.phase === 'clue' ? g.controlCompetitorId : null;
  return (
    <div className="bt-scores" data-testid="scoreboard">
      {g.competitors.map((c) => (
        <Podium key={c.id} c={c} g={g} buzzed={buzzed === c.id} control={control === c.id} early={early.has(c.id)} />
      ))}
    </div>
  );
}

function Podium({ c, g, buzzed, control, early }: { c: CompetitorView; g: GameView; buzzed: boolean; control: boolean; early: boolean }) {
  const ctx = useBoard();
  const { scoreColor = 'picture' } = useFx();
  const color = competitorColor(c, g);
  const ring = scoreColor !== 'name';
  const nameColor = scoreColor !== 'picture' ? readableTextOn(color, NAME_BG) : undefined;
  return (
    <div
      className={cx('bt-podium', buzzed && 'is-winner', c.lives === 0 && 'is-out')}
      style={{ '--pc': color } as CSSProperties}
      data-testid="podium"
      data-control={control || undefined}
      data-highlight={buzzed ? 'buzz' : undefined}
      data-color-style={scoreColor}
    >
      <div className="bt-podium-name">
        <ControlStar on={control} />
        <span className={cx('bt-podium-ava', ring && 'is-ring')} data-testid="podium-avatar">
          <Avatar profile={competitorAvatar(c, g)} size={vhPx(ctx, 3.2)} ring={false} />
        </span>
        <span className="truncate" style={nameColor ? { color: nameColor } : undefined} data-testid="podium-name">
          {competitorName(c, g)}
        </span>
        {/* Mirrors the star slot so the picture and name stay centred in the box. */}
        <span className="bt-star-slot" aria-hidden />
        {control && <span className="sr-only">(picks the next clue)</span>}
      </div>
      {c.kind === 'team' && <div className="bt-podium-members">{c.memberIds.map((m) => profileName(g.profiles[m])).join(' · ')}</div>}
      <Score score={c.score} quiet={!!g.scoreCause?.quiet} />
      {c.lives !== undefined && (c.lives > 0 ? <Lives lives={c.lives} max={g.rules.survivalLives} size={vhPx(ctx, 1.9)} className="bt-podium-lives" /> : <span className="bt-out">OUT</span>)}
      {early && (
        <span className="bt-early" aria-label="Buzzed early">
          Early
        </span>
      )}
    </div>
  );
}

function Score({ score, quiet }: { score: number; quiet: boolean }) {
  return (
    <div className="bt-podium-score" data-testid="score" data-score={score}>
      <ScoreSwap score={score} quiet={quiet} />
    </div>
  );
}
