// Before the host opens the lobby (R4-11): the TV shows what is being set up — the boards to choose
// from (following the board the host is looking at), a preview of its categories and the public
// game settings — so everyone can help decide. No join code yet: joining starts with Open Lobby.
import type { CSSProperties } from 'react';
import { motion } from 'motion/react';
import { Hourglass, Sparkles } from 'lucide-react';
import type { PresentationState } from '../../../shared/presentation';
import { cx } from '../../components/ui';
import { EASE_OUT_ARR, T } from './timing';

const item = (i: number) => ({
  initial: { opacity: 0, y: '1.2vh' },
  animate: { opacity: 1, y: 0, transition: { duration: T.fade, ease: EASE_OUT_ARR, delay: Math.min(i, 10) * 0.04 } },
});

export function PreLobby({ setup, lobbyName }: { setup: NonNullable<PresentationState['setup']>; lobbyName: string }) {
  const { boards, board, rules } = setup;
  const cap = 6;
  let shown = boards.boards.slice(0, cap);
  const sel = boards.selectedId ? boards.boards.find((b) => b.id === boards.selectedId) : undefined;
  if (sel && !shown.includes(sel)) shown = [sel, ...shown.slice(0, cap - 1)];
  const firstRound = board?.rounds.find((r) => r.kind === 'standard');
  // The settings that matter most at a glance (no hints; the full page is under Settings).
  const settings = rules.sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title }))).slice(0, 9);
  return (
    <div className="tvp-pre" data-testid="tv-prelobby">
      <header className="tvp-head">
        <p className="tvp-kicker">Getting ready{lobbyName ? ` · ${lobbyName}` : ''}</p>
        <h1 className="tvp-title" data-testid="tv-prelobby-board">
          {sel ? sel.title : 'Choosing a board…'}
        </h1>
        <p className="tvp-sub tvp-pre-note">
          <Hourglass aria-hidden /> Waiting for the host to open the lobby — then everyone can join.
        </p>
      </header>
      <div className="tvp-pre-grid">
        <section className="tvp-pre-col" aria-label="Boards">
          <h2 className="tvp-pre-h">Boards</h2>
          {shown.length === 0 ? (
            <p className="tvp-pre-empty">No boards yet.</p>
          ) : (
            <div className="tvp-pre-boards">
              {shown.map((b, i) => (
                <motion.article key={b.id} className={cx('tvp-card tvp-bcard', b.id === boards.selectedId && 'is-selected')} {...item(i)} data-testid="tv-prelobby-board-card" data-selected={b.id === boards.selectedId || undefined}>
                  {b.id === boards.selectedId && (
                    <span className="tvp-badge">
                      <Sparkles aria-hidden /> Selected
                    </span>
                  )}
                  <h3 className="tvp-bcard-title">{b.title}</h3>
                  {b.description && <p className="tvp-bcard-desc">{b.description}</p>}
                  <p className="tvp-bcard-meta">
                    {b.rounds} {b.rounds === 1 ? 'round' : 'rounds'} · {b.categories} categories · {b.clues} clues
                  </p>
                </motion.article>
              ))}
            </div>
          )}
          {boards.boards.length > shown.length && <p className="tvp-foot">+{boards.boards.length - shown.length} more boards</p>}
          {firstRound && (
            <div className="tvp-pre-cats" style={{ '--n': Math.max(1, firstRound.categories.length) } as CSSProperties} aria-label={`${firstRound.name} categories`} data-testid="tv-prelobby-categories">
              {firstRound.categories.map((c, i) => (
                <motion.span key={`${c}${i}`} className="tvp-pre-cat" {...item(i)}>
                  {c}
                </motion.span>
              ))}
            </div>
          )}
        </section>
        <section className="tvp-pre-col tvp-card tvp-pre-rules" aria-label="Game settings" data-testid="tv-prelobby-settings">
          <h2 className="tvp-pre-h">Game settings</h2>
          {rules.note && <p className="tvp-pre-small">{rules.note}</p>}
          <dl>
            {settings.map((s) => (
              <div key={s.section + s.label} className="tvp-pre-row">
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
