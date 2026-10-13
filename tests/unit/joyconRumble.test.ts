import { describe, expect, it } from 'vitest';
import { encodeRumble, RUMBLE_OFF, RUMBLE_PATTERNS } from '../../src/shared/joyconRumble';

describe('Joy-Con rumble encoding (Z12)', () => {
  it('zero amplitude is the documented neutral packet (320 Hz high / 160 Hz low)', () => {
    expect(encodeRumble(320, 160, 0)).toEqual([...RUMBLE_OFF]);
    expect(RUMBLE_OFF).toEqual([0x00, 0x01, 0x40, 0x40]);
  });

  it('frequencies land on the documented codes and full amplitude uses the maximum amplitude code', () => {
    // 320 Hz high band -> 0x0100, 160 Hz low band -> 0x40; amplitude 1.0 -> high-band amplitude 0xC8.
    const [b0, b1, b2, b3] = encodeRumble(320, 160, 1);
    expect(b0).toBe(0x00);
    expect(b1 - 0x01).toBe(0xc8);
    expect(b2).toBe(0x40);
    expect(b3).toBe(0x72);
  });

  it('always produces four bytes in range and stronger amplitudes encode higher', () => {
    let last = -1;
    for (const a of [0.05, 0.15, 0.3, 0.6, 1]) {
      const bytes = encodeRumble(160, 320, a);
      expect(bytes).toHaveLength(4);
      for (const b of bytes) expect(b >= 0 && b <= 255).toBe(true);
      const hfAmp = bytes[1] - ((((Math.round(32 * Math.log2(16)) - 0x60) * 4) >> 8) & 0xff);
      expect(hfAmp).toBeGreaterThan(last);
      last = hfAmp;
    }
    expect(encodeRumble(5, 5000, 2)).toHaveLength(4); // clamped, never throws
  });

  it('patterns are short (never a long buzz on a player\'s hand)', () => {
    for (const p of Object.values(RUMBLE_PATTERNS)) expect(p.reduce((s, [, ms]) => s + ms, 0)).toBeLessThanOrEqual(600);
  });
});
