// Joy-Con HD rumble encoding (Z12). One side's 4 rumble bytes from a high/low frequency (Hz) and an
// amplitude (0..1), following the community-documented encoding (dekuNukem
// Nintendo_Switch_Reverse_Engineering, "rumble_data_table"). See RESEARCH_NOTES.md.

/** Neutral (no vibration) data for one side. */
export const RUMBLE_OFF = [0x00, 0x01, 0x40, 0x40] as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function encodeRumble(highHz: number, lowHz: number, amplitude: number): number[] {
  const amp = clamp(amplitude, 0, 1);
  if (amp === 0) return [...RUMBLE_OFF];
  const hf = (Math.round(32 * Math.log2(clamp(highHz, 81.75, 1252) / 10)) - 0x60) * 4;
  const lf = Math.round(32 * Math.log2(clamp(lowHz, 40.875, 626) / 10)) - 0x40;
  const l = Math.log2(amp * 1000) * 32 - 0x60;
  const hfAmp = Math.max(0, Math.round(amp < 0.117 ? l / (5 - amp * amp) - 1 : amp < 0.23 ? l - 0x5c : l * 2 - 0xf6)) & 0xff;
  let lfAmp = Math.round(hfAmp * 0.5);
  const parity = lfAmp % 2;
  if (parity) lfAmp--;
  lfAmp = (lfAmp >> 1) + 0x40;
  if (parity) lfAmp |= 0x8000;
  return [hf & 0xff, (((hf >> 8) & 0xff) + hfAmp) & 0xff, (lf + ((lfAmp >> 8) & 0xff)) & 0xff, lfAmp & 0xff];
}

/** A vibration pattern: steps of [amplitude 0..1, milliseconds]. */
export type RumblePattern = [number, number][];

export const RUMBLE_PATTERNS = {
  /** This player buzzed in first: one firm pulse. */
  buzzWin: [[0.65, 220]],
  /** Too early / locked out: two short taps. */
  early: [[0.45, 70], [0, 90], [0.45, 70]],
  /** "Which one is this?" — a medium pulse with the light flash. */
  identify: [[0.5, 300]],
  /** Settings / Buzzers page test. */
  test: [[0.6, 450]],
} satisfies Record<string, RumblePattern>;
export type RumbleFx = keyof typeof RUMBLE_PATTERNS;
