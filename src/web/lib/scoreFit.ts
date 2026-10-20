// R14-3: one score font size for a whole score row, fixed when the game starts — chosen so the widest
// score the game can reach fits the card, not the score shown right now (a score growing from $0 to
// $250,000 never runs out of its card, and the size does not jump with every change).
import { useLayoutEffect, useState, type RefObject } from 'react';
import type { GameView } from '../../shared/views';

/** The largest score (absolute) a row should have room for: at least six digits ($999,999), more
 *  when the board's values can go beyond that — every standard clue answered, doubled by Daily
 *  Wagers and doubled again in the Final — or when a score already is larger (manual adjustments). */
export function widestScore(g: Pick<GameView, 'rounds' | 'competitors'>) {
  let total = 0;
  for (const r of g.rounds ?? []) if (r.kind === 'standard') for (const c of r.categories) for (const q of c.clues) total += Math.max(0, q.value || 0);
  const reach = total * 4;
  const now = Math.max(0, ...g.competitors.map((c) => Math.abs(c.score)));
  const digits = Math.max(6, String(Math.floor(reach)).length, String(Math.floor(now)).length);
  return 10 ** digits - 1;
}

/** The text the size is fitted to: negative, with the currency and the thousands separators. */
export function scoreSample(prefix: string, widest: number) {
  return `−${prefix}${widest.toLocaleString()}`;
}

let canvas: HTMLCanvasElement | null = null;
/** Width of `text` in the element's own font at 100 px (canvas measurement, no layout). */
function textWidth100(el: HTMLElement, text: string) {
  const cs = getComputedStyle(el);
  canvas ??= document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * 60;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} 100px ${cs.fontFamily}`;
  const spacing = parseFloat(cs.letterSpacing);
  return ctx.measureText(text).width + (Number.isFinite(spacing) ? (spacing / parseFloat(cs.fontSize)) * 100 * text.length : 0);
}

/**
 * The font size (px) at which `sample` fits the width of `ref`'s element (`room` of it, leaving
 * space for shadows), never above `maxPx`. Measured again only when the element's width, the sample
 * or the fonts change — so a score change never changes the size.
 */
export function useFitFontSize(ref: RefObject<HTMLElement | null>, sample: string, maxPx: number, room = 0.92) {
  const [size, setSize] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      if (!w) return;
      const px = Math.floor(((w * room) / textWidth100(el, sample)) * 100 * 10) / 10;
      setSize(Math.max(6, Math.min(maxPx, px)));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [ref, sample, maxPx, room]);
  return size;
}
