// The correct answer on the host controller (R4-5): a distinct dark-red banner labelled ANSWER,
// smaller than the clue text so the host reads the clue, not the answer. `center` centres the
// answer (live clue view, R5-14); `aside` adds a control on the right (e.g. the answer picture).
// `band` (R7-24, references/host_controller_layout.png): a red striped band across the top of the
// TV preview. It sits inside the themed preview so it uses the TV's fonts and shadow tokens. Host
// only. R10-7 / R10-9: one typography (the label's) for the label, the answer and the notes; the
// clue's category on the left and its value on the right of the label line; the answer uses the
// band's whole width and at most a few lines — longer answers / notes open in a sheet.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Maximize2, NotebookPen } from 'lucide-react';
import { cx, Modal } from '../../components/ui';
import './answer-band.css';

export function AnswerBanner({
  answer,
  label = 'Answer',
  children,
  className,
  center,
  aside,
  band,
  left,
  right,
  notes,
}: {
  answer?: ReactNode;
  label?: string;
  children?: ReactNode;
  className?: string;
  center?: boolean;
  aside?: ReactNode;
  band?: boolean;
  /** Band only: the clue's category (left of the label) and value (right). */
  left?: ReactNode;
  right?: ReactNode;
  /** Band only: host notes, under the answer in the same style. */
  notes?: ReactNode;
}) {
  if (band)
    return (
      <Band answer={answer} label={label} left={left} right={right} notes={notes} aside={aside} className={className}>
        {children}
      </Band>
    );
  return (
    <div className={cx('flex items-stretch overflow-hidden rounded-xl bg-red-900 text-white shadow-sm', className)} data-testid="answer-banner">
      <span className="flex shrink-0 items-center bg-red-950 px-3 text-xs font-black tracking-[0.18em] uppercase" aria-hidden>
        {label}
      </span>
      <div className={cx('min-w-0 flex-1 px-3 py-2', center && 'flex flex-col items-center justify-center text-center')}>
        <span className="sr-only">{label}: </span>
        {answer != null && (
          <div className={cx('leading-snug font-bold break-words', center ? 'text-xl' : 'text-lg')} data-testid="host-answer">
            {answer}
          </div>
        )}
        {notes != null && <div className="text-sm text-red-100">{notes}</div>}
        {children}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2 px-2">{aside}</div>}
    </div>
  );
}

/** True when one of the elements' text is cut off (line clamp): checked after every render and
 *  whenever the band changes size. */
function useClamped(refs: RefObject<HTMLElement | null>[], root: RefObject<HTMLElement | null>) {
  const [clamped, setClamped] = useState(false);
  const check = () => setClamped(refs.some((r) => !!r.current && r.current.scrollHeight > r.current.clientHeight + 1));
  useLayoutEffect(check);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return clamped;
}

/** R13-6: whether the answer needs its two-line (smaller) form — it is tried on one large line
 *  first, again whenever the text or the band's width changes. */
function useTwoLines(text: RefObject<HTMLElement | null>, root: RefObject<HTMLElement | null>) {
  const [two, setTwo] = useState(false);
  const seen = useRef('');
  useLayoutEffect(() => {
    const el = text.current;
    if (!el) return;
    const key = `${el.textContent}|${root.current?.clientWidth ?? 0}`;
    if (key !== seen.current) {
      seen.current = key;
      if (two) return setTwo(false); // measure again on one line
    }
    if (!two && el.scrollWidth > el.clientWidth + 1) setTwo(true);
  });
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === w) return;
      w = el.clientWidth;
      setTwo(false);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [root]);
  return two;
}

/** The theme's font and colour variables at `el` — for the sheet, which is rendered outside the preview. */
function themeVarsOf(el: HTMLElement | null): CSSProperties | undefined {
  if (!el) return undefined;
  const cs = getComputedStyle(el);
  return Object.fromEntries(['--b-font', '--b-cat-fg', '--b-tile-fg', '--b-clue-font'].map((k) => [k, cs.getPropertyValue(k)]).filter(([, v]) => v)) as CSSProperties;
}

function Band({ answer, label, left, right, notes, aside, className, children }: { answer?: ReactNode; label: string; left?: ReactNode; right?: ReactNode; notes?: ReactNode; aside?: ReactNode; className?: string; children?: ReactNode }) {
  const textRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const two = useTwoLines(textRef, rootRef);
  const clamped = useClamped([textRef, notesRef], rootRef);
  return (
    <>
      {/* R12-6: three columns as in the references — the category on the left, the label with the
          answer (and notes) in the middle, the value (and the All / Picture buttons) on the right. */}
      <div ref={rootRef} className={cx('host-answer-band', className)} data-testid="answer-banner" data-variant="band">
        <div className="host-answer-band-left">
          <span className="host-answer-band-cat" data-testid="host-clue-category">
            {left}
          </span>
        </div>
        <div className="host-answer-band-in">
          <p className="host-answer-band-label" aria-hidden>
            {label}
          </p>
          <span className="sr-only">{label}: </span>
          {answer != null && (
            <div ref={textRef} className={cx('host-answer-band-text', two && 'is-two')} data-testid="host-answer" data-lines={two ? 2 : 1}>
              {answer}
            </div>
          )}
          {notes != null && (
            <div ref={notesRef} className="host-answer-band-notes" data-testid="host-notes">
              <NotebookPen size={13} className="mr-1 inline align-[-1px]" aria-hidden />
              {notes}
            </div>
          )}
          {children}
        </div>
        <div className="host-answer-band-right">
          <span className="host-answer-band-value" data-testid="host-clue-value">
            {right}
          </span>
          {(aside || clamped) && (
            <div className="host-answer-band-aside">
              {clamped && (
                <button className="host-answer-band-btn" onClick={() => setOpen(true)} aria-label="Show the whole correct response" data-testid="answer-expand">
                  <Maximize2 size={18} aria-hidden />
                  <span className="hidden sm:inline">All</span>
                </button>
              )}
              {aside}
            </div>
          )}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={label} wide vars={open ? themeVarsOf(rootRef.current) : undefined}>
        <div className="host-answer-band host-answer-full" data-testid="answer-full">
          <div className="host-answer-band-in">
            {left || right ? (
              <p className="host-answer-band-label">
                {left}
                {left && right ? ' · ' : ''}
                {right}
              </p>
            ) : null}
            {answer != null && <div className="host-answer-band-text">{answer}</div>}
            {notes != null && (
              <div className="host-answer-band-notes">
                <NotebookPen size={15} className="mr-1 inline align-[-2px]" aria-hidden />
                {notes}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
