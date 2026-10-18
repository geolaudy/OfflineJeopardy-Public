// Small building blocks shared by the TV lobby (full / compact) and the presented pages.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { motion } from 'motion/react';
import { Avatar, cx } from '../../components/ui';
import { useBoard } from './common';
import { EASE_MORPH_ARR, EASE_OUT_ARR, T } from './timing';
import { deviceLine, type LobbyPerson } from './lobbyModel';

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

/** Subtle device label with a readiness dot and, for a connected phone, its measured delay
 *  ("Phone • 25 ms", "Joy-Con (L) • Bluetooth", R7-4) — never an id. */
export function DeviceTag({ device, ready, latencyMs, prefix, className }: { device: string; ready: boolean; latencyMs?: number; prefix?: string; className?: string }) {
  if (!device) return null;
  return (
    <span className={cx('tvp-dev', className)} data-testid="tv-device">
      <i className={cx('tvp-dot', ready && 'is-ready')} aria-hidden />
      <span className="tvp-dev-text">
        {prefix}
        {deviceLine(device, ready, latencyMs)}
      </span>
      {ready && <span className="sr-only"> (ready)</span>}
    </span>
  );
}

/** R7-3: the lobby nickname as the main name with the profile name underneath (smaller, gray,
 *  same family). Long names shrink with their box and then wrap — never cut off. `free`: the
 *  box sizes to its content (inline chips) instead of its container. */
export function StackedName({ name, realName, free, len, children }: { name: string; realName?: string; free?: boolean; len?: number; children?: ReactNode }) {
  return (
    <span className={cx('tvp-names', free && 'is-free')} data-testid="tv-name">
      <span className="tvp-name-main" style={{ '--len': len ?? name.length } as CSSProperties}>
        {name}
        {children}
      </span>
      {realName && (
        <span className="tvp-name-real" style={{ '--len': realName.length } as CSSProperties} data-testid="tv-real-name">
          {realName}
        </span>
      )}
    </span>
  );
}

/** Join address and room code: panel text beside the shared QR (R6-11). Long addresses shrink to
 *  stay on one line (sized against the container's width). */
export function JoinAddress({ url, roomCode, className }: { url: string | null; roomCode: string | null; className?: string }) {
  if (!url && !roomCode) return null;
  return (
    <div className={cx('tvp-addr', className)}>
      {url && (
        <p className="tvp-addr-url">
          <span className="tvp-addr-k">Or open</span>
          <span className="tvp-addr-v" style={{ '--len': url.length } as CSSProperties}>
            {url}
          </span>
        </p>
      )}
      {roomCode && (
        <p className="tvp-addr-code" data-testid="tv-room-code">
          <span className="tvp-addr-k">Room code</span>
          <span className="tvp-addr-room">{roomCode}</span>
        </p>
      )}
    </div>
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

/** Type scale (`min`…1) that makes an overflow-hidden box's content fit it. Starts again from 1
 *  when `key` changes (content or box size), then shrinks until nothing is cut off. */
export function useFitScale(ref: RefObject<HTMLElement | null>, key: string, min = 0.6) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => setScale(1), [key]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const need = el.scrollHeight;
    const have = el.clientHeight;
    if (have > 0 && need > have + 1) setScale((v) => Math.max(min, Math.floor(v * Math.max(0.9, have / need) * 100) / 100));
  }, [ref, scale, key, min]);
  return scale;
}

/**
 * Card grid that fills a box: picks the column count giving the largest readable cards
 * (cards need to be at least `minRatio` times wider than tall to fit a name beside the avatar).
 */
export function fitCards(n: number, box: { w: number; h: number }, opts: { gap: number; maxH: number; minRatio: number; maxCols: number; idealRatio?: number }) {
  const count = Math.max(1, n);
  let best = { cols: 1, rows: count, cardW: box.w, cardH: 0, score: -1 };
  for (let cols = 1; cols <= Math.min(opts.maxCols, count); cols++) {
    const rows = Math.ceil(count / cols);
    const cardW = (box.w - opts.gap * (cols - 1)) / cols;
    const cardH = Math.min(opts.maxH, (box.h - opts.gap * (rows - 1)) / rows, cardW / opts.minRatio);
    // Prefer bigger cards; break ties towards fewer rows. With `idealRatio`, equally tall cards
    // that are too narrow for it (names cut off) lose to fewer, wider columns.
    const wide = opts.idealRatio ? Math.min(1, cardW / (cardH * opts.idealRatio)) : 1;
    const score = cardH * (1 + 0.1 * wide) + cols * 0.01;
    if (score > best.score) best = { cols, rows, cardW, cardH, score };
  }
  return best;
}
