// Live game control for the host (iPad landscape first, portrait supported).
import { useEffect, useState } from 'react';
import type { CompetitorView, GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { ActionButton, Avatar, Button, Field, Lives, Modal, inputCls, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorName, findCompetitor, profileName, useTimerSeconds, TIMER_LABELS } from '../../lib/view';
import ControllersPanel, { AssignListener } from '../../components/ControllersPanel';
import FinalControl from './FinalControl';
import { EarlyBuzzQuick } from './EarlyBuzzRule';
import { HOST_SHORTCUTS, useHostShortcuts } from './shortcuts';
import { MediaControls, MediaThumbs } from './MediaControls';
import { Undo2, Dices, Gamepad2, EyeOff, Eye, NotebookPen, BellRing, Play, ChevronRight, ChevronsRight, Pause, RotateCcw, Timer, Lock, LockOpen, Check, X, ArrowLeft, Ban, Zap } from 'lucide-react';
import { BOT_LEVELS } from '../../../shared/game';

type Run = (a: HostAction) => Promise<{ ok: boolean }>;

export default function Live({ g, run }: { g: GameView; run: Run }) {
  const [adjust, setAdjust] = useState<CompetitorView | null>(null);
  const [devices, setDevices] = useState(false);
  useHostShortcuts(g, run);
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {g.phase === 'final' ? (
          <FinalControl g={g} run={run} />
        ) : (
          <div className="grid h-full gap-3 lg:grid-cols-[1.25fr_1fr]">
            <HostBoard g={g} run={run} />
            {g.phase === 'clue' && g.clue ? <CluePanel g={g} run={run} /> : <BoardTools g={g} run={run} onDevices={() => setDevices(true)} />}
          </div>
        )}
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-stretch gap-2 overflow-x-auto">
          {g.competitors.map((c) => (
            <button
              key={c.id}
              onClick={() => setAdjust(c)}
              className={cx('flex min-w-36 items-center gap-2 rounded-xl border-2 px-3 py-2 text-left', g.controlCompetitorId === c.id ? 'border-blue-600' : 'border-slate-200', c.lives === 0 && 'opacity-50')}
              aria-label={`Adjust score for ${competitorName(c, g)}`}
              data-testid="host-score"
            >
              <Avatar profile={competitorAvatar(c, g)} size={32} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{competitorName(c, g)}</div>
                <div className={cx('text-lg font-black tabular-nums', c.score < 0 && 'text-red-700')}>{fmtScore(c.score)}</div>
                {c.lives !== undefined && (c.lives > 0 ? <Lives lives={c.lives} max={g.rules.survivalLives} size={13} /> : <span className="text-xs font-bold text-slate-500 uppercase">Out</span>)}
              </div>
            </button>
          ))}
          <div className="flex-1" />
          <ActionButton variant="secondary" size="lg" disabled={!g.undoLabel} onAction={() => run({ type: 'undo' })} className="shrink-0" data-testid="undo">
            <Undo2 size={18} aria-hidden /> Undo{g.undoLabel ? <span className="text-sm font-normal text-slate-500">({g.undoLabel})</span> : null}
          </ActionButton>
        </div>
      </footer>
      {adjust && <ScoreAdjust g={g} c={g.competitors.find((x) => x.id === adjust.id) ?? adjust} run={run} onClose={() => setAdjust(null)} />}
      <Modal open={devices} onClose={() => setDevices(false)} title="Buzzers & controllers" wide>
        <ControllersPanel g={g} />
      </Modal>
      <AssignListener g={g} />
    </div>
  );
}

