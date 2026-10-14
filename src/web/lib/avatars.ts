// Built-in avatars: rendered with the device's own emoji font (no image assets
// or third-party artwork needed, works offline).
export const AVATARS: { id: string; emoji: string; label: string }[] = [
  { id: 'fox', emoji: '🦊', label: 'Fox' },
  { id: 'panda', emoji: '🐼', label: 'Panda' },
  { id: 'frog', emoji: '🐸', label: 'Frog' },
  { id: 'owl', emoji: '🦉', label: 'Owl' },
  { id: 'octopus', emoji: '🐙', label: 'Octopus' },
  { id: 'lion', emoji: '🦁', label: 'Lion' },
  { id: 'tiger', emoji: '🐯', label: 'Tiger' },
  { id: 'koala', emoji: '🐨', label: 'Koala' },
  { id: 'monkey', emoji: '🐵', label: 'Monkey' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn' },
  { id: 'turtle', emoji: '🐢', label: 'Turtle' },
  { id: 'whale', emoji: '🐳', label: 'Whale' },
  { id: 'rocket', emoji: '🚀', label: 'Rocket' },
  { id: 'star', emoji: '⭐', label: 'Star' },
  { id: 'guitar', emoji: '🎸', label: 'Guitar' },
  { id: 'pizza', emoji: '🍕', label: 'Pizza' },
  { id: 'robot', emoji: '🤖', label: 'Robot' },
  { id: 'ghost', emoji: '👻', label: 'Ghost' },
  { id: 'cactus', emoji: '🌵', label: 'Cactus' },
  { id: 'crown', emoji: '👑', label: 'Crown' },
];

export const TEAM_AVATARS: { id: string; emoji: string; label: string }[] = [
  { id: 'shield', emoji: '🛡️', label: 'Shield' },
  { id: 'dragon', emoji: '🐉', label: 'Dragon' },
  { id: 'wizard', emoji: '🧙', label: 'Wizard' },
  { id: 'lightning', emoji: '⚡', label: 'Lightning' },
  { id: 'fire', emoji: '🔥', label: 'Fire' },
  { id: 'trophy', emoji: '🏆', label: 'Trophy' },
  { id: 'brain', emoji: '🧠', label: 'Brain' },
  { id: 'knight', emoji: '♞', label: 'Knight' },
  ...AVATARS,
];

const ALL = new Map([...AVATARS, ...TEAM_AVATARS].map((a) => [a.id, a.emoji]));
export const avatarEmoji = (id?: string | null) => (id && ALL.get(id)) || '🙂';

/** Accessible preset palette (all pass 4.5:1 contrast with white text). */
export { PLAYER_COLORS } from '../../shared/game';

/** Choose black or white text for a background colour (WCAG relative luminance). */
export function readableOn(hex: string): '#000000' | '#ffffff' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return (1.05) / (L + 0.05) >= (L + 0.05) / 0.05 ? '#ffffff' : '#000000';
}

export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace('#', ''), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
