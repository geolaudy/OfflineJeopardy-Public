// Host control for Final Jeopardy! (R4-2). Players submit their own wagers and answers on their
// phones; the host sees only who has submitted. The reveal goes one contestant at a time, lowest →
// highest score before the Final: contestant → wager → answer → Correct / Incorrect → next.
// R7-21 / R9-5: the same frame as the rest of the live game — header line, the TV preview with the
// private correct response across its top, compact overlays (who has submitted, sound controls,
// recovery) and a fixed control bar with the next step.
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { finalEntryReveal, hasPlayable } from '../../../shared/game';
import { plainText } from '../../../shared/richText';
import { ActionButton, Avatar, Button, inputCls, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorName, findCompetitor, profileName, useTimer } from '../../lib/view';
import { Trophy, Check, X, ChevronRight, LifeBuoy, Image as ImageIcon, Music, Timer } from 'lucide-react';
import { AnswerBanner } from './AnswerBanner';
import { RichText } from '../../components/RichText';
import { GameFrame } from './GameFrame';
import { FinalMediaControls, MediaThumbs } from './MediaControls';
import { TvPreview, useBoardLook } from './TvMirror';
import { themeRoot } from '../board/common';

type Run = (a: HostAction) => Promise<{ ok: boolean }>;

const STAGES = ['category', 'wagers', 'clue', 'closed', 'reveal', 'done'] as const;
const STAGE_LABEL: Record<(typeof STAGES)[number], string> = { category: 'Category', wagers: 'Wagers', clue: 'Answers', closed: 'Closed', reveal: 'Reveal', done: 'Done' };

export default function FinalControl({ g, run }: { g: GameView; run: Run }) {
  const f = g.final!;
  const look = useBoardLook();
  const root = themeRoot(look.theme, look.custom);
  const [mediaOpen, setMediaOpen] = useState(false);
  // Who answered for a team (optional credit, statistics only); reset for each contestant.
  const [who, setWho] = useState<string | null>(null);
  const current = f.order[f.cursor];
  useEffect(() => setWho(null), [current, f.stage]);
  const hasAnswer = !!f.answer?.trim() || f.answerMedia.length > 0;
  return (
    <>
      <GameFrame
        testId="final-control"
        boxTestId="final-preview-box"
        head={<FinalHead g={g} />}
        preview={(size) => (
          <div className="absolute inset-0" data-testid="host-final">
            <TvPreview game={g} scoreboard={false} title="TV preview" size={size} testId="final-preview" />
            {/* The preview is hidden from screen readers; the clue text is here for them. */}
            {f.question && (
              <p className="sr-only" data-testid="host-final-text">
                {plainText(f.question)}
              </p>
            )}
            {hasAnswer && (
              <div className="board-theme absolute inset-x-0 top-0 z-10" data-theme={root.dataTheme} style={root.style}>
                <AnswerBanner
                  answer={f.answer?.trim() ? <RichText text={f.answer} /> : undefined}
                  label={f.stage === 'done' ? 'Correct response · on the TV' : 'Correct response · only you'}
                  band
                  aside={
                    f.answerMedia.length > 0 ? (
                      <button
                        className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-sm font-semibold text-white ring-1 ring-white/40 active:bg-white/25"
                        onClick={() => setMediaOpen(true)}
                        aria-label="Show the correct response's picture or sound (only you)"
                        data-testid="final-answer-media"
                      >
                        {f.answerMedia.some((m) => m.kind === 'image') ? <ImageIcon size={18} aria-hidden /> : <Music size={18} aria-hidden />}
                        <span className="hidden sm:inline">{f.answerMedia.some((m) => m.kind === 'image') ? 'Picture' : 'Sound'}</span>
                      </button>
                    ) : undefined
                  }
                />
              </div>
            )}
          </div>
        )}
        overlay={<FinalOverlay g={g} run={run} who={who} setWho={setWho} />}
        bar={<FinalBar g={g} run={run} who={who} />}
      />
      {mediaOpen && <AnswerMediaSheet g={g} onClose={() => setMediaOpen(false)} />}
    </>
  );
}

