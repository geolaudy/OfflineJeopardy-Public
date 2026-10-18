// Round 8 (pure parts): the opening board reveal flows without dead time (R8-4).
import { describe, expect, it } from 'vitest';
import { revealPlan, revealTimeline } from '../../src/web/pages/board/fx';
import { DEFAULT_TV_FX } from '../../src/shared/tvFx';

describe('board reveal timeline (R8-4)', () => {
  for (const [label, total] of [
    ['without a sound file', revealTimeline(DEFAULT_TV_FX, null)],
    ['with a 4 s board-fill sound', revealTimeline(DEFAULT_TV_FX, 3.971)],
    ['with a long sound (capped)', revealTimeline(DEFAULT_TV_FX, 30)],
  ] as const) {
    it(`no pause between the tiles, the category row and the round title — ${label}`, () => {
      const cols = 6;
      const p = revealPlan(DEFAULT_TV_FX, total, cols, 5);
      expect(p.delays).toHaveLength(cols * 5);
      const lastTileStart = Math.max(...p.delays);
      const tilesEnd = lastTileStart + p.d;
      const catEnd = p.catStart + 0.04 * (cols - 1) + p.d;
      // The category row starts before the last tiles have finished…
      expect(p.catStart).toBeLessThanOrEqual(tilesEnd + 0.001);
      // …and the title comes in while the category row is still finishing.
      expect(p.title).toBeGreaterThan(p.catStart);
      expect(p.title).toBeLessThanOrEqual(catEnd);
      // The whole reveal stays inside its timeline (the sound) and fills most of it.
      expect(catEnd).toBeLessThanOrEqual(total + p.d);
      expect(lastTileStart).toBeGreaterThan(total * 0.4);
    });
  }
});
