// The open clue on the host's iPad (R5-14, R7-21/R7-25, R10-6), in the shared game frame:
//  1. the TV itself in the 16:9 preview (the real TV components, so fonts, sizes, shadows and
//     media match exactly), with the private answer band over its top edge (R7-24) — category,
//     value and correct response (R10-7, R10-9) — and, when needed, a compact panel inside it
//     (Daily Double! wager, the computer player's answer, media controls) — the preview never
//     changes size or position,
//  2. the control band where the TV has its score strip: status on the left (timer, or who buzzed
//     in), the next step on the right (Unlock Buzzers → Correct / Incorrect → Reveal Answer →
//     Return to Board). Everything that is needed rarely lives in "More".
// Every control follows the server state (answeringEnded, answerRevealed, resolved, buzzer…).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, BellRing, Check, ChevronRight, Dices, Eye, EyeOff, Flag, Image as ImageIcon, Lock, LockOpen, Pause, Play, RotateCcw, Timer, Video, Wrench, X, Zap } from 'lucide-react';
import type { CompetitorView, GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { BOT_LEVELS } from '../../../shared/game';
import { ActionButton, Avatar, Button, Field, cx, fmtScore, inputCls } from '../../components/ui';
import { cluesLeft, competitorAvatar, competitorName, findCompetitor, nextStage, profileName, useTimer, useTimerSeconds, TIMER_LABELS } from '../../lib/view';
import { EarlyBuzzQuick } from './EarlyBuzzRule';
import { MediaControls } from './MediaControls';
import { AnswerBanner } from './AnswerBanner';
import { FitBox, TvPreview, useBoardLook } from './TvMirror';
import { presentationFor, tileMoney } from '../board/common';
import { GameFrame } from './GameFrame';
import { RichText } from '../../components/RichText';
import { plainText } from '../../../shared/richText';

type Run = (a: HostAction) => Promise<{ ok: boolean }>;

/** Who answers now: the buzz winner, or the Daily Double! player once the wager is locked. */
function useResponder(g: GameView) {
  const clue = g.clue!;
  const winner = g.buzzer.winner;
  const responderId = clue.isDailyWager ? (clue.stage === 'question' ? clue.wager?.competitorId : undefined) : winner?.competitorId;
  return findCompetitor(g, responderId);
}

export function ClueStage({ g, run }: { g: GameView; run: Run }) {
  const clue = g.clue!;
  const responder = useResponder(g);
  const winner = g.buzzer.winner;
  // Who answered for a team (shared buzzers: the host picks; individual: the member who buzzed).
  const [who, setWho] = useState<string | null>(null);
  useEffect(() => {
    setWho(clue.isDailyWager ? (clue.wager?.profileId ?? null) : (winner?.profileId ?? null));
  }, [winner?.at, clue.wager?.competitorId, clue.isDailyWager, winner?.profileId, clue.wager?.profileId]);
  const [lightbox, setLightbox] = useState(false);
  useEffect(() => setLightbox(false), [clue.clueId]);

  const wagerStage = clue.isDailyWager && clue.stage === 'wager';
  const botPanel = responder?.bot && !clue.resolved ? <BotAnswer g={g} c={responder} /> : null;
  const media = !wagerStage && <MediaControls g={g} run={run} />;
  const hasMediaControls = !wagerStage && [...clue.media, ...(clue.answerRevealed ? clue.answerMedia : [])].some((m) => m.kind !== 'image');
  const side: ReactNode = wagerStage ? (
    <>
      <DailyWagerForm g={g} run={run} />
      {/* The TV shows the Daily Double! splash until the wager is locked; the host may read ahead. */}
      {clue.question && (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700" data-testid="host-dd-clue">
          <b>The clue (only you):</b> <RichText text={clue.question} />
        </p>
      )}
    </>
  ) : botPanel || hasMediaControls ? (
    <>
      {botPanel}
      {media}
    </>
  ) : null;
  const look = useBoardLook();

  return (
    <>
      <GameFrame
        timer={g.timer}
        testId="clue-panel"
        boxTestId="clue-preview-box"
        // R11-3.3: the correct-response band is the frame's top strip (above the blue area).
        top={<HostAnswer g={g} prefix={presentationFor(look.theme, look.custom, true, 0).prefix} onPicture={() => setLightbox(true)} />}
        preview={(size) => (
          <div className="absolute inset-0" data-testid="host-clue">
            <TvPreview game={g} scoreboard={false} band title="TV preview" size={size} testId="clue-preview" />
            {/* The preview is hidden from screen readers; the clue text is here for them. */}
            {clue.question && (
              <p className="sr-only" data-testid="host-clue-text">
                {plainText(clue.question)}
              </p>
            )}
          </div>
        )}
        overlay={
          side && (
            <div
              className={cx(
                'scroll-area absolute right-2 bottom-[calc(var(--band)+0.5rem)] z-20 flex max-h-[calc(100%-var(--band)-var(--strip)-1rem)] flex-col gap-2 overflow-y-auto rounded-xl bg-white/95 p-1 shadow-lg ring-1 ring-black/10',
                wagerStage ? 'w-[min(26rem,calc(100%-1rem))]' : 'w-[min(24rem,calc(100%-1rem))]',
              )}
              data-testid="clue-overlay"
            >
              {side}
            </div>
          )
        }
        bar={<ClueFooter g={g} run={run} responder={responder} who={who} setWho={setWho} />}
      />
      {lightbox && <AnswerLightbox g={g} onClose={() => setLightbox(false)} />}
    </>
  );
}

/** The private answer as a red striped band over the top of the TV preview (R4-5, R7-24). In practice
 *  games the host is usually playing too, so it stays hidden until revealed (one tap to peek). */
function HostAnswer({ g, prefix, onPicture }: { g: GameView; prefix: string; onPicture: () => void }) {
  const clue = g.clue!;
  const [peek, setPeek] = useState(false);
  useEffect(() => setPeek(false), [clue.clueId]);
  const hidden = g.practice && !clue.answerRevealed && !peek;
  const pictures = clue.answerMedia.length > 0 && !hidden;
  // R10-9: the category and value (Daily Double!: the wager once locked) on the banner's label line.
  const value = clue.isDailyWager ? (
    <>
      <Dices size={13} className="mr-1 inline align-[-2px]" aria-hidden />
      Daily Double!{clue.wager ? ` ${tileMoney(prefix, clue.wager.amount)}` : ''}
    </>
  ) : (
    tileMoney(prefix, clue.value)
  );
  return (
    <AnswerBanner
      answer={hidden ? undefined : <RichText text={clue.answer} />}
      label="Correct response"
      left={clue.categoryName}
      right={value}
      notes={clue.notes && !hidden ? clue.notes : undefined}
      band
      aside={
        pictures ? (
          <button className="host-answer-band-btn" onClick={onPicture} aria-label="Show the answer picture (only you)" data-testid="answer-image">
            {clue.answerMedia.some((m) => m.kind === 'image') ? <ImageIcon size={18} aria-hidden /> : <Video size={18} aria-hidden />}
            <span className="hidden sm:inline">Picture</span>
          </button>
        ) : undefined
      }
    >
      {hidden && (
        <button className="min-h-11 rounded-lg bg-white/10 px-3 font-semibold text-white ring-1 ring-white/40" onClick={() => setPeek(true)} data-testid="peek-answer">
          <EyeOff size={16} className="mr-1 inline align-[-3px]" aria-hidden />
          Hidden while you play — tap to peek
        </button>
      )}
    </AnswerBanner>
  );
}

/** R10-10: the step after a round's last clue — straight into the next round (its introduction),
 *  the Final, or the results when the board has neither. The clue closes with its real outcome. */
function NextStageButton({ g, run }: { g: GameView; run: Run }) {
  const next = nextStage(g);
  if (next.kind === 'round')
    return (
      <ActionButton size="lg" variant="primary" className="host-btn host-btn-main" onAction={() => run({ type: 'setRound', roundIndex: next.index })} data-testid="clue-next-round">
        Start {next.name} <ChevronRight size={22} aria-hidden />
      </ActionButton>
    );
  if (next.kind === 'final')
    return (
      <ActionButton size="lg" variant="primary" className="host-btn host-btn-main" onAction={() => run({ type: 'startFinal' })} data-testid="clue-start-final">
        <Flag size={22} aria-hidden /> Start Final Jeopardy!
      </ActionButton>
    );
  return (
    <ActionButton size="lg" variant="success" className="host-btn host-btn-main" onAction={() => run({ type: 'endGame' })} data-testid="clue-end-game">
      <Flag size={22} aria-hidden /> End Game &amp; Show Results
    </ActionButton>
  );
}

function ClueFooter({ g, run, responder, who, setWho }: { g: GameView; run: Run; responder: CompetitorView | undefined; who: string | null; setWho: (v: string | null) => void }) {
  const clue = g.clue!;
  const id = clue.clueId;
  const winner = g.buzzer.winner;
  const wagerStage = clue.isDailyWager && clue.stage === 'wager';
  const judging = !!responder && !clue.resolved;
  const pendingJudgement = !!winner && !clue.resolved;
  const over = clue.answeringEnded || clue.resolved;
  const open = g.buzzer.status === 'open' && !winner;
  const canUnlock = !clue.resolved && !clue.isDailyWager && !clue.answerRevealed && !clue.answeringEnded && g.buzzer.status === 'locked' && !winner;
  // Without a running buzz timer nothing ends the clue by itself: Reveal Answer is the next step.
  const untimed = open && !g.timer;
  const humans = g.competitors.filter((c) => !c.bot && !g.buzzer.attemptedCompetitors.includes(c.id));
  const practiceBuzz = g.practice && open && humans.length > 0;
  // R12-8: while the buzz timer runs (buzzers open, nobody buzzed in yet) Reveal Answer takes the
  // Unlock Buzzers button's place — the same reveal as from More (the server ends answering).
  const timedOpen = open && !!g.timer && !practiceBuzz;
  const revealInFooter = !clue.answerRevealed && !wagerStage && !pendingJudgement && (over || untimed || timedOpen);
  const judge = (result: 'correct' | 'incorrect') => run({ type: 'judge', result, ...(responder?.kind === 'team' ? { profileId: who } : {}) });

  let status: ReactNode;
  if (wagerStage) status = <p className="font-semibold text-slate-600">Daily Double! — lock the wager to show the clue on the TV.</p>;
  else if (judging) status = <Answering g={g} c={responder!} who={who} setWho={setWho} />;
  else if (clue.answerRevealed) status = <p className="font-semibold text-slate-600" data-testid="answer-shown">{clue.resolved ? 'Answer judged — it is on the TV.' : 'The answer is on the TV.'}</p>;
  else if (over)
    status = (
      <p className="font-semibold text-slate-700" data-testid="answering-ended">
        {clue.resolved ? 'Answer judged.' : g.timer?.expired ? "Time's up — nobody buzzed in." : 'Nobody left to answer.'}
      </p>
    );
  else if (open) status = <BuzzersOpen g={g} />;
  else
    status = (
      <p className="text-slate-600">
        {clue.unlockMode !== 'host' && g.buzzer.openedAt == null ? 'Buzzers open by themselves for this clue.' : 'Read the clue, then unlock the buzzers.'}
        <TimerChip g={g} />
      </p>
    );

  let primary: ReactNode = null;
  // R10-10: after the round's last clue the next step replaces Return to Board (no empty board).
  if (clue.answerRevealed && cluesLeft(g) === 0) primary = <NextStageButton g={g} run={run} />;
  else if (clue.answerRevealed)
    primary = (
      <ActionButton size="lg" variant="primary" className="host-btn host-btn-main" onAction={() => run({ type: 'closeClue', clueId: id })} data-testid="back-to-board">
        <ArrowLeft size={22} aria-hidden /> Return to Board
      </ActionButton>
    );
  else if (judging)
    primary = (
      <div className="grid grid-cols-2 gap-2">
        <ActionButton size="lg" variant="success" className="host-btn min-h-16 min-w-36 text-xl" onAction={() => judge('correct')} data-testid="correct">
          <Check size={24} aria-hidden /> Correct
        </ActionButton>
        <ActionButton size="lg" variant="danger" className="host-btn min-h-16 min-w-36 text-xl" onAction={() => judge('incorrect')} data-testid="incorrect">
          <X size={24} aria-hidden /> Incorrect
        </ActionButton>
      </div>
    );
  else if (canUnlock)
    primary = (
      <ActionButton size="lg" variant="success" className="host-btn host-btn-main" onAction={() => run({ type: 'unlockBuzzers' })} data-testid="unlock">
        <LockOpen size={22} aria-hidden /> Unlock Buzzers
      </ActionButton>
    );
  else if (revealInFooter)
    primary = (
      <ActionButton size="lg" variant="primary" className="host-btn host-btn-main" onAction={() => run({ type: 'revealAnswer', clueId: id })} data-testid="reveal-answer">
        <Eye size={22} aria-hidden /> Reveal Answer
      </ActionButton>
    );
  else if (practiceBuzz) primary = <BuzzFor g={g} run={run} big />;

  return (
    // Narrow footers (portrait, iPad mini) put the status on its own row above the actions.
    <div className="@container flex items-center" data-testid="clue-footer">
      <div className="flex w-full flex-wrap items-center gap-2 @3xl:flex-nowrap">
      <div className="min-w-0 basis-full px-1 @3xl:flex-1 @3xl:basis-auto">{status}</div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <More g={g} run={run} showReveal={!revealInFooter && !clue.answerRevealed && !wagerStage} pendingJudgement={pendingJudgement} practiceBuzz={practiceBuzz} />
        {primary}
      </div>
      </div>
    </div>
  );
}

/** Who is answering: team (or player) prominent, the member who buzzed secondary. */
function Answering({ g, c, who, setWho }: { g: GameView; c: CompetitorView; who: string | null; setWho: (v: string | null) => void }) {
  const winner = g.buzzer.winner;
  // R5-17.7: the host always sees the real profile name with a lobby nickname — as on the TV
  // (R7-3): no parentheses; under the name for a player, small and gray after a team member.
  const realOf = (pid: string | null | undefined) => {
    const p = pid ? g.profiles[pid] : undefined;
    return p?.nickname?.trim() && p.nickname.trim().toLowerCase() !== p.name.toLowerCase() ? p.name : null;
  };
  const member = c.kind === 'team' ? (who ? profileName(g.profiles[who]) : 'who answered?') : null;
  const memberReal = c.kind === 'team' ? realOf(who) : null;
  const soloReal = c.kind === 'player' ? realOf(c.profileId) : null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar profile={c.kind === 'team' ? competitorAvatar(c, g) : winner?.profileId ? g.profiles[winner.profileId] : competitorAvatar(c, g)} size={36} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="host-band-title truncate text-xl" data-testid="host-winner">
              {competitorName(c, g)}
            </span>
            {member && (
              <span className={cx('truncate text-lg font-semibold', who ? 'text-slate-700' : 'text-slate-400')} data-testid="host-winner-member">
                — {member}
              </span>
            )}
            {memberReal && (
              <span className="shrink-0 truncate text-sm text-slate-500" data-testid="host-winner-member-real">
                {memberReal}
              </span>
            )}
          </div>
          {soloReal && (
            <div className="-mt-0.5 truncate text-sm leading-tight text-slate-500" data-testid="host-winner-real">
              {soloReal}
            </div>
          )}
          <div className="truncate text-sm text-slate-500">
            {c.bot ? `Computer · ${BOT_LEVELS[c.bot].label}` : g.clue?.isDailyWager ? 'Daily Double!' : winner?.profileId && c.kind === 'team' ? `${profileName(g.profiles[winner.profileId])} buzzed` : 'Buzzed in first'}
            {winner?.reactionMs != null ? ` · ${(winner.reactionMs / 1000).toFixed(2)}s${c.bot ? '' : ` · ${winner.sourceKind}`}` : ''}
          </div>
          <BuzzGaps g={g} />
        </div>
        <TimerChip g={g} />
      </div>
      {c.kind === 'team' && <Attribution g={g} c={c} value={who} onChange={setWho} />}
    </div>
  );
}

