// TV board themes: built-in presets plus custom themes. A custom theme starts from a preset
// ("base") and overrides some of its CSS variables; anything left empty keeps the preset look.
// Only offline system fonts are offered (no web fonts).
import { z } from 'zod';

export const THEME_PRESETS = [
  { id: 'classic', label: 'Classic Game Show' },
  { id: 'modern', label: 'Modern Minimal' },
  { id: 'dark', label: 'Dark Mode' },
  { id: 'neon', label: 'Neon Arcade' },
  { id: 'retro', label: 'Retro Television' },
  { id: 'classroom', label: 'Classroom' },
  { id: 'corporate', label: 'Corporate' },
  { id: 'contrast', label: 'High Contrast' },
] as const;
export type PresetId = (typeof THEME_PRESETS)[number]['id'];
const PRESET_IDS = THEME_PRESETS.map((p) => p.id) as [PresetId, ...PresetId[]];

export const FONT_STACKS = {
  preset: { label: 'Theme default', stack: '' },
  showcase: { label: 'Showcase (Impact)', stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", "Franklin Gothic Heavy", "Arial Black", sans-serif' },
  heavy: { label: 'Heavy sans (Arial Black)', stack: '"Arial Black", "Segoe UI Black", "Helvetica Neue", Arial, sans-serif' },
  sans: { label: 'Clean sans (Segoe UI)', stack: '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif' },
  rounded: { label: 'Friendly (Trebuchet)', stack: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif' },
  serif: { label: 'Serif (Georgia)', stack: 'Georgia, "Times New Roman", Times, serif' },
  typewriter: { label: 'Typewriter (Courier)', stack: '"Courier New", Courier, monospace' },
} as const;
export type FontKey = keyof typeof FONT_STACKS;
const FONT_KEYS = Object.keys(FONT_STACKS) as [FontKey, ...FontKey[]];

const color = z.union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/)]);
// Only images stored by this game server may be referenced (no external URLs — offline + privacy).
const localImage = z.string().regex(/^\/media\/clues\/[A-Za-z0-9._-]{1,120}$/).nullable();

export const themeColorsSchema = z.object({
  background: color,
  background2: color,
  category: color,
  categoryText: color,
  tile: color,
  value: color,
  used: color,
  grid: color,
  text: color,
  accent: color,
  buzzer: color,
});
export type ThemeColors = z.infer<typeof themeColorsSchema>;

export const customThemeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  base: z.enum(PRESET_IDS),
  colors: themeColorsSchema,
  displayFont: z.enum(FONT_KEYS),
  clueFont: z.enum(FONT_KEYS),
  /** Text size multipliers (1 = theme default). */
  categoryScale: z.number().min(0.6).max(1.5),
  valueScale: z.number().min(0.6).max(1.5),
  clueScale: z.number().min(0.6).max(1.5),
  /** Corner radius of tiles in % of screen height (null = theme default). */
  radius: z.number().min(0).max(4).nullable(),
  shadows: z.enum(['preset', 'on', 'off']),
  /** Shown before clue values, e.g. "$" ('' = none, null = theme default). */
  valuePrefix: z.string().max(3).nullable(),
  backgroundImage: localImage,
  backgroundDim: z.number().min(0).max(0.9),
  logo: localImage,
});
export type CustomThemeData = z.infer<typeof customThemeSchema>;
export interface CustomTheme extends CustomThemeData {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export const EMPTY_COLORS: ThemeColors = { background: '', background2: '', category: '', categoryText: '', tile: '', value: '', used: '', grid: '', text: '', accent: '', buzzer: '' };

export function newThemeData(base: PresetId = 'classic', name = 'My theme'): CustomThemeData {
  return {
    name,
    base,
    colors: { ...EMPTY_COLORS },
    displayFont: 'preset',
    clueFont: 'preset',
    categoryScale: 1,
    valueScale: 1,
    clueScale: 1,
    radius: null,
    shadows: 'preset',
    valuePrefix: null,
    backgroundImage: null,
    backgroundDim: 0.35,
    logo: null,
  };
}

export const isPreset = (id: string): id is PresetId => (PRESET_IDS as string[]).includes(id);

/** Value prefix for clue tiles: the classic preset shows "$" unless a custom theme says otherwise. */
export function valuePrefixFor(base: string, custom?: Pick<CustomThemeData, 'valuePrefix'> | null) {
  if (custom && custom.valuePrefix != null) return custom.valuePrefix;
  return base === 'classic' ? '$' : '';
}

/** CSS custom properties for a custom theme, applied inline on the board root (overrides the preset). */
export function themeCssVars(t: CustomThemeData): Record<string, string> {
  const v: Record<string, string> = {};
  const c = t.colors;
  const set = (k: string, val: string | undefined | null) => {
    if (val) v[k] = val;
  };
  set('--b-bg', c.background);
  set('--b-bg2', c.background2 || c.background);
  if (c.tile) {
    v['--b-tile'] = c.tile;
    v['--bt-tile-bg'] = c.tile;
    v['--bt-panel'] = c.tile;
  }
  set('--b-cat', c.category);
  set('--b-cat-fg', c.categoryText);
  set('--b-tile-fg', c.value);
  set('--b-used', c.used);
  if (c.grid) {
    v['--b-line'] = c.grid;
    v['--bt-grid-bg'] = c.grid;
  }
  set('--b-fg', c.text);
  set('--b-accent', c.accent);
  if (c.buzzer) {
    v['--bt-strip-c'] = c.buzzer;
    v['--bt-strip-glow'] = `${c.buzzer}73`;
  }
  if (t.displayFont !== 'preset') {
    v['--b-font'] = FONT_STACKS[t.displayFont].stack;
    v['--bt-heavy'] = t.displayFont === 'showcase' ? '400' : '900';
  }
  if (t.clueFont !== 'preset') v['--b-clue-font'] = FONT_STACKS[t.clueFont].stack;
  if (t.radius != null) v['--b-radius'] = `${t.radius}vh`;
  if (t.shadows === 'off') {
    v['--b-shadow'] = 'none';
    v['--bt-text-shadow'] = 'none';
    v['--bt-value-shadow'] = 'none';
    v['--bt-clue-shadow'] = 'none';
  } else if (t.shadows === 'on') {
    v['--b-shadow'] = '0 0.4vh 0.8vh rgba(0,0,0,0.45)';
    v['--bt-text-shadow'] = '0 0.2vh 0.5vh rgba(0,0,0,0.6)';
    v['--bt-value-shadow'] = '0.35vh 0.35vh 0 rgba(0,0,0,0.85)';
    v['--bt-clue-shadow'] = '0.3vh 0.3vh 0 rgba(0,0,0,0.85)';
  }
  v['--bt-cat-scale'] = String(t.categoryScale);
  v['--bt-value-scale'] = String(t.valueScale);
  v['--bt-clue-scale'] = String(t.clueScale);
  return v;
}

/** File format for sharing a theme (images embedded as base64 so the file is self-contained). */
export interface ThemeFile {
  format: 'offline-jeopardy-theme';
  version: 1;
  theme: CustomThemeData;
  images: Record<string, { mime: string; base64: string }>; // key = original /media/clues/... URL
}
