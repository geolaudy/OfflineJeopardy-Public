// TV presentation effects (R2-22/23/24): board intro, buzzer-unlock indicator and sound cues.
// Stored as one app setting ("tvFx"); public (the TV needs it) and contains no private data.
import { z } from 'zod';

export const SOUND_CUES = ['startup', 'boardIntro', 'categoryIntro', 'clueSelect', 'unlock', 'buzz', 'correct', 'incorrect', 'timeUp', 'dailyWager', 'final', 'finalThink', 'countdown', 'roundEnd', 'winner'] as const;
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
  timeUp: "Time's up",
  dailyWager: 'Daily Double!',
  final: 'Final Jeopardy! category',
  finalThink: 'Final Jeopardy! think music',
  countdown: 'Last seconds',
  roundEnd: 'New round',
  winner: 'Winner',
};

/** Classic / Arcade / Soft are synthesised in the browser (no audio files, nothing copyrighted).
 *  Jeopardy!/Buzzinga plays the owner's own sound files (installed locally, never in public
 *  releases — R4-1); cues without a file fall back to Classic. */
export const SOUND_PACKS = {
  buzzinga: 'Jeopardy!/Buzzinga (Default)',
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
  soundPack: z.enum(['buzzinga', 'classic', 'arcade', 'soft', 'custom', 'off']),
  cues: z.record(z.enum(SOUND_CUES), z.boolean()),
  customSounds: z.partialRecord(z.enum(SOUND_CUES), soundUrl),
  /** Per-sound volume (0–1, relative to the main volume); missing = full. */
  volumes: z.partialRecord(z.enum(SOUND_CUES), z.number().min(0).max(1)).optional(),
  /** Settings version: 2 = saved after the Jeopardy!/Buzzinga pack and the bottom-glow default (R4-1, R4-6). */
  v: z.number().int().optional(),
});
export type TvFx = z.infer<typeof tvFxSchema>;

export const DEFAULT_TV_FX: TvFx = {
  boardIntro: true,
  introSpeed: 'normal',
  // Bottom glow in the theme accent (the mustard yellow of the round titles), slightly thick (R4-6).
  unlock: { style: 'bottom', color: '', intensity: 'medium', durationMs: 1200, persist: true, label: true },
  soundPack: 'buzzinga',
  // Quiet by default for the cues that would fire very often.
  cues: Object.fromEntries(SOUND_CUES.map((c) => [c, !['clueSelect', 'countdown'].includes(c)])) as Record<SoundCue, boolean>,
  customSounds: {},
  volumes: {},
  v: 2,
};

/**
 * Which file in a sound folder belongs to which cue (R4-1), by file name. Names are compared in
 * lower case with punctuation as spaces, e.g. "Final Jeopardy Think.mp3" → "final jeopardy think".
 * Order matters: the first matching cue wins (think music before the Final category sound).
 */
export const PACK_FILE_RULES: { cue: SoundCue; re: RegExp; example: string }[] = [
  { cue: 'finalThink', re: /\bthink\b/, example: 'final_jeopardy_think.mp3' },
  { cue: 'final', re: /\bfinal\b.*\b(category|reveal)\b/, example: 'final_category_reveal.mp3' },
  { cue: 'boardIntro', re: /\bboard ?(fill|intro)\b/, example: 'board_fill.mp3' },
  { cue: 'categoryIntro', re: /\bcat[ae]gory ?(swipe|intro)\b|\bswipe\b/, example: 'category_swipe.mp3' },
  { cue: 'dailyWager', re: /\bdaily ?(double|wager)\b/, example: 'daily_double.mp3' },
  { cue: 'incorrect', re: /\b(wrong|incorrect)\b/, example: 'wrong_answer.mp3' },
  { cue: 'correct', re: /\b(correct|right) ?answer\b|^correct\b/, example: 'correct_answer.mp3' },
  { cue: 'buzz', re: /\bbuzz(ed)? ?in\b/, example: 'buzzed_in.mp3' },
  { cue: 'timeUp', re: /\btimes? ?s? ?up\b|\btime ?out\b/, example: 'times_up.mp3' },
  { cue: 'unlock', re: /\bunlock|\bbuzzers? ?open\b/, example: 'buzzers_open.mp3' },
  { cue: 'startup', re: /\b(lobby|startup|opening|theme)\b/, example: 'lobby_theme.mp3' },
  { cue: 'clueSelect', re: /\bclue ?(select|open)\b/, example: 'clue_select.mp3' },
  { cue: 'countdown', re: /\b(countdown|tick)\b/, example: 'countdown.mp3' },
  { cue: 'roundEnd', re: /\b(round ?(end|change)|new ?round)\b/, example: 'round_end.mp3' },
  { cue: 'winner', re: /\b(winner|applause|game ?over)\b/, example: 'winner.mp3' },
];

/** The cue a sound file is for, from its name (null = not part of the pack). */
export function cueForFileName(fileName: string): SoundCue | null {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return PACK_FILE_RULES.find((r) => r.re.test(base))?.cue ?? null;
}

/** Sound packs made of files (Jeopardy!/Buzzinga): cue → URL of the file the TV plays. */
export type PackFiles = Partial<Record<SoundCue, string>>;

/** Fills in anything missing from older or partial saved settings. */
export function normalizeTvFx(v: unknown): TvFx {
  const o = { ...((v && typeof v === 'object' ? v : {}) as Partial<TvFx>) };
  if (v && typeof v === 'object' && !o.v) {
    // Saved before v2 (R4-1, R4-6). Classic and the side-edge indicator were the defaults and were
    // saved along with any other change, so they cannot be told apart from an explicit choice; they
    // move to the new defaults. Arcade, Soft, Custom, Muted and every other style are kept.
    if (!o.soundPack || o.soundPack === 'classic') {
      o.soundPack = 'buzzinga';
      o.cues = { ...(o.cues ?? {}), categoryIntro: true } as TvFx['cues'];
    }
    if (o.unlock && (!o.unlock.style || o.unlock.style === 'edges')) o.unlock = { ...o.unlock, style: 'bottom' };
  }
  const merged = {
    ...DEFAULT_TV_FX,
    ...o,
    unlock: { ...DEFAULT_TV_FX.unlock, ...(o.unlock ?? {}) },
    cues: { ...DEFAULT_TV_FX.cues, ...(o.cues ?? {}) },
    customSounds: { ...(o.customSounds ?? {}) },
    volumes: { ...(o.volumes ?? {}) },
    v: 2,
  };
  const r = tvFxSchema.safeParse(merged);
  return r.success ? r.data : DEFAULT_TV_FX;
}