/** Header line: Final Jeopardy! · category, the stage, the timer. */
function FinalHead({ g }: { g: GameView }) {
  const f = g.final!;
  const remaining = useTimer(g.timer);
  return (
    <>
      <div className="min-w-0 flex-1" data-testid="final-head">
        <p className="truncate text-xs font-bold tracking-wide text-slate-500 uppercase">Final Jeopardy!</p>
        <p className="truncate text-2xl font-black">
          <RichText text={f.category} />
        </p>
      </div>
      <div className="hidden shrink-0 items-center gap-1 text-xs font-semibold @3xl:flex" data-testid="final-stages">
        {STAGES.map((s) => (
          <span key={s} className={cx('rounded-full px-2.5 py-1', f.stage === s ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500')} aria-current={f.stage === s ? 'step' : undefined}>
            {STAGE_LABEL[s]}
          </span>
        ))}
      </div>
      {g.timer && (
        <span className="shrink-0 text-xl font-black tabular-nums" data-testid="final-timer">
          {Math.ceil((remaining ?? 0) / 1000)}s
        </span>
      )}
    </>
  );
}

/** Compact host-only panel over the preview: the clue before it is on the TV, sound controls, who
 *  has submitted, team credit during the reveal and the device-failure recovery. */
function FinalOverlay({ g, run, who, setWho }: { g: GameView; run: Run; who: string | null; setWho: (v: string | null) => void }) {
  const f = g.final!;
  const early = f.stage === 'category' || f.stage === 'wagers';
  const status = f.entries.length > 0 && (early || f.stage === 'clue' || f.stage === 'closed');
  const playable = (f.stage === 'clue' || f.stage === 'closed' ? hasPlayable(f.media) : false) || (f.stage === 'done' && hasPlayable(f.answerMedia));
  const id = f.order[f.cursor];
  const c = findCompetitor(g, id);
  const e = f.entries.find((x) => x.competitorId === id);
  const credit = f.stage === 'reveal' && c?.kind === 'team' && !!e && finalEntryReveal(f, id) === 'answer' && !e.judged;
  const preview = early && (!!f.question?.trim() || f.media.length > 0);
  if (!status && !playable && !credit && !preview) return null;
  return (
    <div
      className="scroll-area absolute right-2 bottom-2 z-20 flex max-h-[calc(100%-5.5rem)] w-[min(24rem,calc(100%-1rem))] flex-col gap-2 overflow-y-auto rounded-xl bg-white/95 p-1 shadow-lg ring-1 ring-black/10"
      data-testid="final-overlay"
    >
      {preview && (
        // The TV shows the category until the clue; the host may read ahead.
        <div className="space-y-2 rounded-xl bg-slate-50 p-2 text-sm text-slate-700" data-testid="final-host-clue">
          {f.question?.trim() && (
            <p>
              <b>The clue (only you):</b> <RichText text={f.question} />
            </p>
          )}
          <MediaThumbs list={f.media} label="Clue media (only you)" />
        </div>
      )}
      {playable && <FinalMediaControls g={g} run={run} />}
      {status && <SubmissionStatus g={g} />}
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
      {(f.stage === 'wagers' || f.stage === 'clue') && <Recovery g={g} run={run} />}
    </div>
  );
}

/** Who has submitted — never what (R4-2). */
function SubmissionStatus({ g }: { g: GameView }) {
  const f = g.final!;
  const kind = f.stage === 'clue' || f.stage === 'closed' ? 'answer' : 'wager';
  return (
    <ul className="grid gap-1.5 rounded-xl bg-slate-50 p-2">
      {f.entries.map((e) => {
        const c = findCompetitor(g, e.competitorId)!;
        const done = kind === 'wager' ? e.hasWager : e.submitted;
        const online = c.bot || c.memberIds.some((m) => g.online?.includes(m));
        return (
          <li key={e.competitorId} className="flex items-center gap-2 rounded-lg bg-white p-1.5" data-testid="final-status">
            <Avatar profile={competitorAvatar(c, g)} size={28} />
            <span className="min-w-0 flex-1 truncate font-semibold">{competitorName(c, g)}</span>
            {!online && <span className="text-xs font-semibold text-amber-700">phone offline</span>}
            <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-sm font-bold', done ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600')}>
              {f.stage === 'category' ? 'Wagering not open' : done ? (kind === 'wager' ? 'Wagered ✓' : 'Answered ✓') : f.stage === 'closed' ? 'No answer' : kind === 'answer' && e.hasAnswer ? 'Changing answer…' : 'Waiting…'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The fixed control bar: what is happening and the next step. */
function FinalBar({ g, run, who }: { g: GameView; run: Run; who: string | null }) {
  const f = g.final!;
  const n = f.entries.length;
  const wagered = f.entries.filter((e) => e.hasWager).length;
  const answered = f.entries.filter((e) => e.submitted).length;
  if (n > 0 && f.stage === 'reveal') return <RevealBar g={g} run={run} who={who} />;

  let status: ReactNode;
  let actions: ReactNode = null;
  if (n === 0) {
    status = <span className="font-semibold text-amber-700">Nobody has a positive score, so nobody plays Final Jeopardy! — show the winner to end the game.</span>;
    // Nobody qualified: there is nothing to wager or reveal, so go straight to the winner.
    if (f.stage !== 'done')
      actions = (
        <ActionButton size="xl" variant="success" onAction={() => run({ type: 'endGame' })} data-testid="end-game">
          <Trophy size={20} aria-hidden /> Show the winner
        </ActionButton>
      );
  } else if (f.stage === 'category') {
    status = 'Players wager on their own phones (teams: any member) once you open wagering. Wagers stay hidden — from you too — until the reveal.';
    actions = (
      <ActionButton size="xl" onAction={() => run({ type: 'finalNext' })} data-testid="final-next">
        Open wagers on the phones
      </ActionButton>
    );
  } else if (f.stage === 'wagers') {
    status = `Waiting for wagers: ${wagered} of ${n} in. Only whether each player has wagered is shown.`;
    actions = (
      <ActionButton
        size="xl"
        onAction={() => (n - wagered && !confirm(`${n - wagered} wager(s) missing — they will count as 0. Continue?`) ? undefined : run({ type: 'finalNext' }))}
        data-testid="final-next"
      >
        Lock wagers & show the clue
      </ActionButton>
    );
  } else if (f.stage === 'clue') {
    status = f.thinking
      ? `Players are writing their answers: ${answered} of ${n} in. Answers stay hidden until the reveal.`
      : "Play the clue's sound or video on the TV — the think time starts when it finishes (or start it now).";
    actions = (
      <>
        {!f.thinking && (
          <ActionButton size="xl" variant="secondary" onAction={() => run({ type: 'finalStartThink' })} data-testid="final-start-think">
            <Timer size={20} aria-hidden /> Start think time
          </ActionButton>
        )}
        <ActionButton
          size="xl"
          variant={n - answered || !f.thinking ? 'secondary' : 'primary'}
          onAction={() => (n - answered && !confirm(`${n - answered} answer(s) missing. Close the answers now?`) ? undefined : run({ type: 'finalNext' }))}
          data-testid="final-next"
        >
          {g.timer?.running ? 'Close answers early' : 'Close answers'}
        </ActionButton>
      </>
    );
  } else if (f.stage === 'closed') {
    status = 'Answers are closed. Nothing is shown until you begin the reveal (lowest score first).';
    actions = (
      <ActionButton size="xl" onAction={() => run({ type: 'finalNext' })} data-testid="final-begin-reveal">
        Begin Answer Reveals <ChevronRight size={20} aria-hidden />
      </ActionButton>
    );
  } else {
    status = 'Every answer is judged. The correct response and the results are on the TV.';
    actions = (
      <ActionButton size="xl" variant="success" onAction={() => run({ type: 'endGame' })} data-testid="end-game">
        <Trophy size={20} aria-hidden /> Show the winner
      </ActionButton>
    );
  }
  return (
    <div className="@container flex h-full items-center rounded-2xl bg-white p-2 shadow-sm" data-testid="final-bar">
      <div className="flex w-full flex-wrap items-center gap-2 @4xl:flex-nowrap">
        <p className="min-w-0 basis-full px-1 text-slate-600 @4xl:flex-1 @4xl:basis-auto">{status}</p>
        <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
      </div>
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
    <div className="@container flex h-full touch-pan-y items-center rounded-2xl bg-white p-2 shadow-sm" onPointerDown={onDown} onPointerUp={onUp} data-testid="final-reveal">
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 @4xl:flex-nowrap">
        <div className="flex min-w-0 basis-full items-center gap-3 @4xl:flex-1 @4xl:basis-auto">
          <Avatar profile={competitorAvatar(c, g)} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-2xl font-black" data-testid="final-reveal-name">
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
              <ActionButton size="xl" variant="success" onAction={() => judge(true)} data-testid="final-correct">
                <Check size={22} aria-hidden /> Correct
              </ActionButton>
              <ActionButton size="xl" variant="danger" onAction={() => judge(false)} data-testid="final-incorrect">
                <X size={22} aria-hidden /> Incorrect
              </ActionButton>
            </>
          )}
          {canAdvance && (
            <ActionButton size="xl" onAction={advance} data-testid="final-reveal-next">
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
      className="fade-in fixed inset-0 z-50 flex flex-col bg-slate-950/90 p-3 pt-[max(env(safe-area-inset-top),12px)] pb-[max(env(safe-area-inset-bottom),12px)] text-white"
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

/** Kept apart from the normal flow: enter for a player whose device failed. Values are not shown afterwards. */
function Recovery({ g, run }: { g: GameView; run: Run }) {
  const f = g.final!;
  const [cid, setCid] = useState((f.entries.find((e) => !findCompetitor(g, e.competitorId)?.bot) ?? f.entries[0])?.competitorId ?? '');
  const [value, setValue] = useState('');
  const c = findCompetitor(g, cid);
  const wagerStage = f.stage === 'wagers';
  if (!f.entries.length) return null;
  // Practice game: the host is the player, so their own wager/answer box is simply open (K27).
  return (
    <details className="rounded-xl bg-slate-50 p-2 text-sm" open={g.practice} data-testid="final-recovery">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-slate-600">
        <LifeBuoy size={18} aria-hidden /> {g.practice ? 'Your wager and answer' : "A player can't use their device?"}
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-slate-600">{g.practice ? 'Enter your own wager, then your answer once the clue is shown.' : 'Ask them privately and enter it for them. It stays hidden until the reveal.'}</p>
        <div className="flex flex-wrap gap-2">
          <select className={cx(inputCls, 'w-auto')} value={cid} onChange={(e) => setCid(e.target.value)} aria-label="Player">
            {f.entries.map((e) => (
              <option key={e.competitorId} value={e.competitorId}>
                {competitorName(findCompetitor(g, e.competitorId), g)}
              </option>
            ))}
          </select>
          <input
            className={cx(inputCls, 'min-w-40 flex-1')}
            type={g.practice ? 'text' : 'password'}
            autoComplete="off"
            inputMode={wagerStage ? 'numeric' : 'text'}
            placeholder={wagerStage ? `Wager 0–${Math.max(0, c?.score ?? 0)}` : 'Their answer'}
            value={value}
            onChange={(e) => setValue(wagerStage ? e.target.value.replace(/\D/g, '') : e.target.value)}
            aria-label={wagerStage ? 'Wager for this player' : 'Answer for this player'}
          />
          <Button
            variant="secondary"
            disabled={!value.trim()}
            onClick={async () => {
              const r = await run(wagerStage ? { type: 'setFinalWager', competitorId: cid, amount: Number(value) } : { type: 'setFinalAnswer', competitorId: cid, answer: value });
              if (r.ok) setValue('');
            }}
          >
            Save {wagerStage ? 'wager' : 'answer'}
          </Button>
        </div>
      </div>
    </details>
  );
}
