// Small shared helpers for the TV board: presentation context, viewport units, fit-to-box text.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../../components/ui';

export interface BoardPresentation {
  theme: string;
  /** Reduced motion (OS preference or the board setting): cross-fades instead of zooms/slides. */
  reduced: boolean;
  /** Viewport height in px (for components that need pixel sizes, e.g. avatars). */
  vh: number;
}

export const BoardCtx = createContext<BoardPresentation>({ theme: 'classic', reduced: false, vh: 1080 });
export const useBoard = () => useContext(BoardCtx);

/** Pixel size for `n` percent of the viewport height. */
export function vhPx(ctx: BoardPresentation, n: number) {
  return Math.max(8, Math.round((ctx.vh * n) / 100));
}

/** Clue values: the classic theme shows a "$" prefix, other themes plain numbers. */
export function money(theme: string, v: number) {
  const s = Math.abs(v).toLocaleString();
  const sign = v < 0 ? '−' : '';
  return theme === 'classic' ? `${sign}$${s}` : `${sign}${s}`;
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
  testId,
}: {
  text: string;
  max: number;
  min: number;
  className?: string;
  boxClassName?: string;
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
    <div ref={boxRef} className={cx('bt-fit-box', boxClassName)}>
      <div ref={ref} className={cx('bt-fit', className)} style={{ fontSize: `${max}vh` }} data-testid={testId}>
        {text}
      </div>
    </div>
  );
}
