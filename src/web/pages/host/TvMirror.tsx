// What the TV shows, on the host's iPad (R5-12 … R5-14):
// - TvPreview: the real TV components (board/Preview.tsx?live=1) in a 1280×720 iframe scaled to
//   fit, fed the game over postMessage. Inside the iframe vh/vw are the iframe's own, so the
//   proportions are exactly the TV's. Nothing is sent to the server or the TV; no sound plays.
// - HostBoardHits: tap targets over the preview's board tiles (R13-13).
// - FitBox: the largest box of a given aspect ratio that fits the available space.
// Both screens have square corners, like the TV they stand for (R7-23).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Dices } from 'lucide-react';
import type { GameView } from '../../../shared/views';
import type { LivePreviewMessage, PreviewTilesMessage } from '../board/Preview';
import type { PublicSettings } from '../board/BoardPage';
import { api } from '../../lib/api';
import { useLive } from '../../lib/socket';
import { cx } from '../../components/ui';

import '../board/fonts.css';
import '../board/board.css';
import './host-tv.css';

type Look = LivePreviewMessage['look'];
const DEFAULT_LOOK: Look = { theme: 'classic', custom: null, reducedMotion: false };

/** The TV's theme, effects and fonts (public settings), refreshed when settings change. */
export function useBoardLook(): Look {
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const version = useLive((s) => s.profilesVersion);
  useEffect(() => {
    let alive = true;
    api<PublicSettings>('GET', '/api/settings/public').then(
      (s) => alive && setLook({ theme: s.theme, custom: s.custom, tvFx: s.tvFx, fonts: s.fonts, reducedMotion: s.reducedMotion }),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [version]);
  return look;
}

/** Size of an element's content box, updated only when it changes. */
export function useSize(ref: RefObject<HTMLElement | null>) {
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

/** Fills its parent (flex-1) and centres the largest `ratio` box that fits by width and height.
 *  `children` also get the space available (`aw` × `ah`). */
export function FitBox({ ratio = 16 / 9, className, boxClassName, children, testId, align = 'center' }: { ratio?: number; className?: string; boxClassName?: string; children: (size: { w: number; h: number; aw: number; ah: number }) => ReactNode; testId?: string; align?: 'center' | 'start' }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w: aw, h: ah } = useSize(ref);
  let w = aw;
  let h = aw / ratio;
  if (h > ah) {
    h = ah;
    w = ah * ratio;
  }
  w = Math.floor(w);
  h = Math.floor(h);
  return (
    <div ref={ref} className={cx('relative flex min-h-0 min-w-0 flex-1 justify-center', align === 'center' ? 'items-center' : 'items-start', className)}>
      {w > 0 && h > 0 && (
        <div className={cx('relative shrink-0', boxClassName)} style={{ width: w, height: h }} data-testid={testId}>
          {children({ w, h, aw, ah })}
        </div>
      )}
    </div>
  );
}

/** Strips what a TV mirror never needs (event log, undo, host-only clue text on the board). Media
 *  follows the TV's playback but always muted: only the TV plays the sound. */
function forMirror(g: GameView): GameView {
  return {
    ...g,
    events: undefined,
    undoLabel: undefined,
    media: g.media ? { ...g.media, muted: true } : null,
    rounds: g.rounds.map((r) => ({ ...r, categories: r.categories.map((c) => ({ ...c, clues: c.clues.map((q) => ({ id: q.id, value: q.value, used: q.used })) })) })),
  };
}

const W = 1280;
const H = 720;

/**
 * The TV presentation of `game`, scaled into its parent box (which must have a 16:9 size).
 * `scoreboard` adds the TV's score strip, as on the real screen.
 */
export type PreviewTile = PreviewTilesMessage['tiles'][number];

export function TvPreview({ game, scoreboard, band, frameless, title, size, testId, onTiles }: { game: GameView; scoreboard: boolean; band?: boolean; frameless?: boolean; title: string; size: { w: number; h: number }; testId?: string; onTiles?: (tiles: PreviewTile[]) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const look = useBoardLook();
  const offset = useLive((s) => s.offset);
  const tilesCb = useRef(onTiles);
  tilesCb.current = onTiles;
  const bandRef = useRef(band);
  bandRef.current = band;
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== ref.current?.contentWindow) return;
      const type = (e.data as { type?: string })?.type;
      if (type === 'oj-preview-ready') setReady(true);
      if (type === 'oj-preview-tiles') tilesCb.current?.((e.data as PreviewTilesMessage).tiles);
      // R16-19: the preview's clue zoom starts — GameFrame's surroundings follow it.
      if (type === 'oj-preview-zoom' && bandRef.current) window.dispatchEvent(new CustomEvent('oj-preview-zoom', { detail: (e.data as { zoom: unknown }).zoom }));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const mirror = useMemo(() => forMirror(game), [game]);
  useEffect(() => {
    if (!ready) return;
    const m: LivePreviewMessage = { type: 'oj-live-preview', look, offset, game: mirror, scoreboard, band };
    ref.current?.contentWindow?.postMessage(m, location.origin);
  }, [ready, look, offset, mirror, scoreboard, band]);
  const scale = size.w / W;
  return (
    // R13-1: no frame of its own in the host's preview (the blue around it is the TV's own background).
    <div className={cx('absolute inset-0 overflow-hidden', !frameless && 'bg-black shadow-sm ring-1 ring-black/10')} data-testid={testId} data-ready={ready ? 'true' : 'false'}>
      <iframe
        ref={ref}
        src="/board/preview?live=1"
        title={title}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
        // Hidden until the TV page is ready (no light "Loading…" flash inside the black frame).
        style={{ width: W, height: H, transform: `scale(${scale})`, opacity: ready ? 1 : 0, transition: 'opacity 0.15s' }}
      />
    </div>
  );
}

/**
 * R13-13: the board's tiles made tappable over the live preview, which shows the TV's own board (its
 * fill-in and its zoom into the clue). The preview reports where its tiles are; each gets a clear
 * button of exactly that size (host names: "History for 200") and the host-only Daily Double! mark.
 */
export function HostBoardHits({ g, tiles, scale, onTile }: { g: GameView; tiles: PreviewTile[]; scale: number; onTile: (clueId: string, used: boolean) => void }) {
  const round = g.rounds[g.roundIndex];
  if (!round) return null;
  const clues = new Map(round.categories.flatMap((c) => c.clues.map((q) => [q.id, { c, q }] as const)));
  return (
    <div className="absolute inset-0" data-testid="host-board">
      {tiles.map((t) => {
        const hit = clues.get(t.id);
        if (!hit) return null;
        const { c, q } = hit;
        return (
          <button
            key={t.id}
            type="button"
            disabled={g.phase !== 'board'}
            onClick={() => onTile(q.id, q.used)}
            className={cx('host-hit', q.used && 'is-used')}
            style={{ left: t.x * scale, top: t.y * scale, width: t.w * scale, height: t.h * scale }}
            aria-label={`${c.name} for ${q.value}${q.used ? ' (played)' : ''}${q.dailyWager ? ' — Daily Double!' : ''}`}
            data-testid="host-tile"
          >
            {q.dailyWager && !q.used && (
              <span className="host-dd-mark" title="Daily Double! (only you see this)" aria-hidden>
                <Dices size={Math.round(Math.max(9, Math.min(16, t.h * scale * 0.24)))} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
