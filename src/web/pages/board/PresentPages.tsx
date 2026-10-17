// Public pages the host can present on the TV (R2-7). Rendered ONLY from the server's explicit
// presentation payload (public profiles/stats, category names without clues, rules summary,
// controller readiness without device ids).
//
// Layout (R6-8/R6-9): the compact lobby panel sits in the top-right corner, so every page puts its
// heading in the band to its left (.tvp-band) and its primary content in ONE content panel
// (.tvp-panel) across the full width below. Column counts follow the panel's measured width.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Bot, Crown, Gamepad2, Keyboard, Lock, Smartphone, Sparkles, Trophy } from 'lucide-react';
import type { PresentationState, PresentPage, RosterRow, SettingsSection } from '../../../shared/presentation';
import { Avatar, cx } from '../../components/ui';
import { avatarEmoji } from '../../lib/avatars';
import { profileName } from '../../lib/view';
import { useBoard, vhPx } from './common';
import { fitCards, useBoxSize } from './presentKit';
import { EASE_OUT_ARR, T } from './timing';
import { RecapHead, RecapStandings } from './TvHome';

/** Stable identity of what is presented (a new key cross-fades; a data refresh does not). */
export function pageKey(p: PresentationState | null): string {
  if (!p) return 'lobby';
  switch (p.page) {
    case 'player':
      return `player:${p.player?.profile.id ?? ''}`;
    case 'leaderboard':
      return `leaderboard:${p.leaderboard?.viewLabel ?? ''}:${p.leaderboard?.metricLabel ?? ''}`;
    case 'board':
      return `board:${p.board?.id ?? ''}`;
    case 'tournament':
      return `tournament:${p.tournament?.id ?? ''}`;
    case 'team':
      return `team:${p.team?.id ?? ''}`;
    case 'game':
      return `game:${p.game?.id ?? ''}`;
    case 'compare':
      return `compare:${p.compare && 'a' in p.compare ? `${p.compare.a.profile.id}:${p.compare.b.profile.id}` : 'x'}`;
    default:
      return p.page;
  }
}

export function PresentedPage({ p }: { p: PresentationState }) {
  return (
    <motion.div
      className="tvp-page"
      data-testid="tv-present-page"
      data-page={p.page}
      initial={{ opacity: 0, x: '2.5vw' }}
      animate={{ opacity: 1, x: 0, transition: { duration: T.page, ease: EASE_OUT_ARR, delay: T.page * 0.25 } }}
      exit={{ opacity: 0, x: '-1.5vw', transition: { duration: T.page * 0.6, ease: EASE_OUT_ARR } }}
    >
      <PageBody p={p} />
    </motion.div>
  );
}

function PageBody({ p }: { p: PresentationState }) {
  switch (p.page) {
    case 'leaderboard':
      return p.leaderboard ? <LeaderboardPage d={p.leaderboard} /> : <Missing page={p.page} />;
    case 'player':
      return p.player ? <PlayerPage d={p.player} /> : <Missing page={p.page} />;
    case 'players':
      return p.players ? <PlayersPage d={p.players} /> : <Missing page={p.page} />;
    case 'teams':
      return p.teams ? <TeamsPage d={p.teams} /> : <Missing page={p.page} />;
    case 'team':
      return p.team ? <TeamPage d={p.team} /> : <Missing page={p.page} />;
    case 'boards':
      return p.boards ? <BoardsPage d={p.boards} /> : <Missing page={p.page} />;
    case 'board':
      return p.board ? <BoardDetailPage d={p.board} /> : <Missing page={p.page} />;
    case 'rules':
      return p.rules ? <RulesPage d={p.rules} /> : <Missing page={p.page} />;
    case 'buzzers':
      return p.buzzers ? <BuzzersPage d={p.buzzers} /> : <Missing page={p.page} />;
    case 'compare':
      return p.compare ? <ComparePage d={p.compare} /> : <Missing page={p.page} />;
    case 'tournament':
      // Standings use the leaderboard layout.
      return p.tournament ? <LeaderboardPage d={{ kicker: p.tournament.finished ? 'Tournament · final standings' : 'Tournament standings', viewLabel: '', metricLabel: p.tournament.name, minNote: p.tournament.note, rows: p.tournament.rows, unranked: 0, empty: 'No games finished yet' }} /> : <Missing page={p.page} />;
    case 'game':
      return p.game ? <GamePage g={p.game} /> : <Missing page={p.page} />;
    default:
      return null;
  }
}

