// What the TV shows, on the host's iPad (R5-12 … R5-14):
// - TvPreview: the real TV components (board/Preview.tsx?live=1) in a 1280×720 iframe scaled to
//   fit, fed the game over postMessage. Inside the iframe vh/vw are the iframe's own, so the
//   proportions are exactly the TV's. Nothing is sent to the server or the TV; no sound plays.
// - HostBoardGrid: the TV board grid (same classes and theme) with tappable tiles.
// - FitBox: the largest box of a given aspect ratio that fits the available space.
// Both screens have square corners, like the TV they stand for (R7-23).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Dices } from 'lucide-react';
import type { GameView } from '../../../shared/views';
import type { LivePreviewMessage } from '../board/Preview';
import type { PublicSettings } from '../board/BoardPage';
import { api } from '../../lib/api';
import { useLive } from '../../lib/socket';
import { cx } from '../../components/ui';
import { CATEGORY_TEXT_SHARE, FitText, money, presentationFor, themeRoot, tileMoney } from '../board/common';
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

/** Fills its parent (flex-1) and centres the largest `ratio` box that fits by width and height. */
export function FitBox({ ratio = 16 / 9, className, boxClassName, children, testId, align = 'center' }: { ratio?: number; className?: string; boxClassName?: string; children: (size: { w: number; h: number }) => ReactNode; testId?: string; align?: 'center' | 'start' }) {
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
          {children({ w, h })}
        </div>
      )}
    </div>
  );
}

/** Strips what a TV mirror never needs (event log, undo, host-only clue text on the board). */
function forMirror(g: GameView): GameView {
  return {
    ...g,
    events: undefined,
    undoLabel: undefined,
    rounds: g.rounds.map((r) => ({ ...r, categories: r.categories.map((c) => ({ ...c, clues: c.clues.map((q) => ({ id: q.id, value: q.value, used: q.used })) })) })),
  };
}

const W = 1280;
const H = 720;

/**
 * The TV presentation of `game`, scaled into its parent box (which must have a 16:9 size).
 * `scoreboard` adds the TV's score strip, as on the real screen.
 */
export function TvPreview({ game, scoreboard, title, size, testId }: { game: GameView; scoreboard: boolean; title: string; size: { w: number; h: number }; testId?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const look = useBoardLook();
  const offset = useLive((s) => s.offset);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === location.origin && e.source === ref.current?.contentWindow && (e.data as { type?: string })?.type === 'oj-preview-ready') setReady(true);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const mirror = useMemo(() => forMirror(game), [game]);
  useEffect(() => {
    if (!ready) return;
    const m: LivePreviewMessage = { type: 'oj-live-preview', look, offset, game: mirror, scoreboard };
    ref.current?.contentWindow?.postMessage(m, location.origin);
  }, [ready, look, offset, mirror, scoreboard]);
  const scale = size.w / W;
  return (
    <div className="absolute inset-0 overflow-hidden bg-black shadow-sm ring-1 ring-black/10" data-testid={testId} data-ready={ready ? 'true' : 'false'}>
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

/** The TV's board grid with tappable tiles (host names: "History for 200"). */
export function HostBoardGrid({ g, onTile }: { g: GameView; onTile: (clueId: string, used: boolean) => void }) {
  const look = useBoardLook();
  const round = g.rounds[g.roundIndex];
  const root = themeRoot(look.theme, look.custom);
  const { prefix, scale } = presentationFor(look.theme, look.custom, true, 0);
  if (!round) return null;
  const cols = round.categories.length;
  const rows = Math.max(0, ...round.categories.map((c) => c.clues.length));
  return (
    <div className="board-theme host-tv absolute inset-0 overflow-hidden shadow-sm" data-theme={root.dataTheme} style={root.style} data-testid="host-board">
      <div className="bt-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `var(--bt-cat-row, 1.3fr) repeat(${rows}, minmax(0, 1fr))` }}>
        {round.categories.map((c) => (
          <div key={c.id} className="bt-cell bt-cat" data-testid="host-category">
            <FitText text={c.name} max={4.4 * scale.category} maxBox={CATEGORY_TEXT_SHARE * scale.category} min={1.2 * scale.category} className="bt-cat-text" />
          </div>
        ))}
        {Array.from({ length: rows }).map((_, r) =>
          round.categories.map((c) => {
            const q = c.clues[r];
            if (!q) return <div key={`${c.id}-${r}`} className="bt-cell bt-used" aria-hidden />;
            return (
              <button
                key={q.id}
                type="button"
                disabled={g.phase !== 'board'}
                onClick={() => onTile(q.id, q.used)}
                className={cx('bt-cell host-tile', q.used ? 'bt-used' : 'bt-tile')}
                aria-label={`${c.name} for ${q.value}${q.used ? ' (played)' : ''}${q.dailyWager ? ' — Daily Double!' : ''}`}
                data-testid="host-tile"
              >
                {!q.used && <span className="bt-value">{tileMoney(prefix, q.value)}</span>}
                {q.dailyWager && !q.used && (
                  <span className="host-dd-mark" title="Daily Double! (only you see this)" aria-hidden>
                    <Dices size={14} />
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
