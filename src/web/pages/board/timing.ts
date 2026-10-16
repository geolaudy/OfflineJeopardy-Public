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
  /** Score change pop: slight scale-up + gain/loss colour, smooth return (R5-7). */
  scoreFlash: 0.5,
  /** "+$400" / "−$400" next to a changed score: fade in, hold, fade away (R5-7). */
  scoreDelta: 1.6,
  /** Results podium (R5-10): each step rising, the gap between steps (3rd → 2nd → 1st), then
   *  names / scores fading in. */
  podiumRise: 0.6,
  podiumStagger: 0.32,
  podiumReveal: 0.45,
  /** Lobby: full screen ↔ compact side panel (shared QR card and avatars). */
  morph: 0.7,
  /** Lobby text/details fading in after (or out before) the morph. */
  morphFadeIn: 0.4,
  morphFadeOut: 0.2,
  /** Presented pages (leaderboard, players, …): cross-fade with a short slide. */
  page: 0.45,
  /** Nav rail highlight moving to the current page. */
  rail: 0.45,
} as const;

/** Decelerating curve for things arriving; symmetric curve for things leaving. */
export const EASE_OUT = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
export const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
export const EASE_OUT_ARR = [0.22, 0.61, 0.36, 1] as const;
/** Shared-element morphs (both ends are on screen, so a gentle symmetric curve). */
export const EASE_MORPH_ARR = [0.45, 0, 0.15, 1] as const;
