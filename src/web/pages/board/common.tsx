// Small shared helpers for the TV board: presentation context, viewport units, fit-to-box text.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { cx } from '../../components/ui';
import { themeCssVars, valuePrefixFor, type CustomThemeData } from '../../../shared/themes';

export interface BoardPresentation {
  theme: string;
  /** Shown before clue values ("$" on the classic preset; custom themes may change it). */
  prefix: string;
  /** Custom theme logo (shown on title screens), or null. */
  logo: string | null;
  /** Text size multipliers from a custom theme (1 = default). */
  scale: { category: number; value: number; clue: number };
  /** Reduced motion (OS preference or the board setting): cross-fades instead of zooms/slides. */
  reduced: boolean;
  /** Viewport height in px (for components that need pixel sizes, e.g. avatars). */
  vh: number;
}

export const DEFAULT_SCALE = { category: 1, value: 1, clue: 1 };
export const BoardCtx = createContext<BoardPresentation>({ theme: 'classic', prefix: '$', logo: null, scale: DEFAULT_SCALE, reduced: false, vh: 1080 });

/** data-theme + inline CSS variables for the board root. A custom theme overrides its base preset. */
export function themeRoot(theme: string, custom: CustomThemeData | null): { dataTheme: string; style: CSSProperties | undefined } {
  if (!custom) return { dataTheme: theme, style: undefined };
  const style: Record<string, string> = { ...themeCssVars(custom) };
  if (custom.backgroundImage) {
    const d = custom.backgroundDim;
    style.backgroundImage = `linear-gradient(rgba(0,0,0,${d}), rgba(0,0,0,${d})), url("${custom.backgroundImage}")`;
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
  }
  return { dataTheme: custom.base, style: style as CSSProperties };
}

export function presentationFor(theme: string, custom: CustomThemeData | null, reduced: boolean, vh: number): BoardPresentation {
  return {
    theme: custom?.base ?? theme,
    prefix: valuePrefixFor(custom?.base ?? theme, custom),
    logo: custom?.logo ?? null,
    scale: custom ? { category: custom.categoryScale, value: custom.valueScale, clue: custom.clueScale } : DEFAULT_SCALE,
    reduced,
    vh,
  };
}
export const useBoard = () => useContext(BoardCtx);

/** Pixel size for `n` percent of the viewport height. */
export function vhPx(ctx: BoardPresentation, n: number) {
  return Math.max(8, Math.round((ctx.vh * n) / 100));
}

/** Clue values with the theme's prefix ("$" on the classic preset). */
export function money(prefix: string, v: number) {
  const s = Math.abs(v).toLocaleString();
  const sign = v < 0 ? '−' : '';
  return `${sign}${prefix}${s}`;
}

export function useViewportHeight() {
  const [h, setH] = useState(() => (typeof window === 'undefined' ? 1080 : window.innerHeight));
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return h;
}

export function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduce;
}

/**
 * Text that shrinks (between `min` and `max`, in vh) until it fits its box — long category names
 * and clues stay readable at any aspect ratio. Measures only when the text or box size changes.
 */
export function FitText({
  text,
  max,
  min,
  className,
  boxClassName,
  boxStyle,
  testId,
}: {
  text: string;
  max: number;
  min: number;
  className?: string;
  boxClassName?: string;
  boxStyle?: CSSProperties;
  testId?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const el = ref.current;
    if (!box || !el) return;
    const fit = () => {
      const vh = window.innerHeight / 100;
      const fits = () => el.scrollWidth <= box.clientWidth + 1 && el.offsetHeight <= box.clientHeight + 1;
      let lo = min * vh;
      let hi = max * vh;
      el.style.fontSize = `${hi}px`;
      if (fits() || box.clientHeight === 0) return;
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        el.style.fontSize = `${mid}px`;
        if (fits()) lo = mid;
        else hi = mid;
      }
      el.style.fontSize = `${lo}px`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    let last = `${box.clientWidth}x${box.clientHeight}`;
    const ro = new ResizeObserver(() => {
      const now = `${box.clientWidth}x${box.clientHeight}`;
      if (now !== last) {
        last = now;
        fit();
      }
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [text, max, min]);
  return (
    <div ref={boxRef} className={cx('bt-fit-box', boxClassName)} style={boxStyle}>
      <div ref={ref} className={cx('bt-fit', className)} style={{ fontSize: `${max}vh` }} data-testid={testId}>
        {text}
      </div>
    </div>
  );
}
