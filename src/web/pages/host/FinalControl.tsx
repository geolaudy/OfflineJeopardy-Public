// Host control for Final Jeopardy! (R4-2). Players submit their own wagers and answers on their
// phones; the host sees only who has submitted. The reveal goes one contestant at a time, lowest →
// highest score before the Final: contestant → wager → answer → Correct / Incorrect → next.
// R7-21 / R9-5 / R10-6: the same frame as the rest of the live game — the TV preview with the
// private correct response across its top, compact overlays (sound controls, team credit) and the
// control band with the next step. R14-15 … R14-18: no category / "Final Jeopardy!" texts in the
// header or the band (the TV preview shows both); Preview Clue opens the clue privately; the
// player bubbles on the preview are tappable — the host can enter or change a wager or an answer
// for a player whose device fails (the same actions and checks as the phones).
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { finalEntryReveal, hasPlayable } from '../../../shared/game';
import { plainText } from '../../../shared/richText';
import { ActionButton, Avatar, Button, Modal, inputCls, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorName, findCompetitor, profileName, useTimer } from '../../lib/view';
import { Trophy, Check, X, ChevronRight, Image as ImageIcon, Music, Timer, Eye, EyeOff, Lock } from 'lucide-react';
import { AnswerBanner } from './AnswerBanner';
import { RichText } from '../../components/RichText';
import { FrameParts } from './GameFrame';
import { FinalMediaControls } from './MediaControls';
import { useBoardLook, type PreviewTile } from './TvMirror';
import { FitText, themeRoot } from '../board/common';

type Run = (a: HostAction) => Promise<{ ok: boolean }>;

export default function FinalControl({ g, run, tiles }: { g: GameView; run: Run; tiles: PreviewTile[] }) {
  const f = g.final!;
  const [mediaOpen, setMediaOpen] = useState(false);
  const [entry, setEntry] = useState<string | null>(null);
  // Who answered for a team (optional credit, statistics only); reset for each contestant.
  const [who, setWho] = useState<string | null>(null);
  const current = f.order[f.cursor];
  useEffect(() => setWho(null), [current, f.stage]);
  const hasAnswer = !!f.answer?.trim() || f.answerMedia.length > 0;
  return (
    <>
      <FrameParts
        // R11-3.3: the correct-response band is the frame's header (R14-16: without the category
        // and "Final Jeopardy!" — the preview shows both).
        head={
          hasAnswer ? (
            <AnswerBanner
              answer={f.answer?.trim() ? <RichText text={f.answer} /> : undefined}
              label="Correct response"
              band
              aside={
                f.answerMedia.length > 0 ? (
                  <button className="host-answer-band-btn" onClick={() => setMediaOpen(true)} aria-label="Show the correct response's picture or sound (only you)" data-testid="final-answer-media">
                    {f.answerMedia.some((m) => m.kind === 'image') ? <ImageIcon size={18} aria-hidden /> : <Music size={18} aria-hidden />}
                    <span className="hidden sm:inline">{f.answerMedia.some((m) => m.kind === 'image') ? 'Picture' : 'Sound'}</span>
                  </button>
                ) : undefined
              }
            />
          ) : null
        }
        stage={(size) => (
          <>
            <div className="pointer-events-none absolute inset-0" data-testid="host-final">
              {/* The preview is hidden from screen readers; the clue text is here for them. */}
              {f.question && (
                <p className="sr-only" data-testid="host-final-text">
                  {plainText(f.question)}
                </p>
              )}
            </div>
            <HostFinalHits g={g} tiles={tiles} scale={size.w / 1280} onEntry={setEntry} />
          </>
        )}
        overlay={<FinalOverlay g={g} run={run} who={who} setWho={setWho} />}
        bar={<FinalBar g={g} run={run} who={who} />}
      />
      {mediaOpen && <AnswerMediaSheet g={g} onClose={() => setMediaOpen(false)} />}
      {entry && <EntrySheet g={g} run={run} competitorId={entry} onClose={() => setEntry(null)} />}
    </>
  );
}

