// Public pages the host can present on the TV (R2-7). Rendered ONLY from the server's explicit
// presentation payload (public profiles/stats, category names without clues, rules summary,
// controller readiness without device ids).
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Bot, Crown, Gamepad2, Keyboard, Lock, Smartphone, Sparkles, Trophy } from 'lucide-react';
import type { PresentationState, PresentPage, RosterRow } from '../../../shared/presentation';
import { Avatar, cx } from '../../components/ui';
import { avatarEmoji } from '../../lib/avatars';
import { profileName } from '../../lib/view';
import { useBoard, vhPx } from './common';
import { fitCards, useBoxSize, useNarrow } from './presentKit';
import { EASE_OUT_ARR, T } from './timing';

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
    case 'boards':
      return p.boards ? <BoardsPage d={p.boards} /> : <Missing page={p.page} />;
    case 'board':
      return p.board ? <BoardDetailPage d={p.board} /> : <Missing page={p.page} />;
    case 'rules':
      return p.rules ? <RulesPage d={p.rules} /> : <Missing page={p.page} />;
    case 'buzzers':
      return p.buzzers ? <BuzzersPage d={p.buzzers} /> : <Missing page={p.page} />;
    default:
      return null;
  }
}

function Head({ kicker, title, sub, aside }: { kicker: string; title: string; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="tvp-head tvp-page-head">
      <div className="min-w-0 flex-1">
        <p className="tvp-kicker">{kicker}</p>
        <h1 className="tvp-title">{title}</h1>
        {sub ? <p className="tvp-sub">{sub}</p> : null}
      </div>
      {aside}
    </header>
  );
}

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
      <Empty title="This page is not available right now." />
    </>
  );
}

/** Staggered entrance for list items (transform/opacity only). */
const item = (i: number) => ({
  initial: { opacity: 0, y: '1.5vh' },
  animate: { opacity: 1, y: 0, transition: { duration: T.fade, ease: EASE_OUT_ARR, delay: T.page * 0.4 + Math.min(i, 12) * 0.04 } },
});

// ---------------------------------------------------------------- Leaderboard

