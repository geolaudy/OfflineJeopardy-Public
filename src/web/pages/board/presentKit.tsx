// Small building blocks shared by the TV lobby (full / compact) and the presented pages.
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { motion } from 'motion/react';
import { Avatar, cx } from '../../components/ui';
import { useBoard } from './common';
import { EASE_MORPH_ARR, EASE_OUT_ARR, T } from './timing';
import type { LobbyPerson } from './lobbyModel';

/** Text / surfaces of the lobby that are not shared elements: fade in once the morph is under way,
 *  fade out quickly when leaving. */
export function Fade({ children, className, delay = 0, testId }: { children?: ReactNode; className?: string; delay?: number; testId?: string }) {
  return (
    <motion.div
      className={className}
      data-testid={testId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: T.morphFadeIn, delay: T.morph * 0.4 + delay, ease: EASE_OUT_ARR } }}
      exit={{ opacity: 0, transition: { duration: T.morphFadeOut } }}
    >
      {children}
    </motion.div>
  );
}

// Mounted shared avatars by key. When the lobby switches between full and compact, the outgoing
// layout stays mounted while it fades out, so a newly mounted avatar finds its predecessor here
// and FLIPs from the predecessor's on-screen box (transform only), while the predecessor hides.
const mountedAvatars = new Map<string, Set<HTMLElement>>();

/** A player's avatar that flies between the full lobby and the compact panel (shared element).
 *  `size` is in pixels; `animateIn` fades in an avatar that has no predecessor. */
export function SharedAvatar({ p, size, animateIn }: { p: LobbyPerson; size: number; animateIn: boolean }) {
  const ctx = useBoard();
  const ref = useRef<HTMLDivElement>(null);
  const reduced = ctx.reduced;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = p.key;
    let set = mountedAvatars.get(key);
    if (!set) mountedAvatars.set(key, (set = new Set()));
    const prev = [...set].find((e) => e !== el && e.isConnected);
    set.add(el);
    if (prev) {
      const a = prev.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      // Hide the outgoing copy while it is still mounted (temporary, so a layout that comes back
      // before its exit finished does not keep hidden avatars).
      prev.animate([{ opacity: 0 }, { opacity: 0 }], { duration: (T.morph + 0.2) * 1000 });
      if (!reduced && b.width > 0 && a.width > 0) {
        el.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})` }, { transform: 'none' }], {
          duration: T.morph * 1000,
          easing: `cubic-bezier(${EASE_MORPH_ARR.join(',')})`,
        });
      }
    }
    return () => {
      set.delete(el);
      if (!set.size) mountedAvatars.delete(key);
    };
    // Only on mount / identity change: re-renders must not restart the flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.key]);
  return (
    <motion.div
      ref={ref}
      className="tvp-av"
      initial={animateIn ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: T.morphFadeOut } }}
      transition={{ duration: T.fade, ease: EASE_OUT_ARR, delay: animateIn ? T.morph * 0.4 : 0 }}
    >
      <Avatar profile={p} size={Math.max(8, Math.round(size))} />
    </motion.div>
  );
}

/** Subtle device label with a readiness dot ("Phone", "Joy-Con (L)"…) — never an id. */
export function DeviceTag({ device, ready, className }: { device: string; ready: boolean; className?: string }) {
  if (!device) return null;
  return (
    <span className={cx('tvp-dev', className)}>
      <i className={cx('tvp-dot', ready && 'is-ready')} aria-hidden />
      {device === 'Computer' ? 'Computer player' : device}
      <span className="sr-only">{ready ? ' (ready)' : ' (not connected)'}</span>
    </span>
  );
}

/** Size of an element's content box (kept up to date with a ResizeObserver). */
export function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * Card grid that fills a box: picks the column count giving the largest readable cards
 * (cards need to be at least `minRatio` times wider than tall to fit a name beside the avatar).
 */
export function fitCards(n: number, box: { w: number; h: number }, opts: { gap: number; maxH: number; minRatio: number; maxCols: number }) {
  const count = Math.max(1, n);
  let best = { cols: 1, rows: count, cardW: box.w, cardH: 0, score: -1 };
  for (let cols = 1; cols <= Math.min(opts.maxCols, count); cols++) {
    const rows = Math.ceil(count / cols);
    const cardW = (box.w - opts.gap * (cols - 1)) / cols;
    const cardH = Math.min(opts.maxH, (box.h - opts.gap * (rows - 1)) / rows, cardW / opts.minRatio);
    // Prefer bigger cards; break ties towards fewer rows.
    const score = cardH + cols * 0.01;
    if (score > best.score) best = { cols, rows, cardW, cardH, score };
  }
  return best;
}

/** Narrower than about 3:2 (5:4 / 4:3 projectors): pages use fewer columns. Re-renders with the
 *  board context, which changes on every resize. */
export function useNarrow() {
  useBoard();
  return typeof window !== 'undefined' && window.innerWidth / Math.max(1, window.innerHeight) < 1.5;
}

/** Columns for n cards, given a column cap that depends on the space available. */
export function columnsFor(n: number, maxCols: number) {
  const c = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : n <= 25 ? 5 : 6;
  return Math.max(1, Math.min(c, maxCols));
}