/** Choose who answered for team buzzes (required for shared buzzers; optional correction otherwise). */
export function Attribution({ g, c, value, onChange, compact = true }: { g: GameView; c: CompetitorView; value: string | null; onChange: (v: string | null) => void; compact?: boolean }) {
  if (c.kind !== 'team') return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={`Who answered for ${c.name}?`}>
      {!compact && <p className="mb-1 w-full text-sm font-semibold text-slate-600">Who answered for {c.name}?</p>}
      {c.memberIds.map((m) => (
        <button key={m} role="radio" aria-checked={value === m} onClick={() => onChange(m)} className={cx('flex min-h-11 items-center gap-2 rounded-xl border-2 px-2.5 text-sm font-semibold', value === m ? 'border-blue-700 bg-blue-50' : 'border-slate-200 bg-white')}>
          <Avatar profile={g.profiles[m]} size={22} /> {profileName(g.profiles[m])}
        </button>
      ))}
      <button role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={cx('min-h-11 rounded-xl border-2 px-2.5 text-sm font-semibold', value === null ? 'border-blue-700 bg-blue-50' : 'border-slate-200 bg-white')}>
        Team only / unknown
      </button>
    </div>
  );
}

/** Buzzers open: a compact progress bar for the buzz timer (or just the status without one). */
function BuzzersOpen({ g }: { g: GameView }) {
  const t = g.timer;
  const ms = useTimer(t);
  const secs = ms != null ? Math.ceil(ms / 1000) : null;
  return (
    <div className="flex min-w-0 items-center gap-3" role="status" data-testid="buzzers-open">
      <span className="relative flex h-3 w-3 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-green-600" />
      </span>
      <span className="shrink-0 text-lg font-bold text-green-900">Buzzers open</span>
      {/* R10-6.5: the seconds only — no timer bar on the iPad (the TV keeps its own). */}
      {t && ms != null && (
        <span className="host-band-title shrink-0 text-lg tabular-nums" role="timer" data-testid="host-timer">
          {t.expired ? "Time's up" : `${secs}s`}
        </span>
      )}
    </div>
  );
}

