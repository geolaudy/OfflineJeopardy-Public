// Game-show swipe between full-screen TV layers (R5-6), the same motion as the category
// introduction: the new screen slides in from the right while the old one leaves to the left.
//
// - One transition per change of `key` (duplicate state / reconnects that keep the key do nothing).
// - The first screen a TV shows never animates (no swipe when a TV loads mid-reveal).
// - Each layer is opaque and stacked by sequence, so quick successive changes look like a clean
//   carousel: the newest screen is always on top and the leaving layers are inert and carry no
//   test ids.
// - Reduced motion: a cross-fade (the new layer fades in over the old one).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent, type Variants } from 'motion/react';
import { useBoard } from './common';
import { EASE_OUT_ARR, T } from './timing';
import type { SwipeKind } from './finalSwipe';

export interface SwipeState {
  key: string;
  kind: SwipeKind;
  /** Number of transitions this screen has shown (0 = the first screen, never animated). */
  seq: number;
}

/**
 * Tracks the transition for the current screen key. `onSwipe` runs exactly once per swipe (after
 * the new screen commits) — e.g. the swipe sound.
 */
export function useSwipe(key: string, kindFor: (prev: string, next: string) => SwipeKind, onSwipe?: () => void): SwipeState {
  const [state, setState] = useState<SwipeState>({ key, kind: 'fade', seq: 0 });
  let current = state;
  if (state.key !== key) {
    current = { key, kind: kindFor(state.key, key), seq: state.seq + 1 };
    setState(current);
  }
  useEffect(() => {
    if (current.seq > 0 && current.kind === 'swipe') onSwipe?.();
    // Once per transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.seq]);
  return current;
}

const VARIANTS: Variants = {
  enter: (k: SwipeKind) => (k === 'swipe' ? { x: '100%', opacity: 1 } : { x: 0, opacity: 0 }),
  center: (k: SwipeKind) => ({ x: 0, opacity: 1, transition: { duration: k === 'swipe' ? T.slide : T.fade, ease: EASE_OUT_ARR } }),
  exit: (k: SwipeKind) =>
    k === 'swipe'
      ? { x: '-100%', opacity: 1, transition: { duration: T.slide, ease: EASE_OUT_ARR } }
      : // Cross-fade: stay put under the new layer while it fades in, then go.
        { opacity: 0, transition: { duration: 0.05, delay: T.fade } },
};

const PresentCtx = createContext(true);
/** False inside a layer that is leaving (render no test ids / live content there). */
export const useSwipePresent = () => useContext(PresentCtx);
/** `data-testid` only on the current layer. */
export function useTestId() {
  const present = useSwipePresent();
  return (id: string) => (present ? id : undefined);
}

export function SwipeStage({ swipe, className, children }: { swipe: SwipeState; className?: string; children: ReactNode }) {
  const { reduced } = useBoard();
  const kind: SwipeKind = reduced ? 'fade' : swipe.kind;
  return (
    <AnimatePresence initial={false} custom={kind}>
      <SwipeLayer key={swipe.key} kind={kind} seq={swipe.seq} className={className}>
        {children}
      </SwipeLayer>
    </AnimatePresence>
  );
}

function SwipeLayer({ kind, seq, className, children }: { kind: SwipeKind; seq: number; className?: string; children: ReactNode }) {
  const present = useIsPresent();
  return (
    <motion.div
      className={className}
      custom={kind}
      variants={VARIANTS}
      initial="enter"
      animate="center"
      exit="exit"
      style={{ zIndex: seq + 1 }}
      aria-hidden={present ? undefined : true}
      inert={!present}
      data-swipe-layer={present ? 'current' : 'leaving'}
    >
      <PresentCtx.Provider value={present}>{children}</PresentCtx.Provider>
    </motion.div>
  );
}
