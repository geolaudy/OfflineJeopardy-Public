// TV presentation effects (R2-22/23/24): board intro, buzzer-unlock indicator and sound cues.
// Stored as one app setting ("tvFx"); public (the TV needs it) and contains no private data.
import { z } from 'zod';

export const SOUND_CUES = ['startup', 'boardIntro', 'categoryIntro', 'clueSelect', 'unlock', 'buzz', 'correct', 'incorrect', 'dailyWager', 'final', 'countdown', 'roundEnd', 'winner'] as const;
export type SoundCue = (typeof SOUND_CUES)[number];

export const CUE_LABELS: Record<SoundCue, string> = {
  startup: 'Lobby opens',
  boardIntro: 'Board intro',
  categoryIntro: 'Each category',
  clueSelect: 'Clue opens',
  unlock: 'Buzzers open',
  buzz: 'Someone buzzes',
  correct: 'Correct',
  incorrect: 'Incorrect',
  dailyWager: 'Daily Wager',
  final: 'Final Wager',
  countdown: 'Last seconds',
  roundEnd: 'New round',
  winner: 'Winner',
};

/** Built-in packs are synthesised in the browser (no audio files, nothing copyrighted). */
export const SOUND_PACKS = {
  classic: 'Classic (bright tones)',
  arcade: 'Arcade (retro beeps)',
  soft: 'Soft (gentle chimes)',
  custom: 'Custom (my own sound files)',
  off: 'Muted',
} as const;
export type SoundPack = keyof typeof SOUND_PACKS;

export const UNLOCK_STYLES = {
  edges: 'Side edges',
  top: 'Top glow',
  bottom: 'Bottom glow',
  dot: 'Status dot',
  pulse: 'Brief pulse',
  none: 'None',
} as const;
export type UnlockStyle = keyof typeof UNLOCK_STYLES;

export const INTRO_SPEEDS = { slow: 'Slow', normal: 'Normal', fast: 'Fast' } as const;
export type IntroSpeed = keyof typeof INTRO_SPEEDS;
/** Multiplier for board-intro timings and the automatic category-introduction pace. */
export const SPEED_FACTOR: Record<IntroSpeed, number> = { slow: 1.5, normal: 1, fast: 0.6 };
export const INTRO_STEP_MS = (s: IntroSpeed) => Math.round(3500 * SPEED_FACTOR[s]);

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const soundUrl = z.string().regex(/^\/media\/sounds\/[A-Za-z0-9._-]{1,120}$/);

export const tvFxSchema = z.object({
  boardIntro: z.boolean(),
  introSpeed: z.enum(['slow', 'normal', 'fast']),
  unlock: z.object({
    style: z.enum(['edges', 'top', 'bottom', 'dot', 'pulse', 'none']),
    /** '' = the theme's own accent colour. */
    color: z.union([hex, z.literal('')]),
    intensity: z.enum(['subtle', 'medium', 'strong']),
    /** How long the indicator stays fully visible when it does not persist (ms). */
    durationMs: z.number().int().min(300).max(5000),
    /** Keep a (dimmer) indicator for as long as the buzzers are open. */
    persist: z.boolean(),
    label: z.boolean(),
  }),
  soundPack: z.enum(['classic', 'arcade', 'soft', 'custom', 'off']),
  cues: z.record(z.enum(SOUND_CUES), z.boolean()),
  customSounds: z.partialRecord(z.enum(SOUND_CUES), soundUrl),
});
export type TvFx = z.infer<typeof tvFxSchema>;

export const DEFAULT_TV_FX: TvFx = {
  boardIntro: true,
  introSpeed: 'normal',
  unlock: { style: 'edges', color: '', intensity: 'medium', durationMs: 1200, persist: true, label: true },
  soundPack: 'classic',
  // Quiet by default for the cues that would fire very often.
  cues: Object.fromEntries(SOUND_CUES.map((c) => [c, !['categoryIntro', 'clueSelect', 'countdown'].includes(c)])) as Record<SoundCue, boolean>,
  customSounds: {},
};

/** Fills in anything missing from older or partial saved settings. */
export function normalizeTvFx(v: unknown): TvFx {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<TvFx>;
  const merged = {
    ...DEFAULT_TV_FX,
    ...o,
    unlock: { ...DEFAULT_TV_FX.unlock, ...(o.unlock ?? {}) },
    cues: { ...DEFAULT_TV_FX.cues, ...(o.cues ?? {}) },
    customSounds: { ...(o.customSounds ?? {}) },
  };
  const r = tvFxSchema.safeParse(merged);
  return r.success ? r.data : DEFAULT_TV_FX;
}