/** Seconds left on the current timer (answer timer while someone answers). */
function TimerChip({ g }: { g: GameView }) {
  const secs = useTimerSeconds(g.timer);
  const t = g.timer;
  if (!t) return null;
  return (
    <span className={cx('ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-lg font-black tabular-nums', t.expired ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-800')} role="timer" title={TIMER_LABELS[t.kind]} data-testid="host-timer">
      <Timer size={16} aria-hidden /> {t.expired ? "Time's up" : `${secs}s`}
    </span>
  );
}

/** Rarely needed controls (R4-4 / R5-14): reveal early, lock/reset buzzers, timer, early buzzes,
 *  buzz for a player, hide the answer, skip the clue. A popover above the footer. */
function More({ g, run, showReveal, pendingJudgement, practiceBuzz }: { g: GameView; run: Run; showReveal: boolean; pendingJudgement: boolean; practiceBuzz: boolean }) {
  const clue = g.clue!;
  const id = clue.clueId;
  const ref = useRef<HTMLDetailsElement>(null);
  const early = clue.isDailyWager ? [] : (g.buzzer.early ?? []);
  const close = () => ref.current?.removeAttribute('open');
  useEffect(close, [clue.clueId, clue.answerRevealed]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const d = ref.current;
      if (d?.open && !d.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[role="dialog"]')) close();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
  return (
    <details ref={ref} className="relative" data-testid="clue-tools">
      <summary className="host-btn flex min-h-14 cursor-pointer list-none items-center gap-2 bg-white px-4 text-lg text-slate-700 select-none active:bg-slate-100 [&::-webkit-details-marker]:hidden" data-testid="clue-more">
        <Wrench size={18} aria-hidden /> More
        {early.length > 0 && (
          <span className="rounded-full bg-amber-200 px-2 text-sm font-bold text-amber-900" data-testid="early-count">
            {early.length} early
          </span>
        )}
      </summary>
      <div className="host-light scroll-area absolute right-0 bottom-full z-30 mb-2 max-h-[min(70vh,34rem)] w-[min(30rem,calc(100vw-1.5rem))] space-y-3 rounded-2xl bg-white p-3 text-sm shadow-2xl ring-1 ring-slate-200">
        {showReveal && (
          <ActionButton size="lg" variant="secondary" className="w-full" disabled={pendingJudgement} onAction={() => run({ type: 'revealAnswer', clueId: id })} data-testid="reveal-answer" title={pendingJudgement ? 'Judge the answer first' : undefined}>
            <Eye size={20} aria-hidden /> Reveal Answer now
          </ActionButton>
        )}
        {!clue.isDailyWager && !clue.resolved && (
          <div className="flex flex-wrap gap-2">
            {g.buzzer.status === 'open' && (
              <Button variant="secondary" onClick={() => run({ type: 'lockBuzzers' })} data-testid="lock">
                <Lock size={16} aria-hidden /> Lock buzzers
              </Button>
            )}
            <Button variant="secondary" onClick={() => run({ type: 'resetBuzzers' })} data-testid="reset-buzzers">
              <RotateCcw size={16} aria-hidden /> Reset buzzers
            </Button>
          </div>
        )}
        {g.buzzer.status === 'open' && !g.buzzer.winner && !practiceBuzz && <BuzzFor g={g} run={run} />}
        {!clue.resolved && !clue.answeringEnded && <TimerControls g={g} run={run} />}
        {!clue.isDailyWager && (
          <div className="space-y-1.5">
            <EarlyBuzzQuick g={g} run={run} />
            <EarlyBuzzes g={g} run={run} />
          </div>
        )}
        {g.buzzer.queue.length > 0 && !clue.resolved && <p className="text-slate-600">Also buzzed: {g.buzzer.queue.map((q) => competitorName(findCompetitor(g, q.competitorId), g)).join(', ')}</p>}
        {g.buzzer.attemptedCompetitors.length > 0 && !clue.resolved && <p className="text-slate-500">Already tried: {g.buzzer.attemptedCompetitors.map((x) => competitorName(findCompetitor(g, x), g)).join(', ')}</p>}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2">
          {clue.answerRevealed && (
            <Button variant="ghost" onClick={() => run({ type: 'hideAnswer' })} data-testid="hide-answer">
              <EyeOff size={16} aria-hidden /> Hide answer on TV
            </Button>
          )}
          <ActionButton variant="ghost" onAction={() => (confirm('Skip this clue without showing the answer?') ? run({ type: 'closeClue', clueId: id }) : undefined)} data-testid="skip-clue">
            Skip clue <ChevronRight size={16} aria-hidden />
          </ActionButton>
        </div>
      </div>
    </details>
  );
}

function TimerControls({ g, run }: { g: GameView; run: Run }) {
  const t = g.timer;
  const defaults = g.rules.timers;
  const secs = (g.buzzer.winner ? defaults.answerSeconds : defaults.buzzSeconds) || 10;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-100 p-2">
      <span className="text-sm font-semibold text-slate-600">{t ? `${TIMER_LABELS[t.kind]} timer` : 'No timer'}</span>
      <div className="flex-1" />
      {t?.running ? (
        <Button variant="secondary" onClick={() => run({ type: 'timerPause' })}>
          <Pause size={18} aria-hidden /> Pause
        </Button>
      ) : t && !t.expired && t.remainingMs > 0 ? (
        <Button variant="secondary" onClick={() => run({ type: 'timerResume' })}>
          <Play size={18} aria-hidden /> Resume
        </Button>
      ) : null}
      {t && (
        <Button variant="secondary" onClick={() => run({ type: 'timerReset' })}>
          <RotateCcw size={18} aria-hidden /> Reset
        </Button>
      )}
      <Button variant="secondary" onClick={() => run({ type: 'timerStart', kind: g.buzzer.winner ? 'answer' : 'buzz', seconds: secs })}>
        <Timer size={18} aria-hidden /> Start {secs}s
      </Button>
    </div>
  );
}

/** Buzz on behalf of a player (playing practice on this device, or a player whose buzzer failed). */
function BuzzFor({ g, run, big }: { g: GameView; run: Run; big?: boolean }) {
  const humans = g.competitors.filter((c) => !c.bot && !g.buzzer.attemptedCompetitors.includes(c.id));
  if (!humans.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {humans.map((c) => (
        <ActionButton key={c.id} size={big ? 'lg' : 'md'} variant={big ? 'danger' : 'secondary'} onAction={() => run({ type: 'hostBuzz', competitorId: c.id })} data-testid="buzz-for">
          <BellRing size={18} aria-hidden /> {big ? `Buzz — ${competitorName(c, g)}` : `Buzz for ${competitorName(c, g)}`}
        </ActionButton>
      ))}
    </div>
  );
}

/** Early buzzes on this clue, with the applied penalty; point penalties can be refunded. */
function EarlyBuzzes({ g, run }: { g: GameView; run: Run }) {
  const early = g.buzzer.early ?? [];
  if (!early.length) return null;
  return (
    <ul className="space-y-1 rounded-xl bg-amber-50 p-2 text-sm" data-testid="early-list">
      {early.map((e) => {
        const c = findCompetitor(g, e.competitorId);
        const who = e.profileId && c?.kind === 'team' ? `${profileName(g.profiles[e.profileId])} (${c.name})` : competitorName(c, g);
        const ev = e.points ? g.events?.find((x) => x.type === 'buzz' && x.result === 'early' && !x.voided && x.at === e.at && x.competitorId === e.competitorId && x.scoreDelta < 0) : undefined;
        return (
          <li key={`${e.competitorId}${e.profileId}${e.at}`} className="flex min-h-11 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">
              <Zap size={14} className="mr-1 inline align-[-2px] text-amber-600" aria-hidden />
              <b>{who}</b> buzzed early
              <span className="text-slate-600">{e.penalty === 'lockout' ? ' · short lockout' : e.penalty === 'clue' ? ' · out for this clue' : e.points ? ` · −${e.points}` : e.penalty === 'points' ? ' · already charged' : ''}</span>
            </span>
            {ev && (
              <Button size="md" variant="ghost" onClick={() => run({ type: 'refundPenalty', eventId: ev.id })}>
                Refund
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A computer opponent's answer, waiting for the host's judgement. */
function BotAnswer({ g, c }: { g: GameView; c: CompetitorView }) {
  const clue = g.clue!;
  return (
    <div className="rounded-xl bg-yellow-50 p-3 ring-2 ring-yellow-400" data-testid="bot-answer-panel">
      {clue.submission?.competitorId === c.id ? (
        <>
          <p className="text-xs font-bold tracking-wide text-amber-700 uppercase">Awaiting your judgment</p>
          <p className="text-2xl font-black break-words" data-testid="bot-answer">
            “{clue.submission.answer}”
          </p>
          {clue.answer && !g.practice && (
            <p className="mt-1 text-sm text-slate-600">
              Expected (only you see this):{' '}
              <b data-testid="bot-expected">
                <RichText text={clue.answer} />
              </b>
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            The timer is stopped. Nothing is scored until you choose.
            {clue.submission.via === 'ai' && (
              <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-800" data-testid="bot-answer-ai">
                AI answer
              </span>
            )}
          </p>
          {clue.submission.warning && (
            <p className="mt-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900" data-testid="bot-answer-warning">
              {clue.submission.warning}
            </p>
          )}
        </>
      ) : (
        <p className="font-semibold text-slate-600" data-testid="bot-thinking">
          {competitorName(c, g)} is thinking…
        </p>
      )}
    </div>
  );
}

/**
 * The answer as the TV shows it once revealed (answer media + answer text), privately on this
 * iPad. The host UI is dimmed; nothing is sent to the server or the TV.
 */
function AnswerLightbox({ g, onClose }: { g: GameView; onClose: () => void }) {
  const clue = g.clue!;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const view: GameView = {
    ...g,
    phase: 'clue',
    timer: null,
    media: null,
    buzzer: { ...g.buzzer, status: 'locked', winner: null, queue: [], early: [] },
    clue: { ...clue, stage: 'question', answerRevealed: true, answeringEnded: true, submission: null },
  };
  return (
    <div className="fade-in fixed inset-0 z-50 flex flex-col bg-slate-950/85 p-3 pt-[max(var(--safe-top),12px)] pb-[max(env(safe-area-inset-bottom),12px)]" role="dialog" aria-modal="true" aria-label="Answer picture (only you)" data-testid="answer-lightbox" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex shrink-0 items-center gap-3 pb-3 text-white">
        <p className="min-w-0 flex-1 text-sm font-semibold text-slate-200">Only you see this — the TV still shows the clue.</p>
        <button ref={ref} onClick={onClose} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/40 active:bg-white/25" aria-label="Close" data-testid="answer-lightbox-close">
          <X size={28} aria-hidden />
        </button>
      </div>
      <FitBox testId="answer-lightbox-tv">{(size) => <TvPreview game={view} scoreboard={false} title="Answer as the TV shows it" size={size} testId="answer-preview" />}</FitBox>
    </div>
  );
}

export function DailyWagerForm({ g, run }: { g: GameView; run: Run }) {
  // R5-20: the player (team) who picked it enters the wager on their phone; the host locks it.
  const owner = findCompetitor(g, g.clue?.wagerBy ?? undefined);
  const pending = g.clue?.pendingWager ?? null;
  const [manual, setManual] = useState(!owner || !!owner.bot);
  if (owner && !manual) {
    return (
      <div className="space-y-3 rounded-xl bg-amber-50 p-3 ring-2 ring-amber-400" data-testid="host-dd-phone">
        <p className="font-bold">
          <Dices size={18} className="mr-1 inline align-[-3px]" aria-hidden />
          Daily Double! — {competitorName(owner, g)} wagers on their phone.
        </p>
        {pending && pending.amount != null ? (
          <>
            <p className="text-lg">
              <b>{competitorName(owner, g)}</b>
              {owner.kind === 'team' && pending.profileId ? <span className="text-slate-600"> (entered by {profileName(g.profiles[pending.profileId])})</span> : null} wagered{' '}
              <b className="text-2xl tabular-nums" data-testid="host-dd-pending">
                {fmtScore(pending.amount)}
              </b>
            </p>
            <ActionButton size="lg" className="w-full" onAction={() => run({ type: 'setDailyWager', competitorId: owner.id, amount: pending.amount!, profileId: pending.profileId })} data-testid="host-dd-lock">
              Lock wager & show clue
            </ActionButton>
          </>
        ) : (
          <p className="text-slate-700" data-testid="host-dd-waiting">
            Waiting for <b>{competitorName(owner, g)}</b> to enter the wager on their phone…
          </p>
        )}
        <button className="min-h-11 text-sm font-semibold text-blue-700 underline" onClick={() => setManual(true)}>
          No phone? Enter the wager for them
        </button>
      </div>
    );
  }
  return <ManualDailyWager g={g} run={run} />;
}

function ManualDailyWager({ g, run }: { g: GameView; run: Run }) {
  const [cid, setCid] = useState(g.clue?.wagerBy ?? g.controlCompetitorId ?? g.competitors[0]?.id);
  const c = findCompetitor(g, cid);
  const round = g.rounds[g.roundIndex];
  const roundMax = Math.max(0, ...(round?.categories.flatMap((x) => x.clues.map((q) => q.value)) ?? [0]));
  const max = Math.max(c?.score ?? 0, roundMax);
  const [amount, setAmount] = useState('');
  const n = Number(amount);
  const valid = amount !== '' && Number.isInteger(n) && n >= g.rules.dailyWagerMin && n <= max;
  return (
    <div className="space-y-3 rounded-xl bg-amber-50 p-3 ring-2 ring-amber-400">
      <p className="font-bold">
        <Dices size={18} className="mr-1 inline align-[-3px]" aria-hidden />
        Daily Double! — enter the wager.
      </p>
      <Field label="Who is wagering?">
        <select className={inputCls} value={cid ?? ''} onChange={(e) => setCid(e.target.value)}>
          {g.competitors.map((x) => (
            <option key={x.id} value={x.id}>
              {competitorName(x, g)} ({fmtScore(x.score)})
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Wager (${g.rules.dailyWagerMin}–${max.toLocaleString()})`}>
        <input className={inputCls} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} aria-label="Wager amount" />
      </Field>
      <div className="flex flex-wrap gap-2">
        {[roundMax / 2, roundMax, max]
          .filter((v, i, a) => v >= g.rules.dailyWagerMin && a.indexOf(v) === i)
          .map((v) => (
            <Button key={v} variant="secondary" onClick={() => setAmount(String(v))}>
              {v === max && max > roundMax ? `All in (${v})` : v}
            </Button>
          ))}
      </div>
      <ActionButton size="lg" className="w-full" disabled={!valid || !c} onAction={() => run({ type: 'setDailyWager', competitorId: c!.id, amount: n })}>
        Lock wager & show clue
      </ActionButton>
    </div>
  );
}

/** R6-23: who else pressed and how far behind (≈ = within the timing uncertainty). */
function BuzzGaps({ g }: { g: GameView }) {
  const rows = (g.buzzer.timing ?? []).filter((t) => t.result === 'late');
  if (!rows.length) return null;
  return (
    <div className="truncate text-sm text-slate-500" data-testid="host-buzz-gaps">
      Then:{' '}
      {rows
        .slice(0, 4)
        .map((t) => `${t.profileId && findCompetitor(g, t.competitorId)?.kind === 'team' ? profileName(g.profiles[t.profileId]) : competitorName(findCompetitor(g, t.competitorId), g)} ${t.confident ? '+' : '≈+'}${t.gapMs} ms`)
        .join(' · ')}
    </div>
  );
}
