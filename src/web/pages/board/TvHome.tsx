// TV home screen when no lobby is open (R5-2): logo, a short welcome, "waiting for the host",
// the last few games (board, date, winner, winning score, players) and — when the host chooses
// one on the iPad — that game's recap. Built only from the server's public presentation data;
// no lobby controls, no settings, no board categories here.
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, Crown, PauseCircle, Users } from 'lucide-react';
import type { GameSummaryCard, PresentationState, RecentGameCard } from '../../../shared/presentation';
import { Avatar, cx, fmtScore } from '../../components/ui';
import { shortDate } from '../../components/PersonName';
import { useBoard } from './common';
import { EASE_OUT_ARR, T } from './timing';
import './home.css';

export function TvHome({ p, status, hostUrl, logo }: { p: PresentationState | null; status: string; hostUrl: string | null; logo?: React.ReactNode }) {
  const home = p?.home;
  const recap = p?.page === 'game' ? p.game : null;
  return (
    <div className="tvh" data-testid="tv-home">
      <AnimatePresence mode="wait" initial={false}>
        {recap ? (
          <motion.div key={`game:${recap.id}`} className="tvh-in" initial={{ opacity: 0, x: '3vw' }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: '-2vw' }} transition={{ duration: T.page, ease: EASE_OUT_ARR }}>
            <Recap g={recap} />
          </motion.div>
        ) : (
          <motion.div key="home" className="tvh-in" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: T.page }}>
            <header className="tvh-hero">
              {logo}
              <h1 className="tvh-logo">
                Offline<span>Jeopardy</span>
              </h1>
              <p className="tvh-sub">The game-show quiz for your living room</p>
              <p className="tvh-status" role="status" data-testid="tv-home-status">
                <i className={cx('tvh-dot', status === 'open' && 'is-on')} aria-hidden />
                {status === 'open' ? 'Welcome! Waiting for the host to open a lobby.' : 'Connecting…'}
              </p>
              {home?.unfinished && (
                <p className="tvh-paused" data-testid="tv-home-paused">
                  <PauseCircle aria-hidden /> Paused game: <b>{home.unfinished.title}</b> — the host can resume it.
                </p>
              )}
            </header>
            {home && home.recent.length > 0 && (
              <section className="tvh-recent" aria-label="Recent games">
                <p className="tvh-kicker">Recent games</p>
                <div className="tvh-cards" style={{ '--n': Math.min(3, home.recent.length) } as CSSProperties}>
                  {home.recent.slice(0, 3).map((r, i) => (
                    <RecentCard key={r.id} r={r} i={i} />
                  ))}
                </div>
              </section>
            )}
            {hostUrl && <p className="tvh-foot">Host controller (iPad): <span>{hostUrl}</span></p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RecentCard({ r, i }: { r: RecentGameCard; i: number }) {
  const ctx = useBoard();
  const w = r.winners[0];
  return (
    <motion.article
      className="tvh-card"
      style={{ '--pc': w?.color ?? 'var(--b-accent)' } as CSSProperties}
      initial={{ opacity: 0, y: '3vh' }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: T.fade, ease: EASE_OUT_ARR, delay: 0.15 + i * 0.08 }}
      data-testid="tv-recent-game"
    >
      <p className="tvh-card-board">{r.boardTitle}</p>
      <p className="tvh-card-meta">
        <CalendarDays aria-hidden /> {shortDate(r.endedAt)}
        <span className="tvh-card-sep" />
        <Users aria-hidden /> {r.mode === 'team' ? `${r.teams} teams` : `${r.players + r.bots} players`}
        {r.practice && <span className="tvh-card-tag">Practice</span>}
      </p>
      {w ? (
        <div className="tvh-card-winner">
          <span className="tvh-card-av">
            <Avatar profile={{ name: w.name, color: w.color, avatar: w.avatar, pictureUrl: w.pictureUrl }} size={Math.round(ctx.vh * 0.085)} />
            <Crown className="tvh-crown" aria-hidden />
          </span>
          <span className="tvh-card-name">
            <span>{r.winners.map((x) => x.name).join(' & ')}</span>
            <small>{r.winners.length > 1 ? 'Shared win' : 'Winner'}</small>
          </span>
          {r.winningScore != null && <span className="tvh-card-score">{fmtScore(r.winningScore)}</span>}
        </div>
      ) : (
        <p className="tvh-card-none">No winner recorded</p>
      )}
    </motion.article>
  );
}

/** A finished game shown from the host's recent games (R5-2.3): final standings. */
export function Recap({ g }: { g: GameSummaryCard }) {
  const ctx = useBoard();
  const rows = g.standings.slice(0, 8);
  const mins = g.startedAt ? Math.max(1, Math.round((g.endedAt - g.startedAt) / 60000)) : null;
  return (
    <div className="tvh-recap" data-testid="tv-game-recap">
      <p className="tvh-kicker">Game recap · {shortDate(g.endedAt)}</p>
      <h1 className="tvh-recap-title">{g.boardTitle}</h1>
      <p className="tvh-recap-meta">
        {g.mode === 'team' ? 'Teams' : 'Individuals'} · {g.cluesPlayed} clues played{mins ? ` · ${mins} min` : ''}
        {g.practice ? ' · Practice game' : ''}
      </p>
      <ol className="tvh-standings">
        {rows.map((s, i) => (
          <motion.li
            key={`${s.name}:${i}`}
            className={cx('tvh-standing', s.isWinner && 'is-winner')}
            style={{ '--pc': s.color } as CSSProperties}
            initial={{ opacity: 0, x: '-2vw' }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: T.fade, ease: EASE_OUT_ARR, delay: 0.1 + i * 0.07 }}
          >
            <span className="tvh-rank">{s.placement ?? '–'}</span>
            <Avatar profile={{ name: s.name, color: s.color, avatar: s.avatar, pictureUrl: s.pictureUrl }} size={Math.round(ctx.vh * 0.065)} />
            <span className="tvh-standing-name">
              <span>
                {s.isWinner && <Crown className="tvh-crown-inline" aria-label="Winner" />}
                {s.name}
              </span>
              {s.team && s.members.length > 0 && <small>{s.members.join(', ')}</small>}
            </span>
            <span className="tvh-standing-stats">
              {s.correct} right · {s.incorrect} wrong
            </span>
            <span className="tvh-standing-score">{s.score == null ? '—' : fmtScore(s.score)}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