/**
 * R14-18: the TV's player bubbles in the preview (green outline = wagered / answered, gray = not
 * yet), made tappable — the preview reports where they are, as it does for the board's tiles. A tap
 * opens that player's wager / answer sheet. Each button names the player's state (never the wager
 * or the answer itself).
 */
function HostFinalHits({ g, tiles, scale, onEntry }: { g: GameView; tiles: PreviewTile[]; scale: number; onEntry: (competitorId: string) => void }) {
  const f = g.final!;
  const kind = f.stage === 'wagers' ? 'wager' : 'answer';
  return (
    <div className="absolute inset-0" data-testid="host-final-bubbles">
      {tiles.map((t) => {
        const e = t.kind === 'final' ? f.entries.find((x) => x.competitorId === t.id) : undefined;
        const c = e && findCompetitor(g, e.competitorId);
        if (!e || !c) return null;
        const done = kind === 'wager' ? e.hasWager : e.submitted;
        const online = c.bot || c.memberIds.some((m) => g.online?.includes(m));
        const state = done ? (kind === 'wager' ? 'Wagered ✓' : 'Answered ✓') : f.stage === 'closed' ? 'No answer' : kind === 'answer' && e.hasAnswer ? 'Changing answer…' : 'Waiting…';
        // A comfortable touch target: at least 44 px tall around the bubble.
        const pad = Math.max(0, (44 - t.h * scale) / 2);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onEntry(e.competitorId)}
            className="host-hit host-final-hit"
            style={{ left: t.x * scale - 4, top: t.y * scale - pad, width: t.w * scale + 8, height: t.h * scale + 2 * pad }}
            aria-label={`${competitorName(c, g)}: ${state}${online ? '' : ' (phone offline)'} — enter or change for them`}
            data-testid="final-status"
            data-done={done ? 'true' : 'false'}
          >
            <span className="sr-only">
              {competitorName(c, g)} {state}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Compact host-only panel over the preview: sound controls and team credit during the reveal. */
function FinalOverlay({ g, run, who, setWho }: { g: GameView; run: Run; who: string | null; setWho: (v: string | null) => void }) {
  const f = g.final!;
  const playable = (f.stage === 'clue' || f.stage === 'closed' ? hasPlayable(f.media) : false) || (f.stage === 'done' && hasPlayable(f.answerMedia));
  const id = f.order[f.cursor];
  const c = findCompetitor(g, id);
  const e = f.entries.find((x) => x.competitorId === id);
  const credit = f.stage === 'reveal' && c?.kind === 'team' && !!e && finalEntryReveal(f, id) === 'answer' && !e.judged;
  if (!playable && !credit) return null;
  return (
    <div
      className="scroll-area absolute right-2 bottom-[calc(var(--below)+0.5rem)] z-20 flex max-h-[calc(100%-var(--below)-1rem)] w-[min(24rem,calc(100%-1rem))] flex-col gap-2 overflow-y-auto rounded-xl bg-white/95 p-1 shadow-lg ring-1 ring-black/10"
      data-testid="final-overlay"
    >
      {playable && <FinalMediaControls g={g} run={run} />}
      {credit && c && (
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-50 p-2 text-sm" data-testid="final-credit">
          <span className="w-full text-slate-500">Who answered? (optional, statistics only)</span>
          {c.memberIds.map((m) => (
            <button key={m} onClick={() => setWho(m)} className={cx('min-h-11 rounded-lg border px-2 py-1', who === m ? 'border-blue-700 bg-blue-50' : 'border-slate-200 bg-white')}>
              {profileName(g.profiles[m])}
            </button>
          ))}
          <button onClick={() => setWho(null)} className={cx('min-h-11 rounded-lg border px-2 py-1', who === null ? 'border-blue-700 bg-blue-50' : 'border-slate-200 bg-white')}>
            Team only
          </button>
        </div>
      )}
    </div>
  );
}

/** R14-17: Preview Clue — the Final's clue privately on the iPad, in the TV's clue style (text only;
 *  the clue's media plays on the TV with the clue). Nothing changes on the TV. */
function CluePreview({ g, onClose }: { g: GameView; onClose: () => void }) {
  const f = g.final!;
  const look = useBoardLook();
  const root = themeRoot(look.theme, look.custom);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const text = f.question?.trim() ?? '';
  const width = 'w-[min(100%,calc((100dvh-9rem)*16/9))]';
  return (
    <div
      className="fade-in fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-slate-950/85 p-3 pt-[max(var(--safe-top),12px)] pb-[max(env(safe-area-inset-bottom),12px)]"
      role="dialog"
      aria-modal="true"
      aria-label="Final Jeopardy! clue (only you)"
      data-testid="final-clue-preview"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={cx('flex items-center gap-3 text-white', width)}>
        <p className="min-w-0 flex-1 text-sm font-semibold text-slate-200">Only you see this — the TV still shows the category.</p>
        <button ref={ref} onClick={onClose} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/40 active:bg-white/25" aria-label="Close" data-testid="final-clue-preview-close">
          <X size={26} aria-hidden />
        </button>
      </div>
      <div className={cx('board-theme host-clue-lightbox flex aspect-video flex-col', width)} data-theme={root.dataTheme} style={root.style as CSSProperties}>
        {text ? (
          <FitText text={text} max={30} maxBox={0.13} min={1} className="bt-question" boxClassName="min-h-0 w-full flex-1" testId="final-clue-preview-text" />
        ) : (
          <p className="bt-question flex flex-1 items-center justify-center text-[clamp(1rem,3vw,2rem)]">This clue is a picture or a sound — it plays on the TV with the clue.</p>
        )}
      </div>
    </div>
  );
}

/**
 * R14-18: one player's Final entry, entered by the host for a player whose device fails — the same
 * actions (and limits) as the player's phone: the wager while wagering is open, the answer while
 * answers are open. What is already entered stays hidden (from the host too) until the reveal; a
 * new entry replaces it. What the host types is hidden on screen unless they show it.
 */
function EntrySheet({ g, run, competitorId, onClose }: { g: GameView; run: Run; competitorId: string; onClose: () => void }) {
  const f = g.final!;
  const c = findCompetitor(g, competitorId);
  const e = f.entries.find((x) => x.competitorId === competitorId);
  const [value, setValue] = useState('');
  // Practice games: the host is the player, so nothing needs hiding.
  const [show, setShow] = useState(!!g.practice);
  if (!c || !e) return null;
  const wager = f.stage === 'wagers';
  const answer = f.stage === 'clue';
  const max = Math.max(0, c.score);
  const save = async () => {
    const r = await run(wager ? { type: 'setFinalWager', competitorId, amount: Number(value) } : { type: 'setFinalAnswer', competitorId, answer: value });
    if (r.ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={competitorName(c, g)}>
      <div className="space-y-3" data-testid="final-entry-sheet">
        <div className="flex items-center gap-3">
          <Avatar profile={competitorAvatar(c, g)} size={44} />
          <ul className="min-w-0 flex-1 text-sm">
            <li>
              Wager: <b data-testid="final-entry-wager-state">{e.hasWager ? 'entered ✓' : f.stage === 'category' ? 'wagering not open yet' : 'not yet'}</b>
            </li>
            {!wager && f.stage !== 'category' && (
              <li>
                Answer: <b data-testid="final-entry-answer-state">{e.submitted ? 'submitted ✓' : e.hasAnswer ? 'being changed…' : 'not yet'}</b>
              </li>
            )}
          </ul>
        </div>
        {wager || answer ? (
          <form
            className="space-y-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (value.trim()) void save();
            }}
          >
            <label className="block text-sm font-semibold text-slate-700">
              {wager ? `${e.hasWager ? 'Change' : 'Enter'} their wager (0 – ${fmtScore(max)})` : `${e.submitted ? 'Change' : 'Enter'} their answer`}
              <span className="mt-1 flex gap-2">
                <input
                  className={cx(inputCls, 'min-w-0 flex-1')}
                  type={show ? 'text' : 'password'}
                  autoComplete="off"
                  inputMode={wager ? 'numeric' : 'text'}
                  value={value}
                  onChange={(ev) => setValue(wager ? ev.target.value.replace(/\D/g, '') : ev.target.value)}
                  aria-label={wager ? 'Wager for this player' : 'Answer for this player'}
                  autoFocus
                />
                <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide what I type' : 'Show what I type'} aria-pressed={show}>
                  {show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
                </button>
              </span>
            </label>
            <p className="flex items-start gap-1.5 text-sm text-slate-600">
              <Lock size={15} className="mt-0.5 shrink-0" aria-hidden />
              Private: not shown on the TV or the phones until the reveal{e.hasWager && wager ? ' — it replaces the wager they entered' : e.submitted && answer ? ' — it replaces the answer they submitted' : ''}.
            </p>
            <Button type="submit" size="lg" className="w-full" disabled={!value.trim()} data-testid="final-entry-save">
              Save {wager ? 'wager' : 'answer'}
            </Button>
          </form>
        ) : (
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{f.stage === 'category' ? 'Wagers can be entered once you open wagering.' : 'Answers are closed — nothing can be changed now.'}</p>
        )}
      </div>
    </Modal>
  );
}

/** The fixed control bar: what is happening and the next step. */
function FinalBar({ g, run, who }: { g: GameView; run: Run; who: string | null }) {
  const f = g.final!;
  const [cluePreview, setCluePreview] = useState(false);
  const remaining = useTimer(g.timer);
  const n = f.entries.length;
  const wagered = f.entries.filter((e) => e.hasWager).length;
  const answered = f.entries.filter((e) => e.submitted).length;
  if (n > 0 && f.stage === 'reveal') return <RevealBar g={g} run={run} who={who} />;

  let status: ReactNode;
  let actions: ReactNode = null;
  if (n === 0) {
    status = <span className="font-semibold text-amber-300">Nobody has a positive score, so nobody plays Final Jeopardy! — show the winner to end the game.</span>;
    // Nobody qualified: there is nothing to wager or reveal, so go straight to the winner.
    if (f.stage !== 'done')
      actions = (
        <ActionButton size="lg" variant="success" className="host-btn host-btn-main" onAction={() => run({ type: 'endGame' })} data-testid="end-game">
          <Trophy size={20} aria-hidden /> Show the winner
        </ActionButton>
      );
  } else if (f.stage === 'category') {
    status = 'Players wager on their own phones (teams: any member) once you open wagering. Wagers stay hidden — from you too — until the reveal.';
    actions = (
      <ActionButton size="lg" className="host-btn host-btn-main" onAction={() => run({ type: 'finalNext' })} data-testid="final-next">
        Open Wagers
      </ActionButton>
    );
  } else if (f.stage === 'wagers') {
    status = g.practice ? `Tap your name on the preview to enter your wager: ${wagered} of ${n} in.` : `Waiting for wagers: ${wagered} of ${n} in. Tap a name on the preview to enter one for a player.`;
    actions = (
      <ActionButton
        size="lg"
        className="host-btn host-btn-main"
        onAction={() => (n - wagered && !confirm(`${n - wagered} wager(s) missing — they will count as 0. Continue?`) ? undefined : run({ type: 'finalNext' }))}
        data-testid="final-next"
      >
        Lock Wagers
      </ActionButton>
    );
  } else if (f.stage === 'clue') {
    // R11-9: in "host closes" mode the time running out leaves answering open until the host closes it.
    const timeUp = g.timer?.kind === 'final' && g.timer.expired;
    status = !f.thinking
      ? "Play the clue's sound or video on the TV — the think time starts when it finishes (or start it now)."
      : timeUp
        ? `Time's up — answering stays open until you close it: ${answered} of ${n} in.`
        : `Players are writing their answers: ${answered} of ${n} in. Answers stay hidden until the reveal.`;
    actions = (
      <>
        {!f.thinking && (
          <ActionButton size="lg" variant="secondary" className="host-btn" onAction={() => run({ type: 'finalStartThink' })} data-testid="final-start-think">
            <Timer size={20} aria-hidden /> Start think time
          </ActionButton>
        )}
        <ActionButton
          size="lg"
          variant={(n - answered || !f.thinking) && !timeUp ? 'secondary' : 'primary'}
          className="host-btn host-btn-main"
          onAction={() => (n - answered && !confirm(`${n - answered} answer(s) missing. Close answer submissions now?`) ? undefined : run({ type: 'finalNext' }))}
          data-testid="final-next"
        >
          {g.timer?.running ? 'Close Answers Early' : 'Close Answer Submissions'}
        </ActionButton>
      </>
    );
  } else if (f.stage === 'closed') {
    status = 'Answers are closed. Nothing is shown until you begin the reveal (lowest score first).';
    actions = (
      <ActionButton size="lg" className="host-btn host-btn-main" onAction={() => run({ type: 'finalNext' })} data-testid="final-begin-reveal">
        Begin Answer Reveals <ChevronRight size={20} aria-hidden />
      </ActionButton>
    );
  } else {
    status = 'Every answer is judged. The correct response and the results are on the TV.';
    actions = (
      <ActionButton size="lg" variant="success" className="host-btn host-btn-main" onAction={() => run({ type: 'endGame' })} data-testid="end-game">
        <Trophy size={20} aria-hidden /> Show the winner
      </ActionButton>
    );
  }
  // R14-17: Preview Clue, just left of Open / Lock Wagers, while the TV shows only the category.
  const canPreview = n > 0 && (f.stage === 'category' || f.stage === 'wagers') && (!!f.question?.trim() || f.media.length > 0);
  return (
    <div className="@container flex items-center" data-testid="final-bar">
      {/* R14-15: one line, like every other stage (no "Final Jeopardy! · category" line above it). */}
      <div className="flex w-full items-center gap-2">
        <p className="host-band-status line-clamp-2 min-w-0 flex-1 px-1 text-[1.05rem]!">
          {g.timer && (
            <span className="host-band-title mr-2 inline-block rounded-md bg-white/10 px-2 tabular-nums" data-testid="final-timer">
              {g.timer.expired ? "Time's up" : `${Math.ceil((remaining ?? 0) / 1000)}s`}
            </span>
          )}
          {status}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {canPreview && (
            <Button size="lg" variant="secondary" className="host-btn" onClick={() => setCluePreview(true)} data-testid="final-preview-clue">
              <Eye size={20} aria-hidden /> Preview Clue
            </Button>
          )}
          {actions}
        </div>
      </div>
      {cluePreview && <CluePreview g={g} onClose={() => setCluePreview(false)} />}
    </div>
  );
}

/** One contestant at a time. Swipe left (or tap Next) to advance; judge once the answer is up. */
function RevealBar({ g, run, who }: { g: GameView; run: Run; who: string | null }) {
  const f = g.final!;
  const id = f.order[f.cursor];
  const e = f.entries.find((x) => x.competitorId === id);
  const c = findCompetitor(g, id);
  const start = useRef<number | null>(null);
  if (!e || !c) return null;
  const shown = finalEntryReveal(f, id);
  const last = f.cursor >= f.order.length - 1;
  const canAdvance = f.step !== 'answer' || e.judged;
  const nextLabel = f.step === 'contestant' ? 'Reveal wager' : f.step === 'wager' ? 'Reveal answer' : last ? 'Finish the reveal' : 'Next contestant';
  const advance = () => run({ type: 'finalReveal' });
  const onDown = (ev: PointerEvent) => (start.current = ev.clientX);
  const onUp = (ev: PointerEvent) => {
    if (start.current != null && canAdvance && start.current - ev.clientX > 70) void advance();
    start.current = null;
  };
  const pre = f.preScores[id] ?? 0;
  const judge = (correct: boolean) => run({ type: 'judgeFinal', competitorId: c.id, correct, profileId: c.kind === 'team' ? who : undefined });
  return (
    <div className="@container flex touch-pan-y items-center" onPointerDown={onDown} onPointerUp={onUp} data-testid="final-reveal">
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 @3xl:flex-nowrap">
        <div className="flex min-w-0 basis-full items-center gap-3 @3xl:flex-1 @3xl:basis-auto">
          <Avatar profile={competitorAvatar(c, g)} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="host-band-title truncate text-xl" data-testid="final-reveal-name">
                {competitorName(c, g)}
              </span>
              <span className="shrink-0 text-sm text-slate-500">
                {f.cursor + 1} of {f.order.length} · before: <b className="tabular-nums">{fmtScore(pre)}</b>
              </span>
            </div>
            <div className="flex min-w-0 items-baseline gap-3 text-slate-600">
              <span className="shrink-0">
                Wager{' '}
                <b className="text-lg text-slate-900 tabular-nums" data-testid="final-reveal-wager">
                  {shown === 'none' ? '—' : fmtScore(e.wager ?? 0)}
                </b>
              </span>
              <span className="min-w-0 truncate">
                Their answer{' '}
                <b className="text-lg text-slate-900" data-testid="final-reveal-answer">
                  {shown === 'answer' ? e.answer?.trim() || 'No answer' : '—'}
                </b>
              </span>
            </div>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {e.judged && (
            <p className={cx('text-lg font-black', e.correct ? 'text-green-700' : 'text-red-700')} data-testid="final-reveal-result">
              {e.correct ? `Correct: +${fmtScore(e.wager ?? 0)}` : `Incorrect: −${fmtScore(e.wager ?? 0)}`} → {fmtScore(c.score)}
            </p>
          )}
          {shown === 'answer' && !e.judged && (
            <>
              <ActionButton size="lg" variant="success" className="host-btn" onAction={() => judge(true)} data-testid="final-correct">
                <Check size={22} aria-hidden /> Correct
              </ActionButton>
              <ActionButton size="lg" variant="danger" className="host-btn" onAction={() => judge(false)} data-testid="final-incorrect">
                <X size={22} aria-hidden /> Incorrect
              </ActionButton>
            </>
          )}
          {canAdvance && (
            <ActionButton size="lg" className="host-btn host-btn-main" onAction={advance} data-testid="final-reveal-next">
              {nextLabel} <ChevronRight size={20} aria-hidden />
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}

/** The correct response's pictures and sounds, privately on the iPad (sound plays here, never on
 *  the TV): the host can check them before the reveal without showing anything. */
function AnswerMediaSheet({ g, onClose }: { g: GameView; onClose: () => void }) {
  const f = g.final!;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fade-in fixed inset-0 z-50 flex flex-col bg-slate-950/90 p-3 pt-[max(var(--safe-top),12px)] pb-[max(env(safe-area-inset-bottom),12px)] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Correct response media (only you)"
      data-testid="final-answer-sheet"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex shrink-0 items-center gap-3 pb-3">
        <p className="min-w-0 flex-1 text-sm font-semibold text-slate-200">
          {f.stage === 'done' ? 'The correct response is on the TV — play its sound from the controls.' : 'Only you see and hear this — nothing changes on the TV.'}
        </p>
        <button ref={ref} onClick={onClose} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/40 active:bg-white/25" aria-label="Close" data-testid="final-answer-sheet-close">
          <X size={28} aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto">
        {f.answer?.trim() && (
          <p className="text-center text-2xl font-bold">
            <RichText text={f.answer} />
          </p>
        )}
        {f.answerMedia.map((m, i) =>
          m.kind === 'image' ? (
            <figure key={i} className="flex min-h-0 flex-col items-center">
              <img src={m.url} alt={m.caption ?? ''} className="max-h-[65vh] max-w-full rounded-xl object-contain" />
              {m.caption && <figcaption className="mt-1 text-sm text-slate-300">{m.caption}</figcaption>}
            </figure>
          ) : (
            <figure key={i} className="flex w-full max-w-lg flex-col items-center gap-1">
              {m.kind === 'video' ? <video src={m.url} controls playsInline className="max-h-[60vh] max-w-full rounded-xl" /> : <audio src={m.url} controls preload="metadata" className="w-full" data-testid="final-answer-preview-audio" />}
              {m.caption && <figcaption className="text-sm text-slate-300">{m.caption}</figcaption>}
            </figure>
          ),
        )}
      </div>
    </div>
  );
}
