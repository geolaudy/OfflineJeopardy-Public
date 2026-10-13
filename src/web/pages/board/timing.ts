// One place for every TV-board animation timing (seconds), so the presentation feels cohesive.
// Animations are purely presentational: they never delay or gate authoritative game state.
export const T = {
  /** Tile → full-screen clue expansion. */
  zoom: 0.62,
  /** Full-screen clue → tile shrink on return to the board. */
  unzoom: 0.5,
  /** Generic fades (question text after the zoom, indicators, reduced-motion cross-fades). */
  fade: 0.35,
  /** Content fade-out before the clue shrinks back. */
  fadeOut: 0.16,
  /** Answer reveal fade-up. */
  reveal: 0.5,
  /** Category-introduction horizontal slide. */
  slide: 0.7,
  /** Board fill-in after the introduction: per-tile fade and the total stagger window. */
  fillTile: 0.28,
  fillSpread: 0.85,
  /** Score change highlight. */
  scoreFlash: 0.9,
} as const;

/** Decelerating curve for things arriving; symmetric curve for things leaving. */
export const EASE_OUT = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
export const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
export const EASE_OUT_ARR = [0.22, 0.61, 0.36, 1] as const;