/** Page heading in the band left of the compact lobby panel. */
function Head({ kicker, title, sub, aside }: { kicker: string; title: string; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="tvp-head tvp-page-head tvp-band">
      <div className="min-w-0 flex-1">
        <p className="tvp-kicker">{kicker}</p>
        <h1 className="tvp-title">{title}</h1>
        {sub ? <p className="tvp-sub">{sub}</p> : null}
      </div>
      {aside}
    </header>
  );
}

/** The page's one content panel (R6-9). */
function Panel({ children, className, testId }: { children?: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={cx('tvp-panel', className)} data-testid={testId}>
      {children}
    </div>
  );
}

/** Measured content box inside a panel, in px and in vh. */
function useFill() {
  const ctx = useBoard();
  const ref = useRef<HTMLDivElement>(null);
  const box = useBoxSize(ref);
  return { ref, box, wVh: (box.w / ctx.vh) * 100, hVh: (box.h / ctx.vh) * 100 };
}

/** Columns of at least `minVh` (in vh) that fit `wVh`, between 1 and `max`. */
const colsFor = (wVh: number, minVh: number, gapVh: number, max: number) => Math.max(1, Math.min(max, Math.floor((wVh + gapVh) / (minVh + gapVh))));

function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="tvp-empty">
      <p className="tvp-empty-title">{title}</p>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

function Missing({ page }: { page: PresentPage }) {
  return (
    <>
      <Head kicker={page === 'player' ? 'Player' : 'Presenting'} title="Nothing to show" />
      <Panel>
        <Empty title="This page is not available right now." />
      </Panel>
    </>
  );
}

/** Staggered entrance for list items (transform/opacity only). */
const item = (i: number) => ({
  initial: { opacity: 0, y: '1.5vh' },
  animate: { opacity: 1, y: 0, transition: { duration: T.fade, ease: EASE_OUT_ARR, delay: T.page * 0.4 + Math.min(i, 12) * 0.04 } },
});

// ---------------------------------------------------------------- Leaderboard

