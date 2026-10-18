// Small shared helpers for the TV board: presentation context, viewport units, fit-to-box text.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { cx } from '../../components/ui';
import { themeCssVars, valuePrefixFor, type CustomThemeData } from '../../../shared/themes';
import { RichText } from '../../components/RichText';

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

/** A clue value on a board tile: no thousands separator, like the reference board ("$1000"). */
export function tileMoney(prefix: string, v: number) {
  return `${v < 0 ? '−' : ''}${prefix}${Math.abs(v)}`;
}

/** A score change as shown on the TV (R5-7): "+$400" / "−$400" (U+2212), theme prefix like the
 *  board values. */
export function deltaText(prefix: string, delta: number) {
  return `${delta > 0 ? '+' : '−'}${prefix}${Math.abs(delta).toLocaleString()}`;
}

/**
 * The last change of a displayed score (R5-7), or null. The first value seen (mount, a TV that
 * loads mid-game) is never a change; the same value arriving again (duplicate state, reconnect)
 * is not either. `n` increases with every change so one-shot animations can restart.
 */
export function useScoreChange(score: number, from?: number, quiet = false) {
  // `from`: the value before a change that happened as this element appeared.
  // `quiet`: the change is a manual adjustment or an undo (R7-11) — recorded, never animated.
  const [last, setLast] = useState(from ?? score);
  const [change, setChange] = useState<{ delta: number; n: number; quiet: boolean } | null>(null);
  if (score !== last) {
    setLast(score);
    setChange({ delta: score - last, n: (change?.n ?? 0) + 1, quiet });
  }
  return change;
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

/** R6-2.4: a category name may be at most this share of its cell's text box height (one line) —
 *  the proportion the iPad replica already had; long names still shrink to fit. */
export const CATEGORY_TEXT_SHARE = 0.34;

/** R8-9: a category header on the board (TV and iPad replica): the name — the same size as
 *  without a subheading — with a smaller subheading under it when the category has one. R10-3:
 *  the two lines are one group, centred together, the subheading directly under the name. */
export function CategoryText({ name, subheading, scale, min }: { name: string; subheading?: string; scale: number; min: number }) {
  if (!subheading?.trim()) return <FitText text={name} max={4.4 * scale} maxBox={CATEGORY_TEXT_SHARE * scale} min={min * scale} className="bt-cat-text" />;
  return (
    <FitStack
      lines={[
        { text: name, em: 1, className: 'bt-cat-text' },
        { text: subheading, em: 0.55, minVh: 0.9 * scale, className: 'bt-cat-sub', testId: 'category-subheading' },
      ]}
      max={4.4 * scale}
      maxBox={CATEGORY_TEXT_SHARE * scale}
      min={min * 0.85 * scale}
    />
  );
}

/** A category name with its subheading (R10-3) for the introduction and Final screens. */
export function CategoryTitle({ name, subheading, max, min, subEm, subMin, boxClassName, subTestId }: { name: string; subheading?: string; max: number; min: number; subEm: number; subMin: number; boxClassName?: string; subTestId: string }) {
  if (!subheading?.trim()) return <FitText text={name} max={max} min={min} className="bt-intro-cat" boxClassName={boxClassName} />;
  return (
    <FitStack
      lines={[
        { text: name, em: 1, className: 'bt-intro-cat' },
        { text: subheading, em: subEm, minVh: subMin, className: 'bt-intro-sub', testId: subTestId },
      ]}
      max={max}
      min={min}
      boxClassName={boxClassName}
    />
  );
}

export interface FitLine {
  text: string;
  /** Size relative to the first line's. */
  em: number;
  /** Never smaller than this (vh), however much the group shrinks. */
  minVh?: number;
  className?: string;
  testId?: string;
}

/**
 * R10-3: several lines of text that shrink together (like FitText) to fit one box and are centred
 * in it as one group — a category name with its subheading directly underneath, at any length.
 */
export function FitStack({ lines, max, maxBox, min, boxClassName }: { lines: FitLine[]; max: number; maxBox?: number; min: number; boxClassName?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(lines.map((l) => [l.text, l.em, l.minVh ?? 0]));
  useLayoutEffect(() => {
    const box = boxRef.current;
    const el = ref.current;
    if (!box || !el) return;
    const fit = () => {
      const vh = window.innerHeight / 100;
      const kids = Array.from(el.children) as HTMLElement[];
      const spec = JSON.parse(key) as [string, number, number][];
      const set = (px: number) => kids.forEach((k, i) => (k.style.fontSize = `${Math.max(px * (spec[i]?.[1] ?? 1), (spec[i]?.[2] ?? 0) * vh)}px`));
      const fits = () => kids.every((k) => k.scrollWidth <= box.clientWidth + 1) && el.offsetHeight <= box.clientHeight + 1;
      let hi = maxBox ? box.clientHeight * maxBox : max * vh;
      let lo = Math.min(min * vh, hi);
      set(hi);
      if (fits() || box.clientHeight === 0) return;
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        set(mid);
        if (fits()) lo = mid;
        else hi = mid;
      }
      set(lo);
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
  }, [key, max, maxBox, min]);
  return (
    <div ref={boxRef} className={cx('bt-fit-box', boxClassName)}>
      <div ref={ref} className="bt-fit bt-fit-stack">
        {lines.map((l, i) => (
          <div key={i} className={l.className} style={{ fontSize: `${max * l.em}vh` }} data-testid={l.testId}>
            <RichText text={l.text} />
          </div>
        ))}
      </div>
    </div>
  );
} // R7-5: capitals ≈ 25 % of the tile height, as on the reference board

/**
 * Text that shrinks (between `min` and `max`, in vh) until it fits its box — long category names
 * and clues stay readable at any aspect ratio. Measures only when the text or box size changes.
 * `maxBox` (R6-2.4) replaces `max` with a share of the box's own height, so the text has the same
 * proportions in a box of any size (the TV board and its iPad replica).
 */
export function FitText({
  text,
  max,
  maxBox,
  min,
  className,
  boxClassName,
  boxStyle,
  testId,
}: {
  text: string;
  max: number;
  maxBox?: number;
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
      let hi = maxBox ? box.clientHeight * maxBox : max * vh;
      let lo = Math.min(min * vh, hi);
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
  }, [text, max, maxBox, min]);
  return (
    <div ref={boxRef} className={cx('bt-fit-box', boxClassName)} style={boxStyle}>
      <div ref={ref} className={cx('bt-fit', className)} style={{ fontSize: `${max}vh` }} data-testid={testId}>
        {/* R8-7/R8-8: line breaks and bold / italics / underline from the board. */}
        <RichText text={text} />
      </div>
    </div>
  );
}
