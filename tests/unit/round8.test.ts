// Round 8 (pure parts): the opening board reveal flows without dead time (R8-4); rich clue text
// (R8-7 line breaks, R8-8 bold / italics / underline).
import { describe, expect, it } from 'vitest';
import { revealPlan, revealTimeline } from '../../src/web/pages/board/fx';
import { DEFAULT_TV_FX } from '../../src/shared/tvFx';
import { isRich, parseRich, plainText, toggleTag } from '../../src/shared/richText';

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

describe('rich clue text (R8-7, R8-8)', () => {
  it('parses line breaks and nested bold / italics / underline; other brackets stay text', () => {
    const lines = parseRich('A [b]bold [i]both[/i][/b] and [u]under[/u]\nSecond line [sic] M*A*S*H');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual([
      { text: 'A ', b: false, i: false, u: false },
      { text: 'bold ', b: true, i: false, u: false },
      { text: 'both', b: true, i: true, u: false },
      { text: ' and ', b: false, i: false, u: false },
      { text: 'under', b: false, i: false, u: true },
    ]);
    expect(lines[1]).toEqual([{ text: 'Second line [sic] M*A*S*H', b: false, i: false, u: false }]);
  });

  it('tolerates stray tags (an unmatched close is ignored, an open runs to the end)', () => {
    expect(parseRich('x[/b]y')).toEqual([[{ text: 'x', b: false, i: false, u: false }, { text: 'y', b: false, i: false, u: false }]]);
    expect(parseRich('[I]tail').flat()).toEqual([{ text: 'tail', b: false, i: true, u: false }]);
  });

  it('plain text for bots, AI and previews: no tags, line breaks as spaces', () => {
    expect(plainText('[b]Buda[/b]\n  and [i]Pest[/i] ')).toBe('Buda and Pest');
    expect(plainText('M*A*S*H [sic]')).toBe('M*A*S*H [sic]');
    expect(isRich('plain')).toBe(false);
    expect(isRich('two\nlines')).toBe(true);
    expect(isRich('[u]x[/u]')).toBe(true);
  });

  it('the editor buttons wrap the selection and toggle it back', () => {
    const on = toggleTag('the red planet', 4, 7, 'b');
    expect(on).toEqual({ text: 'the [b]red[/b] planet', start: 7, end: 10 });
    expect(toggleTag(on.text, on.start, on.end, 'b')).toEqual({ text: 'the red planet', start: 4, end: 7 });
    const sel = toggleTag('the [i]red[/i] planet', 4, 14, 'i');
    expect(sel.text).toBe('the red planet');
    expect(toggleTag('', 0, 0, 'u')).toEqual({ text: '[u][/u]', start: 3, end: 3 });
  });
});