function LeaderboardPage({ d }: { d: NonNullable<PresentationState['leaderboard']> }) {
  const ctx = useBoard();
  const n = d.rows.length;
  // Up to 7 rows in one column; more go into two columns (ranks run down the first column)
  // unless the screen is narrow (names need the width there).
  const narrow = useNarrow();
  const two = n > 7 && !narrow;
  const perCol = two ? Math.ceil(n / 2) : Math.max(1, n);
  const rowVh = Math.min(9, (66 - (perCol - 1) * 0.9) / perCol);
  return (
    <>
      <Head kicker={`Leaderboard · ${d.viewLabel}`} title={d.metricLabel} sub={d.minNote} />
      {n === 0 ? (
        <Empty title="No ranked players yet">Play a few games to appear on the leaderboard.</Empty>
      ) : (
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
      {d.unranked > 0 && (
        <p className="tvp-foot">
          {d.unranked} more {d.unranked === 1 ? 'player is' : 'players are'} not ranked yet.
        </p>
      )}
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
      <header className="tvp-player-top">
        <Avatar profile={d.profile} size={vhPx(ctx, 15)} />
        <div className="min-w-0">
          <p className="tvp-kicker">Player</p>
          <h1 className="tvp-title tvp-title-xl truncate">{name}</h1>
          {realName && <p className="tvp-sub">{realName}</p>}
        </div>
      </header>
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
    </div>
  );
}

// ---------------------------------------------------------------- Players

function PlayersPage({ d }: { d: NonNullable<PresentationState['players']> }) {
  const ctx = useBoard();
  const ref = useRef<HTMLDivElement>(null);
  const box = useBoxSize(ref);
  const all = d.profiles;
  const cap = 36;
  const shown = all.length > cap ? all.slice(0, cap - 1) : all;
  const more = all.length - shown.length;
  const gap = ctx.vh * 0.014;
  const fit = fitCards(shown.length + (more ? 1 : 0), box, { gap, maxH: ctx.vh * 0.17, minRatio: 2.4, maxCols: 6 });
  const cardH = Math.max(ctx.vh * 0.05, fit.cardH);
  return (
    <>
      <Head kicker="Players" title={`${all.length} ${all.length === 1 ? 'player' : 'players'}`} />
      {all.length === 0 ? (
        <Empty title="No players yet">Scan the code to create a profile.</Empty>
      ) : (
        <div ref={ref} className="tvp-fill">
          {box.w > 0 && (
            <div className="tvp-cards" style={{ gridTemplateColumns: `repeat(${fit.cols}, minmax(0, 1fr))`, gridAutoRows: `${cardH}px`, '--name': `${Math.min(cardH * 0.24, fit.cardW * 0.08)}px` } as CSSProperties}>
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
    </>
  );
}

// ---------------------------------------------------------------- Teams

function TeamsPage({ d }: { d: NonNullable<PresentationState['teams']> }) {
  const ctx = useBoard();
  const teams = d.teams.slice(0, 12);
  const narrow = useNarrow();
  const cols = teams.length <= 2 || (narrow && teams.length <= 4) ? 2 : teams.length <= 6 ? 3 : narrow ? 3 : 4;
  const few = teams.length <= 3;
  return (
    <>
      <Head kicker="Teams" title={`${d.teams.length} ${d.teams.length === 1 ? 'team' : 'teams'}`} />
      {teams.length === 0 ? (
        <Empty title="No saved teams yet">The host can create teams for team games.</Empty>
      ) : (
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
                    <Avatar profile={m} size={vhPx(ctx, few ? 4.4 : teams.length > 6 ? 2.4 : 3)} />
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
      {d.teams.length > teams.length && <p className="tvp-foot">+{d.teams.length - teams.length} more teams</p>}
    </>
  );
}

// ---------------------------------------------------------------- Boards

function BoardsPage({ d }: { d: NonNullable<PresentationState['boards']> }) {
  const cap = 12;
  let shown = d.boards.slice(0, cap);
  const sel = d.selectedId ? d.boards.find((b) => b.id === d.selectedId) : undefined;
  if (sel && !shown.includes(sel)) shown = [sel, ...shown.slice(0, cap - 1)];
  const cols = shown.length <= 4 ? 2 : shown.length <= 9 ? 3 : 4;
  return (
    <>
      <Head kicker="Boards" title={sel ? sel.title : `${d.boards.length} ${d.boards.length === 1 ? 'board' : 'boards'}`} sub={sel ? 'Selected board' : null} />
      {shown.length === 0 ? (
        <Empty title="No boards yet" />
      ) : (
        <div className="tvp-cards tvp-board-cards" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {shown.map((b, i) => (
            <motion.article key={b.id} className={cx('tvp-card tvp-bcard', b.id === d.selectedId && 'is-selected')} {...item(i)}>
              {b.id === d.selectedId && (
                <span className="tvp-badge">
                  <Sparkles aria-hidden /> Selected
                </span>
              )}
              <h2 className="tvp-bcard-title">{b.title}</h2>
              {b.description && <p className="tvp-bcard-desc">{b.description}</p>}
              <p className="tvp-bcard-meta">
                {b.rounds} {b.rounds === 1 ? 'round' : 'rounds'} · {b.categories} categories · {b.clues} clues
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
      {d.boards.length > shown.length && <p className="tvp-foot">+{d.boards.length - shown.length} more boards</p>}
    </>
  );
}

function BoardDetailPage({ d }: { d: NonNullable<PresentationState['board']> }) {
  const standard = d.rounds.filter((r) => r.kind === 'standard');
  const final = d.rounds.find((r) => r.kind === 'final');
  const most = Math.max(1, ...standard.map((r) => r.categories.length));
  const catVh = Math.max(2.2, Math.min(3.6, 40 / most));
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
    </>
  );
}

// ---------------------------------------------------------------- Rules

function RulesPage({ d }: { d: NonNullable<PresentationState['rules']> }) {
  const twoCols = d.lines.length > 6;
  return (
    <>
      <Head kicker="Rules" title={d.title} />
      <dl className={cx('tvp-rules', twoCols && 'is-two')}>
        {d.lines.map((l, i) => (
          <motion.div key={l.label} className="tvp-rule" {...item(i)}>
            <dt>{l.label}</dt>
            <dd>{l.value}</dd>
          </motion.div>
        ))}
      </dl>
    </>
  );
}

// ---------------------------------------------------------------- Buzzers

function DeviceIcon({ device }: { device: string }) {
  const Icon = device === 'Phone' ? Smartphone : device.startsWith('Keyboard') ? Keyboard : device === 'Computer' ? Bot : Gamepad2;
  return <Icon className="tvp-bz-icon" aria-hidden />;
}

function BuzzersPage({ d }: { d: NonNullable<PresentationState['buzzers']> }) {
  const ctx = useBoard();
  const rows: RosterRow[] = d.rows;
  const ready = rows.filter((r) => r.ready).length;
  const twoCols = rows.length > 8;
  const perCol = twoCols ? Math.ceil(rows.length / 2) : rows.length;
  const rowVh = Math.min(8, (64 - (perCol - 1) * 1) / Math.max(1, perCol));
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
      {rows.length === 0 ? (
        <Empty title="No players in the game yet">{d.phonesNote}</Empty>
      ) : (
        <ul className={cx('tvp-bz', twoCols && 'is-two')} style={{ '--row': `${rowVh}vh` } as CSSProperties}>
          {rows.map((r, i) => (
            <motion.li key={i} className={cx('tvp-bz-row', !r.ready && 'is-off')} style={{ '--pc': r.teamColor ?? r.color } as CSSProperties} {...item(i)}>
              <Avatar profile={r} size={vhPx(ctx, rowVh * 0.62)} />
              <span className="tvp-bz-who">
                <span className="tvp-bz-name">{r.name}</span>
                {r.team && !r.name.endsWith('(team)') && <span className="tvp-bz-team">{r.team}</span>}
              </span>
              <span className="tvp-bz-dev">
                <DeviceIcon device={r.device} />
                {r.device === 'Computer' ? 'Computer player' : r.device}
              </span>
              <span className={cx('tvp-bz-state', r.ready && 'is-ready')}>
                <i className={cx('tvp-dot', r.ready && 'is-ready')} aria-hidden />
                {r.ready ? 'Ready' : 'Not ready'}
              </span>
            </motion.li>
          ))}
        </ul>
      )}
      {rows.length > 0 && <p className="tvp-foot">{d.phonesNote}</p>}
    </>
  );
}
