// TV presentation effects (R2-23 board intro, R2-24 unlock indicator). Purely presentational:
// they follow the authoritative state and never delay or gate it.
import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { GameView } from '../../../shared/views';
import { DEFAULT_TV_FX, SPEED_FACTOR, type TvFx } from '../../../shared/tvFx';
import { T } from './timing';

export const FxCtx = createContext<TvFx>(DEFAULT_TV_FX);
export const useFx = () => useContext(FxCtx);

/** Total length of the board reveal (seconds) at the chosen speed. */
export const revealSeconds = (fx: TvFx) => 1.7 * SPEED_FACTOR[fx.introSpeed];

/**
 * One timeline for the board fill and its sound (R4-19): when the pack has a board-fill file, the
 * reveal is stretched to the sound — tiles light up across it, the last ones land just before it
 * ends and the round title follows as it finishes. Without a file the speed setting decides.
 */
export function revealTimeline(fx: TvFx, audioSec: number | null) {
  return audioSec && audioSec > 0.8 ? Math.min(6, audioSec * 0.92) : revealSeconds(fx);
}

/**
 * R8-4: when each part of the board reveal happens, so it flows without dead time: the value tiles
 * light up across most of the timeline, the category row lights as the last tiles finish, and the
 * board dims under the round title as the category row finishes. `d` is one tile's fade.
 * (Before, the tiles were done at about half the timeline, the categories waited until 80 % and the
 * title until 90 %: a second or more with nothing moving.)
 */
export interface RevealPlan {
  /** One tile's fade (s). */
  d: number;
  /** Start delay of every value tile (row-major). */
  delays: number[];
  catStart: number;
  title: number;
}
export function revealPlan(fx: TvFx, total: number, cols: number, rows: number): RevealPlan {
  const d = T.fillTile * 1.4 * SPEED_FACTOR[fx.introSpeed];
  // checkerDelays() starts every tile within 0.72 × its spread: aim the last ones at 80 % of the
  // timeline, then key the category row off the tile that actually starts last (the order is
  // random), half a fade before it finishes.
  const delays = checkerDelays(cols, rows, Math.max(0.1, (total * 0.8 - d) / 0.72));
  const catStart = Math.max(...delays, 0) + d * 0.5;
  const catEnd = catStart + 0.04 * Math.max(0, cols - 1) + d;
  return { d, delays, catStart, title: Math.max(0, catEnd - d * 0.5) };
}

/**
 * Checker-pattern reveal order: the "even" squares light up first, then the "odd" ones, each wave
 * with a little jitter so it feels alive but never flashes. Returns a delay (s) per cell.
 */
export function checkerDelays(cols: number, rows: number, total: number): number[] {
  const wave = total * 0.42;
  const jitter = total * 0.3;
  const d: number[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const odd = (r + c) % 2 === 1;
      d[r * cols + c] = (odd ? wave : 0) + Math.random() * jitter;
    }
  return d;
}

/** The classic board intro: blank screens light up in a checker pattern (shown before the round title). */
export function BoardReveal({ g, total: totalSec, plan: given }: { g: GameView; total?: number; plan?: RevealPlan }) {
  const fx = useFx();
  const round = g.rounds[g.intro?.roundIndex ?? g.roundIndex];
  const cols = round?.categories.length ?? 0;
  const rows = round ? Math.max(0, ...round.categories.map((c) => c.clues.length)) : 0;
  const total = totalSec ?? revealSeconds(fx);
  const own = useMemo(() => revealPlan(fx, total, cols, rows), [fx, total, cols, rows]);
  const plan = given ?? own;
  if (!round) return null;
  const cell = (delay: number): CSSProperties => ({ animationDelay: `${delay.toFixed(3)}s`, '--bt-reveal-dur': `${plan.d.toFixed(3)}s` }) as CSSProperties;
  return (
    <div className="bt-grid bt-reveal-grid" data-testid="tv-board-reveal" aria-hidden style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `1.3fr repeat(${rows}, minmax(0, 1fr))` }}>
      {round.categories.map((c, ci) => (
        <div key={c.id} className="bt-cell bt-cat bt-reveal" style={cell(plan.catStart + ci * 0.04)} />
      ))}
      {Array.from({ length: rows }).map((_, r) => round.categories.map((c, ci) => <div key={`${c.id}-${r}`} className="bt-cell bt-tile bt-reveal" style={cell(plan.delays[r * cols + ci] ?? 0)} />))}
    </div>
  );
}

const INTENSITY = { subtle: 0.45, medium: 0.75, strong: 1 } as const;

/** "Buzzers are open" cue in the chosen style. Never covers the clue: edges, glows and a corner dot only. */
export function UnlockIndicator({ open }: { open: boolean }) {
  const { unlock } = useFx();
  // Full strength first, then (if it persists) a calmer level for as long as the buzzers stay open.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    if (!open) return;
    const t = setTimeout(() => setSettled(true), unlock.durationMs);
    return () => clearTimeout(t);
  }, [open, unlock.durationMs]);
  const peak = INTENSITY[unlock.intensity];
  const opacity = !settled ? peak : unlock.persist ? peak * 0.6 : 0;
  // Default: the theme accent — the mustard yellow of the round titles on the classic board (R4-6).
  const color = unlock.color || 'var(--b-accent)';
  const glow = unlock.color ? `${unlock.color}73` : 'color-mix(in srgb, var(--b-accent) 45%, transparent)';
  const vars = { '--bt-ind-c': color, '--bt-ind-glow': glow } as CSSProperties;
  const style = unlock.style;
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="buzz-open" className="pointer-events-none absolute inset-0" style={vars} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: T.fade }} data-testid="tv-unlock-indicator" data-style={style}>
          <motion.div className="absolute inset-0" animate={{ opacity }} transition={{ duration: settled ? 0.6 : T.fade }}>
            {style === 'edges' && (
              <>
                <span className="bt-strip bt-ind-strip left-0" aria-hidden />
                <span className="bt-strip bt-ind-strip right-0" aria-hidden />
              </>
            )}
            {style === 'top' && <span className="bt-ind-glow bt-ind-top" aria-hidden />}
            {style === 'bottom' && <span className="bt-ind-glow bt-ind-bottom" aria-hidden />}
            {style === 'pulse' && <span className="bt-ind-pulse" aria-hidden />}
            {style === 'dot' && <span className="bt-ind-dot" aria-hidden />}
          </motion.div>
          {/* Screen readers (and the optional label) always know the state, even with style "none". */}
          <div className={unlock.label && style !== 'none' ? 'bt-buzz-label' : 'sr-only'} role="status">
            <span className="bt-buzz-dot" aria-hidden />
            Buzzers open
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