function LeaderboardPage({ d }: { d: NonNullable<PresentationState['leaderboard']> & { kicker?: string; empty?: string } }) {
  const ctx = useBoard();
  const fill = useFill();
  const n = d.rows.length;
  // Up to 6 rows in one column; more go into two columns (ranks run down the first column) when
  // the panel is wide enough for two readable columns — never more than two.
  const two = n > 6 && fill.wVh >= 95;
  const perCol = two ? Math.ceil(n / 2) : Math.max(1, n);
  const rowVh = Math.max(3.4, Math.min(8.5, (fill.hVh - (perCol - 1) * 0.9) / perCol));
  return (
    <>
      <Head kicker={d.kicker ?? `Leaderboard · ${d.viewLabel}`} title={d.metricLabel} sub={d.minNote} />
      <Panel>
        {n === 0 ? (
          d.empty ? <Empty title={d.empty} /> : <Empty title="No ranked players yet">Play a few games to appear on the leaderboard.</Empty>
        ) : (
          <div ref={fill.ref} className="tvp-fill">
            {fill.box.h > 0 && (
              <ol className={cx('tvp-lb', two && 'is-two')} style={{ '--row': `${rowVh}vh`, '--per-col': perCol } as CSSProperties}>
                {d.rows.map((r, i) => (
                  <motion.li key={r.id} className={cx('tvp-lb-row', r.rank <= 3 && `is-top is-top-${r.rank}`)} style={{ '--pc': r.color } as CSSProperties} {...item(i)} data-testid="tv-leader-row">
                    <span className="tvp-lb-rank">{r.rank}</span>
                    <Avatar profile={r} size={vhPx(ctx, rowVh * 0.66)} />
                    <span className="tvp-lb-who">
                      <span className="tvp-lb-name">{r.name}</span>
                      {r.secondary && <span className="tvp-lb-sec">{r.secondary}</span>}
                    </span>
                    {r.rank === 1 && <Crown className="tvp-lb-crown" aria-hidden />}
                    <span className="tvp-lb-value">{r.value}</span>
                  </motion.li>
                ))}
              </ol>
            )}
          </div>
        )}
        {d.unranked > 0 && (
          <p className="tvp-foot">
            {d.unranked} more {d.unranked === 1 ? 'player is' : 'players are'} not ranked yet.
          </p>
        )}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Player

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const shortDate = (t: number) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

function PlayerPage({ d }: { d: NonNullable<PresentationState['player']> }) {
  const ctx = useBoard();
  const name = profileName(d.profile);
  const realName = d.profile.nickname?.trim() && d.profile.nickname.trim() !== d.profile.name ? d.profile.name : null;
  const s = d.stats;
  const tiles = s
    ? [
        { k: 'Solo games', v: String(s.soloGames) },
        { k: 'Solo wins', v: String(s.soloWins) },
        { k: 'Accuracy', v: s.accuracy },
        { k: 'Best score', v: s.bestScore },
        { k: 'Team games', v: String(s.teamGames) },
        { k: 'Team wins', v: String(s.teamWins) },
        { k: 'Team contribution', v: s.contribution },
        { k: 'Buzz speed', v: s.buzzSpeed },
      ]
    : [];
  return (
    <div className="tvp-player" style={{ '--pc': d.profile.color } as CSSProperties}>
      <header className="tvp-player-top tvp-band">
        <Avatar profile={d.profile} size={vhPx(ctx, 14)} />
        <div className="min-w-0">
          <p className="tvp-kicker">Player</p>
          <h1 className="tvp-title tvp-title-xl truncate">{name}</h1>
          {realName && <p className="tvp-sub">{realName}</p>}
        </div>
      </header>
      <Panel className="tvp-player-panel">
        {d.private ? (
          <div className="tvp-empty tvp-private">
            <Lock aria-hidden />
            <p className="tvp-empty-title">{name} keeps their statistics private.</p>
          </div>
        ) : (
          <>
            <div className="tvp-tiles">
              {tiles.map((t, i) => (
                <motion.div key={t.k} className="tvp-tile" {...item(i)}>
                  <span className="tvp-tile-v">{t.v}</span>
                  <span className="tvp-tile-k">{t.k}</span>
                </motion.div>
              ))}
            </div>
            <div className="tvp-player-lists">
              <section>
                <h2 className="tvp-h2">Recent games</h2>
                {d.recent?.length ? (
                  <ul className="tvp-list">
                    {d.recent.slice(0, 4).map((r, i) => (
                      <motion.li key={i} {...item(i + 8)}>
                        <span className="tvp-list-main truncate">
                          {r.won && <Trophy className="tvp-inline-icon text-[var(--b-accent)]" aria-hidden />}
                          {r.title}
                        </span>
                        <span className="tvp-list-sub">
                          {shortDate(r.when)}
                          {r.placement ? ` · ${ordinal(r.placement)} of ${r.of}` : ''}
                        </span>
                        <span className="tvp-list-value">{r.score}</span>
                      </motion.li>
                    ))}
                  </ul>
                ) : (
                  <p className="tvp-muted">No finished games yet.</p>
                )}
              </section>
              <section>
                <h2 className="tvp-h2">Best categories</h2>
                {d.topCategories?.length ? (
                  <ul className="tvp-list">
                    {d.topCategories.map((c, i) => (
                      <motion.li key={c.name} {...item(i + 13)}>
                        <span className="tvp-list-main truncate">{c.name}</span>
                        <span className="tvp-list-value">{c.accuracy}</span>
                      </motion.li>
                    ))}
                  </ul>
                ) : (
                  <p className="tvp-muted">Not enough answers yet.</p>
                )}
              </section>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Players

function PlayersPage({ d }: { d: NonNullable<PresentationState['players']> }) {
  const ctx = useBoard();
  const { ref, box } = useFill();
  const all = d.profiles;
  const cap = 36;
  const shown = all.length > cap ? all.slice(0, cap - 1) : all;
  const more = all.length - shown.length;
  const gap = ctx.vh * 0.014;
  const fit = fitCards(shown.length + (more ? 1 : 0), box, { gap, maxH: ctx.vh * 0.15, minRatio: 2.6, maxCols: 6 });
  const cardH = Math.max(ctx.vh * 0.05, fit.cardH);
  // Few players: cards keep their proportions instead of stretching across the panel.
  const cardW = Math.min(fit.cardW, Math.max(cardH * 3.8, ctx.vh * 0.3));
  return (
    <>
      <Head kicker="Players" title={`${all.length} ${all.length === 1 ? 'player' : 'players'}`} />
      <Panel>
        {all.length === 0 ? (
          <Empty title="No players yet">Scan the code to create a profile.</Empty>
        ) : (
          <div ref={ref} className="tvp-fill">
            {box.w > 0 && (
              <div className="tvp-cards" style={{ gridTemplateColumns: `repeat(${fit.cols}, ${Math.floor(cardW)}px)`, gridAutoRows: `${cardH}px`, gap: `${gap}px`, '--name': `${Math.max(ctx.vh * 0.02, Math.min(cardH * 0.24, cardW * 0.085))}px` } as CSSProperties}>
                {shown.map((p, i) => (
                  <motion.div key={p.id} className="tvp-card tvp-pcard" style={{ '--pc': p.color } as CSSProperties} {...item(i)}>
                    <Avatar profile={p} size={Math.round(cardH * 0.56)} />
                    <span className="tvp-pcard-text">
                      <span className="tvp-pcard-name">{profileName(p)}</span>
                      <span className="tvp-pcard-sub">{p.private ? 'Statistics private' : `${p.games} ${p.games === 1 ? 'game' : 'games'} · ${p.wins} ${p.wins === 1 ? 'win' : 'wins'}`}</span>
                    </span>
                  </motion.div>
                ))}
                {more > 0 && <div className="tvp-card tvp-more">+{more} more</div>}
              </div>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Teams

function TeamsPage({ d }: { d: NonNullable<PresentationState['teams']> }) {
  const ctx = useBoard();
  const fill = useFill();
  const teams = d.teams.slice(0, 12);
  // Columns follow the panel's width (cards need about 38vh), never more than the teams need.
  const want = teams.length <= 4 ? 2 : teams.length <= 6 ? 3 : 4;
  const cols = Math.min(want, colsFor(fill.wVh, 38, 1.4, 4));
  const few = teams.length <= 3;
  return (
    <>
      <Head kicker="Teams" title={`${d.teams.length} ${d.teams.length === 1 ? 'team' : 'teams'}`} />
      <Panel>
        {teams.length === 0 ? (
          <Empty title="No saved teams yet">The host can create teams for team games.</Empty>
        ) : (
          <div ref={fill.ref} className="tvp-fill">
          {fill.box.w > 0 && (
          <div className={cx('tvp-cards tvp-team-cards', few && 'is-few')} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {teams.map((t, i) => (
              <motion.section key={t.id} className="tvp-card tvp-tcard" style={{ '--pc': t.color } as CSSProperties} {...item(i)}>
                <div className="tvp-tcard-head">
                  <span className="tvp-team-emoji" aria-hidden>
                    {avatarEmoji(t.avatar)}
                  </span>
                  <span className="tvp-tcard-name">{t.name}</span>
                </div>
                <div className="tvp-tcard-members">
                  {t.members.length === 0 && <span className="tvp-muted">No members</span>}
                  {t.members.slice(0, 8).map((m) => (
                    <span key={m.id} className="tvp-member-chip">
                      <Avatar profile={m} size={vhPx(ctx, few ? 4 : teams.length > 6 ? 2.4 : 3)} />
                      <span className="truncate">{profileName(m)}</span>
                    </span>
                  ))}
                  {t.members.length > 8 && <span className="tvp-member-chip">+{t.members.length - 8}</span>}
                </div>
                <p className="tvp-tcard-stats">
                  {t.games} {t.games === 1 ? 'game' : 'games'} · {t.wins} {t.wins === 1 ? 'win' : 'wins'}
                </p>
              </motion.section>
            ))}
          </div>
          )}
          </div>
        )}
        {d.teams.length > teams.length && <p className="tvp-foot">+{d.teams.length - teams.length} more teams</p>}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Boards

function BoardsPage({ d }: { d: NonNullable<PresentationState['boards']> }) {
  const fill = useFill();
  // R6-9: about three boards per row where the panel is wide enough (cards need about 34vh), up
  // to four rows; denser rows drop the description and tags rather than overflowing.
  const cols = colsFor(fill.wVh, 34, 1.4, 3);
  const cap = cols * 4;
  let shown = d.boards.slice(0, cap);
  const sel = d.selectedId ? d.boards.find((b) => b.id === d.selectedId) : undefined;
  if (sel && !shown.includes(sel)) shown = [sel, ...shown.slice(0, cap - 1)];
  const rows = Math.max(1, Math.ceil(shown.length / cols));
  const rowVh = Math.min(30, (fill.hVh - (rows - 1) * 1.4) / rows);
  const density = rowVh >= 21 ? 'is-roomy' : rowVh >= 15 ? 'is-mid' : 'is-dense';
  return (
    <>
      <Head kicker="Boards" title={sel ? sel.title : `${d.boards.length} ${d.boards.length === 1 ? 'board' : 'boards'}`} sub={sel ? 'Selected board' : null} />
      <Panel>
        {shown.length === 0 ? (
          <Empty title="No boards yet" />
        ) : (
          <div ref={fill.ref} className="tvp-fill">
          {fill.box.w > 0 && (
          <div className={cx('tvp-cards tvp-board-cards', density)} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: rowVh >= 24 ? 'auto' : `${rowVh}vh` }}>
            {shown.map((b, i) => (
              <motion.article key={b.id} className={cx('tvp-card tvp-bcard', b.id === d.selectedId && 'is-selected')} {...item(i)}>
                <h2 className="tvp-bcard-title">{b.title}</h2>
                {b.description && <p className="tvp-bcard-desc">{b.description}</p>}
                <p className="tvp-bcard-meta">
                  {b.id === d.selectedId && (
                    <span className="tvp-badge">
                      <Sparkles aria-hidden /> Selected
                    </span>
                  )}
                  <span>
                    {b.rounds} {b.rounds === 1 ? 'round' : 'rounds'} · {b.categories} categories · {b.clues} clues
                  </span>
                </p>
                {b.tags.length > 0 && (
                  <p className="tvp-tags">
                    {b.tags.slice(0, 4).map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </p>
                )}
              </motion.article>
            ))}
          </div>
          )}
          </div>
        )}
        {d.boards.length > shown.length && <p className="tvp-foot">+{d.boards.length - shown.length} more boards</p>}
      </Panel>
    </>
  );
}

function BoardDetailPage({ d }: { d: NonNullable<PresentationState['board']> }) {
  const standard = d.rounds.filter((r) => r.kind === 'standard');
  const final = d.rounds.find((r) => r.kind === 'final');
  const most = Math.max(1, ...standard.map((r) => r.categories.length));
  const catVh = Math.max(2, Math.min(3.4, 26 / most));
  return (
    <>
      <Head
        kicker="Board"
        title={d.title}
        sub={
          <>
            {d.clues} clues
            {d.media > 0 ? ` · ${d.media} with pictures or sound` : ''}
            {d.description ? ` — ${d.description}` : ''}
          </>
        }
      />
      <Panel>
        <div className="tvp-rounds" style={{ gridTemplateColumns: `repeat(${Math.max(1, standard.length)}, minmax(0, 1fr))`, '--cat': `${catVh}vh` } as CSSProperties}>
          {standard.map((r, i) => (
            <motion.section key={i} className="tvp-card tvp-round" {...item(i)}>
              <h2 className="tvp-round-name">{r.name}</h2>
              <ul>
                {r.categories.map((c, j) => (
                  <li key={j}>{c}</li>
                ))}
              </ul>
            </motion.section>
          ))}
        </div>
        {final && (
          <motion.div className="tvp-final-note" {...item(standard.length)}>
            <span className="tvp-round-name">{final.name}</span>
            <span>The category stays a surprise until the end of the game.</span>
          </motion.div>
        )}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Head to head

function ComparePage({ d }: { d: NonNullable<PresentationState['compare']> }) {
  const ctx = useBoard();
  if ('unavailable' in d)
    return (
      <>
        <Head kicker="Head to head" title="Not available" />
        <Panel>
          <Empty title={d.unavailable} />
        </Panel>
      </>
    );
  const { a, b, record } = d;
  const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const secs = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`);
  const score = (v: number | null) => (v == null ? '—' : v.toLocaleString());
  const rows: { label: string; a: string; b: string; av: number | null; bv: number | null; lower?: boolean }[] = [
    { label: 'Games', a: String(a.summary.games), b: String(b.summary.games), av: a.summary.games, bv: b.summary.games },
    { label: 'Wins', a: String(a.summary.wins), b: String(b.summary.wins), av: a.summary.wins, bv: b.summary.wins },
    { label: 'Accuracy', a: pct(a.summary.accuracy), b: pct(b.summary.accuracy), av: a.summary.accuracy, bv: b.summary.accuracy },
    { label: 'Best score', a: score(a.summary.bestScore), b: score(b.summary.bestScore), av: a.summary.bestScore, bv: b.summary.bestScore },
    { label: 'Buzz speed', a: secs(a.summary.avgReactionMs), b: secs(b.summary.avgReactionMs), av: a.summary.avgReactionMs, bv: b.summary.avgReactionMs, lower: true },
  ];
  const better = (r: (typeof rows)[number]) => (r.av == null || r.bv == null || r.av === r.bv ? null : (r.lower ? r.av < r.bv : r.av > r.bv) ? 'a' : 'b');
  const av = vhPx(ctx, 11);
  return (
    <div className="tvp-h2h" data-testid="tv-compare">
      <Head kicker="Head to head" title={`${profileName(a.profile)} vs ${profileName(b.profile)}`} />
      <Panel className="tvp-h2h-panel">
        <div className="tvp-h2h-top">
          <motion.div className="tvp-h2h-who" {...item(0)}>
            <Avatar profile={a.profile} size={av} />
            <span className="tvp-h2h-name">{profileName(a.profile)}</span>
          </motion.div>
          <motion.div className="tvp-card tvp-h2h-record" {...item(1)} data-testid="tv-compare-record">
            {record.games ? (
              <>
                <span className="tvp-h2h-label">Against each other · {record.games} {record.games === 1 ? 'game' : 'games'}</span>
                <span className="tvp-h2h-score">
                  {record.aAhead} <span>–</span> {record.bAhead}
                </span>
                <span className="tvp-h2h-label">finished ahead{record.tied ? ` · ${record.tied} tied` : ''}</span>
              </>
            ) : (
              <span className="tvp-h2h-label">No games against each other yet</span>
            )}
            {record.teammateGames > 0 && (
              <span className="tvp-h2h-label">
                Teammates {record.teammateGames}× · won {record.teammateWins}
              </span>
            )}
          </motion.div>
          <motion.div className="tvp-h2h-who" {...item(2)}>
            <Avatar profile={b.profile} size={av} />
            <span className="tvp-h2h-name">{profileName(b.profile)}</span>
          </motion.div>
        </div>
        <div className="tvp-card tvp-h2h-rows">
          {rows.map((r, i) => {
            const w = better(r);
            return (
              <motion.div key={r.label} className="tvp-h2h-row" {...item(3 + i)}>
                <span className={cx('tvp-h2h-val text-right', w === 'a' && 'is-better')}>{r.a}</span>
                <span className="tvp-h2h-stat">{r.label}</span>
                <span className={cx('tvp-h2h-val', w === 'b' && 'is-better')}>{r.b}</span>
              </motion.div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Rules

function RulesPage({ d }: { d: NonNullable<PresentationState['rules']> }) {
  const panel = useFill();
  // Three columns where the panel is wide enough, otherwise two (never three when narrow).
  const cols = panel.wVh >= 100 ? 3 : 2;
  // Balance the cards over the columns (heaviest first into the shortest column), then shrink the
  // type a little if the tallest column would not fit the screen.
  const weight = (sec: SettingsSection) => 1.6 + sec.items.reduce((a, i) => a + 1.55 + (i.hint ? 0.75 * Math.ceil(i.hint.length / 34) : 0), 0);
  const columns: { secs: { sec: SettingsSection; i: number }[]; h: number }[] = Array.from({ length: cols }, () => ({ secs: [], h: 0 }));
  d.sections
    .map((sec, i) => ({ sec, i, w: weight(sec) }))
    .sort((a, b) => b.w - a.w)
    .forEach(({ sec, i, w }) => {
      const c = columns.reduce((m, x) => (x.h < m.h ? x : m), columns[0]);
      c.secs.push({ sec, i });
      c.h += w;
    });
  for (const c of columns) c.secs.sort((a, b) => a.i - b.i);
  // Shrink the type until the tallest column fits (measured, so any screen size works).
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const contentKey = `${JSON.stringify(d.sections)}|${cols}|${panel.box.w}x${panel.box.h}`;
  useLayoutEffect(() => setScale(1), [contentKey]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const need = Math.max(...[...el.children].map((c) => (c as HTMLElement).scrollHeight));
      const have = el.clientHeight;
      if (have > 0 && need > have + 1) setScale((v) => Math.max(0.55, Math.floor(v * (have / need) * 100) / 100));
    };
    fit();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [scale, contentKey]);
  let n = 0;
  return (
    <>
      <Head kicker="Game settings" title={d.title} sub={d.note} />
      <Panel>
        <div ref={panel.ref} className="tvp-fill tvp-settings-fill">
        <div ref={box} className="tvp-settings" style={{ '--s': scale, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } as CSSProperties} data-testid="tv-settings">
          {columns.map((c, ci) => (
            <div key={ci} className="tvp-set-col">
              {c.secs.map(({ sec }) => (
                <motion.section key={sec.title} className="tvp-set-card" {...item(n++)}>
                  <h2 className="tvp-set-title">{sec.title}</h2>
                  <dl>
                    {sec.items.map((l) => (
                      <div key={l.label + l.value} className="tvp-set-row">
                        <dt>{l.label}</dt>
                        <dd>{l.value}</dd>
                        {l.hint && <p className="tvp-set-hint">{l.hint}</p>}
                      </div>
                    ))}
                  </dl>
                </motion.section>
              ))}
            </div>
          ))}
        </div>
        </div>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Team

function TeamPage({ d }: { d: NonNullable<PresentationState['team']> }) {
  const ctx = useBoard();
  const s = d.stats;
  const tiles = [
    { k: 'Games', v: String(s.games) },
    { k: 'Wins', v: String(s.wins) },
    { k: 'Win %', v: s.winRate },
    { k: 'Average score', v: s.averageScore },
    { k: 'Correct answers', v: String(s.correct) },
    { k: 'Incorrect answers', v: String(s.incorrect) },
    { k: 'Accuracy', v: s.accuracy },
    { k: 'Wagers', v: s.wagers },
  ];
  return (
    <div className="tvp-player" style={{ '--pc': d.color } as CSSProperties} data-testid="tv-team-page">
      <header className="tvp-player-top tvp-band">
        <span className="tvp-team-emoji tvp-team-emoji-xl" aria-hidden>
          {avatarEmoji(d.avatar)}
        </span>
        <div className="min-w-0">
          <p className="tvp-kicker">Team</p>
          <h1 className="tvp-title tvp-title-xl truncate">{d.name}</h1>
          <div className="tvp-tcard-members">
            {d.members.slice(0, 8).map((m) => (
              <span key={m.id} className="tvp-member-chip">
                <Avatar profile={m} size={vhPx(ctx, 3.4)} />
                <span className="truncate">{profileName(m)}</span>
              </span>
            ))}
            {d.members.length > 8 && <span className="tvp-member-chip">+{d.members.length - 8}</span>}
          </div>
        </div>
      </header>
      <Panel className="tvp-player-panel">
        <div className="tvp-tiles">
          {tiles.map((t, i) => (
            <motion.div key={t.k} className="tvp-tile" {...item(i)}>
              <span className="tvp-tile-v">{t.v}</span>
              <span className="tvp-tile-k">{t.k}</span>
            </motion.div>
          ))}
        </div>
        <div className="tvp-player-lists">
          <section>
            <h2 className="tvp-h2">Best categories</h2>
            {d.topCategories.length ? (
              <ul className="tvp-list">
                {d.topCategories.map((c, i) => (
                  <motion.li key={c.name} {...item(i + 8)}>
                    <span className="tvp-list-main truncate">{c.name}</span>
                    <span className="tvp-list-value">{c.accuracy}</span>
                  </motion.li>
                ))}
              </ul>
            ) : (
              <p className="tvp-muted">Not enough answers yet.</p>
            )}
          </section>
          <section>
            <h2 className="tvp-h2">Buzzer</h2>
            <p className="tvp-muted">Average buzz speed: {s.buzzSpeed}</p>
          </section>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Buzzers

function DeviceIcon({ device }: { device: string }) {
  const Icon = device === 'Phone' ? Smartphone : device.startsWith('Keyboard') ? Keyboard : device === 'Computer' ? Bot : Gamepad2;
  return <Icon className="tvp-bz-icon" aria-hidden />;
}

function BuzzersPage({ d }: { d: NonNullable<PresentationState['buzzers']> }) {
  const ctx = useBoard();
  const fill = useFill();
  const rows: RosterRow[] = d.rows;
  const ready = rows.filter((r) => r.ready).length;
  // R6-9: compact controller cards in two or three columns (three where the panel is wide enough).
  const cols = rows.length <= 1 ? 1 : Math.min(rows.length <= 4 ? 2 : 3, Math.max(2, colsFor(fill.wVh, 44, 1.2, 3)));
  const perCol = Math.max(1, Math.ceil(rows.length / cols));
  const rowVh = Math.max(4.4, Math.min(9, (fill.hVh - (perCol - 1) * 1) / perCol));
  return (
    <>
      <Head
        kicker="Buzzers"
        title={rows.length ? `${ready} of ${rows.length} ready` : 'Buzzers'}
        aside={
          rows.length > 0 ? (
            <span className={cx('tvp-pill', ready === rows.length && 'is-ok')}>
              <i className={cx('tvp-dot', ready === rows.length && 'is-ready')} aria-hidden />
              {ready === rows.length ? 'Everyone is ready' : 'Waiting for some buzzers'}
            </span>
          ) : null
        }
      />
      <Panel>
        {rows.length === 0 ? (
          <Empty title="No players in the game yet">{d.phonesNote}</Empty>
        ) : (
          <div ref={fill.ref} className="tvp-fill">
          {fill.box.w > 0 && (
          <ul className="tvp-bz" style={{ '--row': `${rowVh}vh`, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${perCol}, var(--row))` } as CSSProperties}>
            {rows.map((r, i) => (
              <motion.li key={i} className={cx('tvp-bz-row', !r.ready && 'is-off')} style={{ '--pc': r.teamColor ?? r.color } as CSSProperties} {...item(i)}>
                <Avatar profile={r} size={vhPx(ctx, rowVh * 0.6)} />
                <span className="tvp-bz-who">
                  <span className="tvp-bz-name">{r.name}</span>
                  <span className="tvp-bz-line">
                    <span className="tvp-bz-dev">
                      <DeviceIcon device={r.device} />
                      {r.device === 'Computer' ? 'Computer player' : r.device}
                    </span>
                    {r.team && !r.name.endsWith('(team)') && <span className="tvp-bz-team">{r.team}</span>}
                  </span>
                </span>
                <span className={cx('tvp-bz-state', r.ready && 'is-ready')}>
                  <i className={cx('tvp-dot', r.ready && 'is-ready')} aria-hidden />
                  {r.ready ? 'Ready' : 'Not ready'}
                </span>
              </motion.li>
            ))}
          </ul>
          )}
          </div>
        )}
        {rows.length > 0 && <p className="tvp-foot">{d.phonesNote}</p>}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Game recap

function GamePage({ g }: { g: NonNullable<PresentationState['game']> }) {
  const fill = useFill();
  const n = Math.min(8, g.standings.length);
  const rowVh = Math.max(4.2, Math.min(8, (fill.hVh - (n - 1) * 1.1) / Math.max(1, n)));
  return (
    <>
      <header className="tvp-band tvp-page-head">
        <RecapHead g={g} />
      </header>
      <Panel>
        <div ref={fill.ref} className="tvp-fill" data-testid="tv-game-recap">
          {fill.box.h > 0 && <RecapStandings g={g} rowVh={rowVh} />}
        </div>
      </Panel>
    </>
  );
}