function HostBoard({ g, run }: { g: GameView; run: Run }) {
  const round = g.rounds[g.roundIndex];
  const [preview, setPreview] = useState<string | null>(null);
  if (!round || round.kind !== 'standard') return null;
  const rows = Math.max(...round.categories.map((c) => c.clues.length));
  const active = g.clue?.clueId;
  return (
    <div className="flex min-h-[340px] flex-col rounded-2xl bg-blue-950 p-2">
      <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${round.categories.length}, minmax(0,1fr))`, gridTemplateRows: `auto repeat(${rows}, minmax(48px,1fr))` }}>
        {round.categories.map((c) => (
          <div key={c.id} className="flex items-center justify-center rounded-md bg-blue-800 p-1 text-center text-[11px] leading-tight font-bold text-white uppercase sm:text-xs">
            {c.name}
          </div>
        ))}
        {Array.from({ length: rows }).map((_, r) =>
          round.categories.map((c) => {
            const q = c.clues[r];
            if (!q) return <div key={`${c.id}${r}`} />;
            const isActive = q.id === active;
            return (
              <button
                key={q.id}
                disabled={g.phase !== 'board' && !q.used}
                onClick={() => (q.used ? setPreview(q.id) : run({ type: 'selectClue', clueId: q.id }))}
                className={cx(
                  'relative rounded-md text-lg font-black transition sm:text-xl',
                  isActive ? 'bg-yellow-400 text-black' : q.used ? 'bg-blue-900/60 text-blue-300/40' : 'bg-blue-600 text-yellow-300 active:bg-blue-500',
                )}
                aria-label={`${c.name} for ${q.value}${q.used ? ' (played)' : ''}${q.dailyWager ? ' — Daily Wager' : ''}`}
                data-testid="host-tile"
              >
                {q.value}
                {q.dailyWager && !q.used && <span className="absolute top-0.5 right-1 text-[10px]" title="Daily Wager"><Dices size={12} aria-hidden /></span>}
              </button>
            );
          }),
        )}
      </div>
      {preview && (
        <Modal open onClose={() => setPreview(null)} title="Played clue">
          {(() => {
            const q = round.categories.flatMap((c) => c.clues).find((x) => x.id === preview);
            return (
              <div className="space-y-3">
                <p className="text-lg">{q?.question}</p>
                <p className="font-bold text-green-800">{q?.answer}</p>
                <Button
                  variant="secondary"
                  disabled={g.phase !== 'board'}
                  onClick={async () => {
                    await run({ type: 'restoreClue', clueId: preview });
                    setPreview(null);
                  }}
                >
                  Put back on the board
                </Button>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}

function BoardTools({ g, run, onDevices }: { g: GameView; run: Run; onDevices: () => void }) {
  const standard = g.rounds.map((r, i) => ({ ...r, i })).filter((r) => r.kind === 'standard');
  const hasFinal = g.rounds.some((r) => r.kind === 'final');
  const round = g.rounds[g.roundIndex];
  const remaining = round?.categories.reduce((a, c) => a + c.clues.filter((q) => !q.used).length, 0) ?? 0;
  const next = standard.find((r) => r.i > g.roundIndex);
  return (
    <div className="space-y-3">
      <IntroControls g={g} run={run} />
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-500">{round?.name}</p>
        <p className="text-2xl font-bold">Tap a clue to open it on the TV</p>
        <p className="mt-1 text-slate-600">{remaining} clues left in this round.</p>
        <div className="mt-3">
          <label className="text-sm font-semibold text-slate-600">
            Picks next:{' '}
            <select className="rounded-lg border border-slate-300 px-2 py-1.5" value={g.controlCompetitorId ?? ''} onChange={(e) => run({ type: 'setControl', competitorId: e.target.value })}>
              {g.competitors.map((c) => (
                <option key={c.id} value={c.id}>
                  {competitorName(c, g)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {next && (
          <ActionButton size="lg" variant={remaining === 0 ? 'primary' : 'secondary'} onAction={() => (remaining === 0 || confirm(`Skip to ${next.name}? ${remaining} clues are still unplayed.`)) && run({ type: 'setRound', roundIndex: next.i })}>
            Next: {next.name} →
          </ActionButton>
        )}
        {standard.length > 1 && (
          <select className={inputCls} value={g.roundIndex} onChange={(e) => run({ type: 'setRound', roundIndex: Number(e.target.value) })} aria-label="Jump to round">
            {standard.map((r) => (
              <option key={r.i} value={r.i}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        {hasFinal && (
          <ActionButton size="lg" variant={!next && remaining === 0 ? 'primary' : 'secondary'} onAction={() => (!next && remaining === 0) || confirm('Start the Final Wager round now?') ? run({ type: 'startFinal' }) : undefined}>
            Start Final Wager
          </ActionButton>
        )}
        <Button size="lg" variant="secondary" onClick={onDevices}>
          <Gamepad2 size={18} aria-hidden /> Buzzers
        </Button>
        <Button size="lg" variant="secondary" onClick={() => run({ type: 'showJoinQr', show: !g.showJoinQr })}>
          {g.showJoinQr ? 'Hide' : 'Show'} QR on TV
        </Button>
      </div>
      <details className="hidden rounded-2xl bg-white p-3 text-sm text-slate-600 shadow-sm [@media(pointer:fine)]:block">
        <summary className="cursor-pointer font-semibold">⌨ Keyboard shortcuts</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {HOST_SHORTCUTS.map(([k, d]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 font-mono text-xs">{k}</kbd>
              </dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

/** The private answer. In practice games the host is usually playing too, so it stays hidden until
 *  revealed (one tap to peek). */
function HostAnswer({ g }: { g: GameView }) {
  const clue = g.clue!;
  const [peek, setPeek] = useState(false);
  useEffect(() => setPeek(false), [clue.clueId]);
  const hidden = g.practice && !clue.answerRevealed && !peek;
  return (
    <div className="rounded-xl border-2 border-green-600 bg-green-50 p-3">
      <div className="text-xs font-bold tracking-wide text-green-800 uppercase">{g.practice ? 'Answer' : 'Answer (only you can see this)'}</div>
      {hidden ? (
        <button className="mt-1 min-h-11 rounded-lg bg-white px-3 font-semibold text-green-900 ring-1 ring-green-600" onClick={() => setPeek(true)} data-testid="peek-answer">
          <EyeOff size={16} className="mr-1 inline align-[-3px]" aria-hidden />Hidden while you play — tap to peek
        </button>
      ) : (
        <div className="text-2xl font-black text-green-900" data-testid="host-answer">
          {clue.answer}
        </div>
      )}
      {clue.notes && !hidden && <div className="mt-1 text-sm text-slate-700"><NotebookPen size={14} className="mr-1 inline align-[-2px]" aria-hidden />{clue.notes}</div>}
    </div>
  );
}

/** Buzz on behalf of a player (playing practice on this device, or a player whose buzzer failed). */
function BuzzFor({ g, run }: { g: GameView; run: Run }) {
  const humans = g.competitors.filter((c) => !c.bot && !g.buzzer.attemptedCompetitors.includes(c.id));
  if (!humans.length) return null;
  return (
    <div className={cx('flex flex-wrap gap-2', g.practice && 'rounded-xl bg-red-50 p-2')}>
      {humans.map((c) => (
        <ActionButton key={c.id} size={g.practice ? 'xl' : 'sm'} variant={g.practice ? 'danger' : 'ghost'} className={g.practice ? 'flex-1' : ''} onAction={() => run({ type: 'hostBuzz', competitorId: c.id })} data-testid="buzz-for">
          <BellRing size={18} aria-hidden /> {g.practice ? `Buzz — ${competitorName(c, g)}` : `Buzz for ${competitorName(c, g)}`}
        </ActionButton>
      ))}
    </div>
  );
}

/** Category introduction on the TV: start / next / auto / skip / replay. */
function IntroControls({ g, run }: { g: GameView; run: Run }) {
  const intro = g.intro;
  const round = g.rounds[intro?.roundIndex ?? g.roundIndex];
  if (!round || round.kind !== 'standard') return null;
  if (!intro)
    return (
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => run({ type: 'startIntro' })} data-testid="intro-start">
          <Play size={18} aria-hidden /> Play the round intro on TV
        </Button>
      </div>
    );
  const n = round.categories.length;
  const now = intro.step < 0 ? `${round.name} — title` : `Category ${intro.step + 1} of ${n}: ${round.categories[intro.step]?.name}`;
  const nextLabel = intro.step < 0 ? 'Show first category' : intro.step >= n - 1 ? 'Show the board' : 'Next category';
  return (
    <div className="space-y-3 rounded-2xl bg-blue-950 p-4 text-white shadow-sm" data-testid="intro-controls">
      <div>
        <p className="text-xs font-bold tracking-wide text-blue-200 uppercase">Round intro on TV{intro.auto ? ' · auto' : ''}</p>
        <p className="text-lg font-bold" data-testid="intro-now">
          {now}
        </p>
      </div>
      <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
        <ActionButton size="lg" variant="warning" onAction={() => run({ type: 'introNext' })} data-testid="intro-next">
          {nextLabel} <ChevronRight size={18} aria-hidden />
        </ActionButton>
        {!intro.auto ? (
          <Button size="lg" variant="secondary" onClick={() => run({ type: 'startIntro', auto: true })} title="Play the introduction automatically">
            Auto <ChevronsRight size={18} aria-hidden />
          </Button>
        ) : (
          <span />
        )}
        <Button size="lg" variant="secondary" onClick={() => run({ type: 'introSkip' })} data-testid="intro-skip">
          Skip
        </Button>
      </div>
    </div>
  );
}

function TimerControls({ g, run }: { g: GameView; run: Run }) {
  const secs = useTimerSeconds(g.timer);
  const t = g.timer;
  const defaults = g.rules.timers;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-100 p-2">
      <span className={cx('min-w-24 text-center text-2xl font-black tabular-nums', t?.expired && 'text-red-700')} role="timer" data-testid="host-timer">
        {t ? (t.expired ? "Time's up" : `${secs}s`) : '—'}
      </span>
      <span className="text-sm text-slate-500">{t ? TIMER_LABELS[t.kind] : 'No timer'}</span>
      <div className="flex-1" />
      {t?.running ? (
        <Button size="sm" variant="secondary" onClick={() => run({ type: 'timerPause' })}>
          <Pause size={18} aria-hidden /> Pause
        </Button>
      ) : t && !t.expired && t.remainingMs > 0 ? (
        <Button size="sm" variant="secondary" onClick={() => run({ type: 'timerResume' })}>
          <Play size={18} aria-hidden /> Resume
        </Button>
      ) : null}
      {t && (
        <Button size="sm" variant="secondary" onClick={() => run({ type: 'timerReset' })}>
          <RotateCcw size={18} aria-hidden /> Reset
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={() => run({ type: 'timerStart', kind: g.buzzer.winner ? 'answer' : 'buzz', seconds: (g.buzzer.winner ? defaults.answerSeconds : defaults.buzzSeconds) || 10 })}>
        <Timer size={18} aria-hidden /> Start {(g.buzzer.winner ? defaults.answerSeconds : defaults.buzzSeconds) || 10}s
      </Button>
    </div>
  );
}

/** Choose who answered for team buzzes (required for shared buzzers; optional correction otherwise). */
function Attribution({ g, c, value, onChange }: { g: GameView; c: CompetitorView; value: string | null; onChange: (v: string | null) => void }) {
  if (c.kind !== 'team') return null;
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-slate-600">Who answered for {c.name}?</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Who answered">
        {c.memberIds.map((m) => (
          <button key={m} role="radio" aria-checked={value === m} onClick={() => onChange(m)} className={cx('flex min-h-11 items-center gap-2 rounded-xl border-2 px-3', value === m ? 'border-blue-700 bg-blue-50' : 'border-slate-200 bg-white')}>
            <Avatar profile={g.profiles[m]} size={24} /> {profileName(g.profiles[m])}
          </button>
        ))}
        <button role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={cx('min-h-11 rounded-xl border-2 px-3', value === null ? 'border-blue-700 bg-blue-50' : 'border-slate-200 bg-white')}>
          Team only / unknown
        </button>
      </div>
    </div>
  );
}

function CluePanel({ g, run }: { g: GameView; run: Run }) {
  const clue = g.clue!;
  const winner = g.buzzer.winner;
  const responderId = clue.isDailyWager ? clue.wager?.competitorId : winner?.competitorId;
  const responder = findCompetitor(g, responderId);
  const [who, setWho] = useState<string | null>(null);
  useEffect(() => {
    setWho(clue.isDailyWager ? clue.wager?.profileId ?? null : winner?.profileId ?? null);
  }, [winner?.at, clue.wager?.competitorId, clue.isDailyWager, winner?.profileId, clue.wager?.profileId]);

  const judge = (result: 'correct' | 'incorrect') => run({ type: 'judge', result, ...(responder?.kind === 'team' ? { profileId: who } : {}) });

  return (
    <div className="order-first flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm lg:order-none" data-testid="clue-panel">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-slate-500 uppercase">{clue.categoryName}</span>
        <span className="text-xl font-black text-blue-800">{clue.isDailyWager ? `Daily Wager${clue.wager ? ` · ${clue.wager.amount}` : ''}` : clue.value}</span>
      </div>
      {clue.question?.trim() ? <p className="text-xl leading-snug">{clue.question}</p> : <p className="text-sm text-slate-500 italic">Media-only clue (no text)</p>}
      <MediaThumbs list={clue.media} label="On the TV" />
      <HostAnswer g={g} />
      {!g.practice || clue.answerRevealed ? <MediaThumbs list={clue.answerMedia} label="Answer reveal shows" /> : null}
      <MediaControls g={g} run={run} />

      {clue.isDailyWager && clue.stage === 'wager' ? (
        <DailyWagerForm g={g} run={run} />
      ) : (
        <>
          {!clue.resolved && !clue.isDailyWager && (
            <div className="grid grid-cols-2 gap-2">
              {g.buzzer.status === 'open' ? (
                <Button size="lg" variant="warning" onClick={() => run({ type: 'lockBuzzers' })}>
                  <Lock size={18} aria-hidden /> Lock<span className="hidden sm:inline"> buzzers</span>
                </Button>
              ) : (
                <Button size="lg" variant="success" disabled={!!winner} onClick={() => run({ type: 'unlockBuzzers' })} data-testid="unlock">
                  <LockOpen size={18} aria-hidden /> Unlock<span className="hidden sm:inline"> buzzers</span>
                </Button>
              )}
              <Button size="lg" variant="secondary" onClick={() => run({ type: 'resetBuzzers' })}>
                <RotateCcw size={18} aria-hidden /> Reset<span className="hidden sm:inline"> buzzers</span>
              </Button>
            </div>
          )}
          {g.buzzer.status === 'open' && !winner && <p className="rounded-xl bg-green-100 p-2 text-center font-semibold text-green-900">Buzzers are open…</p>}
          {g.buzzer.status === 'open' && !winner && <BuzzFor g={g} run={run} />}
          {responder && !clue.resolved && (
            <div className="space-y-3 rounded-xl bg-yellow-50 p-3 ring-2 ring-yellow-400">
              <div className="flex items-center gap-3">
                <Avatar profile={winner?.profileId ? g.profiles[winner.profileId] : competitorAvatar(responder, g)} size={44} />
                <div>
                  <div className="text-xl font-black" data-testid="host-winner">
                    {competitorName(responder, g)}
                  </div>
                  <div className="text-sm text-slate-600">
                    {responder.bot ? `Computer · ${BOT_LEVELS[responder.bot].label}` : ''}
                    {winner?.profileId && responder.kind === 'team' ? `${profileName(g.profiles[winner.profileId])} buzzed` : ''}
                    {winner?.reactionMs != null ? ` · ${(winner.reactionMs / 1000).toFixed(2)}s${responder.bot ? '' : ` · ${winner.sourceKind}`}` : ''}
                  </div>
                </div>
              </div>
              {responder.bot && (
                <div className="rounded-xl bg-white p-3 ring-1 ring-yellow-300" data-testid="bot-answer-panel">
                  {clue.submission?.competitorId === responder.id ? (
                    <>
                      <p className="text-xs font-bold tracking-wide text-amber-700 uppercase">Awaiting your judgment</p>
                      <p className="text-2xl font-black break-words" data-testid="bot-answer">
                        “{clue.submission.answer}”
                      </p>
                      {clue.answer && !g.practice && (
                        <p className="mt-1 text-sm text-slate-600">
                          Expected (only you see this): <b data-testid="bot-expected">{clue.answer}</b>
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">The timer is stopped. Nothing is scored until you choose.</p>
                    </>
                  ) : (
                    <p className="font-semibold text-slate-600" data-testid="bot-thinking">
                      {competitorName(responder, g)} is thinking…
                    </p>
                  )}
                </div>
              )}
              <Attribution g={g} c={responder} value={who} onChange={setWho} />
              <div className="grid grid-cols-2 gap-2">
                <ActionButton size="xl" variant="success" onAction={() => judge('correct')} data-testid="correct">
                  <Check size={20} aria-hidden /> Correct
                </ActionButton>
                <ActionButton size="xl" variant="danger" onAction={() => judge('incorrect')} data-testid="incorrect">
                  <X size={20} aria-hidden /> Incorrect
                </ActionButton>
              </div>
            </div>
          )}
          {g.buzzer.queue.length > 0 && !clue.resolved && (
            <p className="text-sm text-slate-600">Also buzzed: {g.buzzer.queue.map((q) => competitorName(findCompetitor(g, q.competitorId), g)).join(', ')}</p>
          )}
          {g.buzzer.attemptedCompetitors.length > 0 && !clue.resolved && (
            <p className="text-sm text-slate-500">Already tried: {g.buzzer.attemptedCompetitors.map((id) => competitorName(findCompetitor(g, id), g)).join(', ')}</p>
          )}
          {!clue.isDailyWager && <EarlyBuzzes g={g} run={run} />}
          {!clue.isDailyWager && !clue.resolved && !clue.answeringEnded && <TimerControls g={g} run={run} />}
        </>
      )}
      <ClueFlow g={g} run={run} />
    </div>
  );
}

/**
 * Guided end of a clue: while answering is open → "End answering" (or skip);
 * once answering is over → "Reveal answer"; once revealed → "Return to board".
 * Skipping stays available as a small secondary action for exceptional cases.
 */
function ClueFlow({ g, run }: { g: GameView; run: Run }) {
  const clue = g.clue!;
  const id = clue.clueId;
  const pendingJudgement = !!g.buzzer.winner && !clue.resolved;
  if (clue.answerRevealed) {
    return (
      <div className="mt-auto grid grid-cols-[1fr_auto] gap-2">
        <ActionButton size="xl" variant="primary" onAction={() => run({ type: 'closeClue', clueId: id })} data-testid="back-to-board">
          <ArrowLeft size={18} aria-hidden /> Return to board
        </ActionButton>
        <Button size="lg" variant="ghost" onClick={() => run({ type: 'hideAnswer' })} data-testid="hide-answer">
          <EyeOff size={18} aria-hidden /> Hide answer
        </Button>
      </div>
    );
  }
  if (clue.answeringEnded || clue.resolved) {
    return (
      <div className="mt-auto space-y-2">
        <p className="text-center text-sm font-semibold text-slate-600" data-testid="answering-ended">
          {clue.resolved ? 'Answer judged.' : g.timer?.expired ? "Time's up — nobody buzzed in." : 'Answering is over.'} Show the answer, then go back to the board.
        </p>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <ActionButton size="xl" variant="primary" onAction={() => run({ type: 'revealAnswer', clueId: id })} data-testid="reveal-answer">
            <Eye size={18} aria-hidden /> Reveal answer
          </ActionButton>
          <ActionButton size="lg" variant="ghost" onAction={() => run({ type: 'closeClue', clueId: id })} data-testid="skip-clue">
            Skip <ChevronRight size={18} aria-hidden />
          </ActionButton>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-auto grid grid-cols-2 gap-2">
      {!clue.isDailyWager ? (
        <ActionButton
          size="lg"
          variant="secondary"
          disabled={pendingJudgement}
          onAction={() => run({ type: 'endAnswering', clueId: id })}
          data-testid="end-answering"
          title={pendingJudgement ? 'Judge the answer first' : 'Nobody knows it — stop buzzing and reveal the answer'}
        >
          <Ban size={18} aria-hidden /> Nobody knows
        </ActionButton>
      ) : (
        <span />
      )}
      <ActionButton
        size="lg"
        variant="ghost"
        onAction={() => (confirm('Skip this clue without showing the answer?') ? run({ type: 'closeClue', clueId: id }) : undefined)}
        data-testid="skip-clue"
      >
        Skip clue <ChevronRight size={18} aria-hidden />
      </ActionButton>
    </div>
  );
}

/** Early buzzes on this clue, with the applied penalty; point penalties can be refunded. */
function EarlyBuzzes({ g, run }: { g: GameView; run: Run }) {
  const early = g.buzzer.early ?? [];
  return (
    <div className="space-y-1.5">
      <EarlyBuzzQuick g={g} run={run} />
      {early.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-amber-50 p-2 text-sm" data-testid="early-list">
          {early.map((e) => {
            const c = findCompetitor(g, e.competitorId);
            const who = e.profileId && c?.kind === 'team' ? `${profileName(g.profiles[e.profileId])} (${c.name})` : competitorName(c, g);
            const ev = e.points ? g.events?.find((x) => x.type === 'buzz' && x.result === 'early' && !x.voided && x.at === e.at && x.competitorId === e.competitorId && x.scoreDelta < 0) : undefined;
            return (
              <li key={`${e.competitorId}${e.profileId}${e.at}`} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  <Zap size={14} className="mr-1 inline align-[-2px] text-amber-600" aria-hidden /><b>{who}</b> buzzed early
                  <span className="text-slate-600">
                    {e.penalty === 'lockout' ? ' · short lockout' : e.penalty === 'clue' ? ' · out for this clue' : e.points ? ` · −${e.points}` : e.penalty === 'points' ? ' · already charged' : ''}
                  </span>
                </span>
                {ev && (
                  <Button size="sm" variant="ghost" onClick={() => run({ type: 'refundPenalty', eventId: ev.id })}>
                    Refund
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DailyWagerForm({ g, run }: { g: GameView; run: Run }) {
  const [cid, setCid] = useState(g.controlCompetitorId ?? g.competitors[0]?.id);
  const c = findCompetitor(g, cid);
  const round = g.rounds[g.roundIndex];
  const roundMax = Math.max(0, ...(round?.categories.flatMap((x) => x.clues.map((q) => q.value)) ?? [0]));
  const max = Math.max(c?.score ?? 0, roundMax);
  const [amount, setAmount] = useState('');
  const n = Number(amount);
  const valid = amount !== '' && Number.isInteger(n) && n >= g.rules.dailyWagerMin && n <= max;
  return (
    <div className="space-y-3 rounded-xl bg-amber-50 p-3 ring-2 ring-amber-400">
      <p className="font-bold"><Dices size={18} className="mr-1 inline align-[-3px]" aria-hidden />Daily Wager — the TV is hiding the clue until the wager is locked.</p>
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
        {[roundMax / 2, roundMax, max].filter((v, i, a) => v >= g.rules.dailyWagerMin && a.indexOf(v) === i).map((v) => (
          <Button key={v} size="sm" variant="secondary" onClick={() => setAmount(String(v))}>
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

function ScoreAdjust({ g, c, run, onClose }: { g: GameView; c: CompetitorView; run: Run; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [who, setWho] = useState<string | null>(null);
  const n = Number(amount);
  const apply = async (sign: 1 | -1) => {
    if (!n) return;
    const r = await run({ type: 'adjustScore', competitorId: c.id, delta: sign * n, note: 'manual', profileId: c.kind === 'team' ? who : undefined });
    if (r.ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Adjust ${competitorName(c, g)}`}>
      <div className="space-y-4">
        <p className="text-3xl font-black tabular-nums">{fmtScore(c.score)}</p>
        <Field label="Amount">
          <input className={inputCls} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} aria-label="Points" autoFocus />
        </Field>
        <div className="flex flex-wrap gap-2">
          {[100, 200, 400, 500, 1000].map((v) => (
            <Button key={v} size="sm" variant="secondary" onClick={() => setAmount(String(v))}>
              {v}
            </Button>
          ))}
        </div>
        {c.kind === 'team' && <Attribution g={g} c={c} value={who} onChange={setWho} />}
        <div className="grid grid-cols-2 gap-2">
          <ActionButton size="lg" variant="success" disabled={!n} onAction={() => apply(1)}>
            + Award
          </ActionButton>
          <ActionButton size="lg" variant="danger" disabled={!n} onAction={() => apply(-1)}>
            − Deduct
          </ActionButton>
        </div>
        {g.phase === 'board' && (
          <Button variant="ghost" className="w-full" onClick={async () => (await run({ type: 'setControl', competitorId: c.id })).ok && onClose()}>
            Give board control to {competitorName(c, g)}
          </Button>
        )}
      </div>
    </Modal>
  );
}
