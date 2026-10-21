// R14-17 / R15-19 / R15-20: Preview Clue — a clue shown privately on the iPad in the TV's clue style
// while the TV still shows something else (the Final's category, the Daily Double! splash). One
// lightbox for both: as tall as the TV picture in the host's frame (its top and bottom on the
// picture's edges), at the TV's 16:9, centred on the picture — so it never covers the header, the
// band or the score cards. Text only: the clue's media plays on the TV with the clue. Nothing is
// sent to the server; nothing changes on the TV.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { useBoardLook } from './TvMirror';
import { FitText, themeRoot } from '../board/common';

/** The TV picture's box in the host's frame (viewport px), followed while it changes. */
function useStageRect() {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="game-stage"]');
    const read = () => {
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null);
    };
    read();
    window.addEventListener('resize', read);
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    if (el) ro?.observe(el);
    return () => {
      window.removeEventListener('resize', read);
      ro?.disconnect();
    };
  }, []);
  return rect;
}

export function CluePreview({ text, label, note, onClose, testId }: { text: string; label: string; note: string; onClose: () => void; testId: string }) {
  const look = useBoardLook();
  const root = themeRoot(look.theme, look.custom);
  const ref = useRef<HTMLButtonElement>(null);
  const stage = useStageRect();
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // The picture's height at 16:9 (narrower than the picture, which is wider than 16:9); without a
  // frame (never expected) the largest 16:9 box in the window.
  const h = stage ? stage.height : Math.min(window.innerHeight * 0.8, (window.innerWidth * 0.9 * 9) / 16);
  const w = stage ? Math.min(stage.width, (h * 16) / 9) : (h * 16) / 9;
  const box: CSSProperties = stage ? { position: 'fixed', top: stage.top, left: stage.left + (stage.width - w) / 2, width: w, height: h } : { position: 'relative', width: w, height: h };
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80" role="dialog" aria-modal="true" aria-label={label} data-testid={testId} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="board-theme host-clue-lightbox" data-theme={root.dataTheme} style={{ ...(root.style as CSSProperties), ...box }} data-testid={`${testId}-box`}>
        <div className="host-clue-lightbox-in">
          {text ? (
            <FitText text={text} max={30} maxBox={0.13} min={1} className="bt-question" boxClassName="min-h-0 w-full flex-1" testId={`${testId}-text`} />
          ) : (
            <p className="bt-question flex flex-1 items-center justify-center text-center text-[clamp(1rem,3vw,2rem)]">This clue is a picture or a sound — it plays on the TV with the clue.</p>
          )}
          <p className="host-clue-lightbox-note">{note}</p>
        </div>
        <button ref={ref} type="button" onClick={onClose} className="host-lightbox-close" aria-label="Close" data-testid={`${testId}-close`}>
          <X size={22} strokeWidth={2.4} aria-hidden />
        </button>
      </div>
    </div>
  );
}
