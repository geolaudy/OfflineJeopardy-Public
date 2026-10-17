// Host control for Final Jeopardy! (R4-2). Players submit their own wagers and answers on their
// phones; the host sees only who has submitted. The reveal goes one contestant at a time, lowest →
// highest score before the Final: contestant → wager → answer → Correct / Incorrect → next.
import { useRef, useState, type PointerEvent } from 'react';
import type { GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { finalEntryReveal } from '../../../shared/game';
import { ActionButton, Avatar, Button, inputCls, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorName, findCompetitor, profileName, useTimer } from '../../lib/view';
import { Trophy, Check, X, ChevronRight, LifeBuoy } from 'lucide-react';
import { AnswerBanner } from './AnswerBanner';

type Run = (a: HostAction) => Promise<{ ok: boolean }>;

const STAGES = ['category', 'wagers', 'clue', 'closed', 'reveal', 'done'] as const;
const STAGE_LABEL: Record<(typeof STAGES)[number], string> = { category: 'Category', wagers: 'Wagers', clue: 'Answers', closed: 'Closed', reveal: 'Reveal', done: 'Done' };

export default function FinalControl({ g, run }: { g: GameView; run: Run }) {
  const f = g.final!;
  const remaining = useTimer(g.timer);
  const missingWagers = f.entries.filter((e) => !e.hasWager).length;
  const missingAnswers = f.entries.filter((e) => !e.submitted).length;
  return (
    <div className="mx-auto max-w-4xl space-y-4" data-testid="final-control">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {STAGES.map((s) => (
            <span key={s} className={cx('rounded-full px-3 py-1', f.stage === s ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500')}>
              {STAGE_LABEL[s]}
            </span>
          ))}
          {g.timer && <span className="ml-auto text-xl font-black tabular-nums" data-testid="final-timer">{Math.ceil((remaining ?? 0) / 1000)}s</span>}
        </div>
        <p className="mt-3 text-sm font-bold tracking-wide text-slate-500 uppercase">Final Jeopardy! · {f.category}</p>
        <p className="text-2xl leading-snug font-semibold">{f.question}</p>
        {f.answer && <AnswerBanner className="mt-3" answer={f.answer} />}
        {f.entries.length === 0 && <p className="mt-2 font-semibold text-amber-700">Nobody has a positive score, so nobody plays Final Jeopardy! — show the winner to end the game.</p>}
      </div>

      {(f.stage === 'category' || f.stage === 'wagers' || f.stage === 'clue' || f.stage === 'closed') && <SubmissionStatus g={g} />}
      {f.stage === 'reveal' && <RevealCard g={g} run={run} />}

      <div className="flex flex-wrap gap-2">
        {/* Nobody qualified: there is nothing to wager or reveal, so go straight to the winner. */}
        {f.entries.length === 0 && f.stage !== 'done' && (
          <ActionButton size="xl" variant="success" className="flex-1" onAction={() => run({ type: 'endGame' })} data-testid="end-game">
            <Trophy size={20} aria-hidden /> Show the winner
          </ActionButton>
        )}
        {f.entries.length > 0 && f.stage === 'category' && (
          <ActionButton size="xl" className="flex-1" onAction={() => run({ type: 'finalNext' })} data-testid="final-next">
            Open wagers on the phones
          </ActionButton>
        )}
        {f.entries.length > 0 && f.stage === 'wagers' && (
          <ActionButton
            size="xl"
            className="flex-1"
            onAction={() => (missingWagers && !confirm(`${missingWagers} wager(s) missing — they will count as 0. Continue?`) ? undefined : run({ type: 'finalNext' }))}
            data-testid="final-next"
          >
            Lock wagers & show the clue
          </ActionButton>
        )}
        {f.entries.length > 0 && f.stage === 'clue' && (
          <ActionButton
            size="xl"
            variant={missingAnswers ? 'secondary' : 'primary'}
            className="flex-1"
            onAction={() => (missingAnswers && !confirm(`${missingAnswers} answer(s) missing. Close the answers now?`) ? undefined : run({ type: 'finalNext' }))}
            data-testid="final-next"
          >
            {g.timer?.running ? 'Close answers early' : 'Close answers'}
          </ActionButton>
        )}
        {f.entries.length > 0 && f.stage === 'closed' && (
          <ActionButton size="xl" className="flex-1" onAction={() => run({ type: 'finalNext' })} data-testid="final-begin-reveal">
            Begin Answer Reveals <ChevronRight size={20} aria-hidden />
          </ActionButton>
        )}
        {f.stage === 'done' && (
          <ActionButton size="xl" variant="success" className="flex-1" onAction={() => run({ type: 'endGame' })} data-testid="end-game">
            <Trophy size={20} aria-hidden /> Show the winner
          </ActionButton>
        )}
      </div>
      {(f.stage === 'wagers' || f.stage === 'clue') && <Recovery g={g} run={run} />}
    </div>
  );
}

/** Who has submitted — never what (R4-2). */
function SubmissionStatus({ g }: { g: GameView }) {
  const f = g.final!;
  const kind = f.stage === 'clue' || f.stage === 'closed' ? 'answer' : 'wager';
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="mb-2 text-sm text-slate-600">
        {f.stage === 'category'
          ? 'Players wager on their own phones (teams: any member) once you open wagering. Wagers stay hidden — from you too — until the reveal.'
          : f.stage === 'wagers'
            ? 'Waiting for wagers. Only whether each player has wagered is shown.'
            : f.stage === 'closed'
              ? 'Answers are closed. Nothing is shown until you begin the reveal (lowest score first).'
              : 'Players are writing their answers. Answers stay hidden until the reveal.'}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {f.entries.map((e) => {
          const c = findCompetitor(g, e.competitorId)!;
          const done = kind === 'wager' ? e.hasWager : e.submitted;
          const online = c.bot || c.memberIds.some((m) => g.online?.includes(m));
          return (
            <li key={e.competitorId} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2" data-testid="final-status">
              <Avatar profile={competitorAvatar(c, g)} size={32} />
              <span className="min-w-0 flex-1 truncate font-semibold">{competitorName(c, g)}</span>
              {!online && <span className="text-xs font-semibold text-amber-700">phone offline</span>}
              <span className={cx('rounded-full px-2.5 py-1 text-sm font-bold', done ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600')}>
                {f.stage === 'category' ? 'Wagering not open' : done ? (kind === 'wager' ? 'Wagered ✓' : 'Answered ✓') : f.stage === 'closed' ? 'No answer' : kind === 'answer' && e.hasAnswer ? 'Changing answer…' : 'Waiting…'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One contestant at a time. Swipe left (or tap Next) to advance; judge once the answer is up. */
function RevealCard({ g, run }: { g: GameView; run: Run }) {
  const f = g.final!;
  const id = f.order[f.cursor];
  const e = f.entries.find((x) => x.competitorId === id);
  const c = findCompetitor(g, id);
  const [who, setWho] = useState<string | null>(null);
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
  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm touch-pan-y" onPointerDown={onDown} onPointerUp={onUp} data-testid="final-reveal">
      <div className="flex items-center justify-between text-sm font-semibold text-slate-500">
        <span>
          Contestant {f.cursor + 1} of {f.order.length} · lowest score first
        </span>
        <span className="hidden sm:inline">Swipe left for next</span>
      </div>
      <div className="flex items-center gap-3">
        <Avatar profile={competitorAvatar(c, g)} size={56} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-2xl font-black" data-testid="final-reveal-name">
            {competitorName(c, g)}
          </div>
          <div className="text-slate-600">
            Before Final Jeopardy!: <b className="tabular-nums">{fmtScore(pre)}</b>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs font-bold tracking-wide text-slate-500 uppercase">Wager</div>
          <div className="text-2xl font-black tabular-nums" data-testid="final-reveal-wager">{shown === 'none' ? '—' : fmtScore(e.wager ?? 0)}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs font-bold tracking-wide text-slate-500 uppercase">Their answer</div>
          <div className="text-2xl font-black break-words" data-testid="final-reveal-answer">{shown === 'answer' ? e.answer?.trim() || 'No answer' : '—'}</div>
        </div>
      </div>
      {shown === 'answer' && !e.judged && (
        <>
          {c.kind === 'team' && (
            <div className="flex flex-wrap gap-1 text-sm">
              <span className="text-slate-500">Credit (optional):</span>
              {c.memberIds.map((m) => (
                <button key={m} onClick={() => setWho(m)} className={cx('min-h-9 rounded-lg border px-2 py-1', who === m ? 'border-blue-700 bg-blue-50' : 'border-slate-200')}>
                  {profileName(g.profiles[m])}
                </button>
              ))}
              <button onClick={() => setWho(null)} className={cx('min-h-9 rounded-lg border px-2 py-1', who === null ? 'border-blue-700 bg-blue-50' : 'border-slate-200')}>
                Team only
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <ActionButton size="xl" variant="success" onAction={() => run({ type: 'judgeFinal', competitorId: c.id, correct: true, profileId: c.kind === 'team' ? who : undefined })} data-testid="final-correct">
              <Check size={20} aria-hidden /> Correct
            </ActionButton>
            <ActionButton size="xl" variant="danger" onAction={() => run({ type: 'judgeFinal', competitorId: c.id, correct: false, profileId: c.kind === 'team' ? who : undefined })} data-testid="final-incorrect">
              <X size={20} aria-hidden /> Incorrect
            </ActionButton>
          </div>
        </>
      )}
      {e.judged && (
        <p className={cx('text-center text-xl font-black', e.correct ? 'text-green-700' : 'text-red-700')} data-testid="final-reveal-result">
          {e.correct ? `Correct: +${fmtScore(e.wager ?? 0)}` : `Incorrect: −${fmtScore(e.wager ?? 0)}`} → {fmtScore(c.score)}
        </p>
      )}
      {canAdvance && (
        <ActionButton size="xl" className="w-full" onAction={advance} data-testid="final-reveal-next">
          {nextLabel} <ChevronRight size={20} aria-hidden />
        </ActionButton>
      )}
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
    <details className="rounded-2xl bg-white p-3 text-sm shadow-sm" open={g.practice} data-testid="final-recovery">
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
