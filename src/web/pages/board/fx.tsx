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
export function BoardReveal({ g }: { g: GameView }) {
  const fx = useFx();
  const round = g.rounds[g.intro?.roundIndex ?? g.roundIndex];
  const cols = round?.categories.length ?? 0;
  const rows = round ? Math.max(0, ...round.categories.map((c) => c.clues.length)) : 0;
  const total = revealSeconds(fx);
  const delays = useMemo(() => checkerDelays(cols, rows, total * 0.75), [cols, rows, total]);
  if (!round) return null;
  const cell = (delay: number): CSSProperties => ({ animationDelay: `${delay.toFixed(3)}s`, '--bt-reveal-dur': `${(T.fillTile * 1.4 * SPEED_FACTOR[fx.introSpeed]).toFixed(3)}s` }) as CSSProperties;
  return (
    <div className="bt-grid bt-reveal-grid" data-testid="tv-board-reveal" aria-hidden style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `1.3fr repeat(${rows}, minmax(0, 1fr))` }}>
      {round.categories.map((c, ci) => (
        <div key={c.id} className="bt-cell bt-cat bt-reveal" style={cell(total * 0.8 + ci * 0.04)} />
      ))}
      {Array.from({ length: rows }).map((_, r) => round.categories.map((c, ci) => <div key={`${c.id}-${r}`} className="bt-cell bt-tile bt-reveal" style={cell(delays[r * cols + ci])} />))}
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
  const color = unlock.color || 'var(--bt-strip-c)';
  const glow = unlock.color ? `${unlock.color}73` : 'var(--bt-strip-glow)';
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
