// Live game control for the host (iPad landscape first, portrait supported).
import { useEffect, useState } from 'react';
import type { CompetitorView, GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { ActionButton, Avatar, Button, Field, Modal, inputCls, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorName, findCompetitor, profileName, useTimer, TIMER_LABELS } from '../../lib/view';
import ControllersPanel, { AssignListener } from '../../components/ControllersPanel';
import FinalControl from './FinalControl';

type Run = (a: HostAction) => Promise<{ ok: boolean }>;

export default function Live({ g, run }: { g: GameView; run: Run }) {
  const [adjust, setAdjust] = useState<CompetitorView | null>(null);
  const [devices, setDevices] = useState(false);
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
      <footer className="shrink-0 border-t border-slate-200 bg-white p-2">
        <div className="flex items-stretch gap-2 overflow-x-auto">
          {g.competitors.map((c) => (
            <button
              key={c.id}
              onClick={() => setAdjust(c)}
              className={cx('flex min-w-36 items-center gap-2 rounded-xl border-2 px-3 py-2 text-left', g.controlCompetitorId === c.id ? 'border-blue-600' : 'border-slate-200')}
              aria-label={`Adjust score for ${competitorName(c, g)}`}
              data-testid="host-score"
            >
              <Avatar profile={competitorAvatar(c, g)} size={32} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{competitorName(c, g)}</div>
                <div className={cx('text-lg font-black tabular-nums', c.score < 0 && 'text-red-700')}>{fmtScore(c.score)}</div>
              </div>
            </button>
          ))}
          <div className="flex-1" />
          <ActionButton variant="secondary" size="lg" disabled={!g.undoLabel} onAction={() => run({ type: 'undo' })} className="shrink-0" data-testid="undo">
            ↶ Undo{g.undoLabel ? <span className="text-sm font-normal text-slate-500">({g.undoLabel})</span> : null}
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
                {q.dailyWager && !q.used && <span className="absolute top-0.5 right-1 text-[10px]" title="Daily Wager">🎲</span>}
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
          🎮 Buzzers
        </Button>
        <Button size="lg" variant="secondary" onClick={() => run({ type: 'showJoinQr', show: !g.showJoinQr })}>
          {g.showJoinQr ? 'Hide' : 'Show'} QR on TV
        </Button>
      </div>
    </div>
  );
}

function TimerControls({ g, run }: { g: GameView; run: Run }) {
  const remaining = useTimer(g.timer);
  const t = g.timer;
  const defaults = g.rules.timers;
  const secs = remaining == null ? null : Math.ceil(remaining / 1000);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-100 p-2">
      <span className={cx('min-w-24 text-center text-2xl font-black tabular-nums', t?.expired && 'text-red-700')} role="timer" data-testid="host-timer">
        {t ? (t.expired ? "Time's up" : `${secs}s`) : '—'}
      </span>
      <span className="text-sm text-slate-500">{t ? TIMER_LABELS[t.kind] : 'No timer'}</span>
      <div className="flex-1" />
      {t?.running ? (
        <Button size="sm" variant="secondary" onClick={() => run({ type: 'timerPause' })}>
          ❚❚ Pause
        </Button>
      ) : t && !t.expired && t.remainingMs > 0 ? (
        <Button size="sm" variant="secondary" onClick={() => run({ type: 'timerResume' })}>
          ▶ Resume
        </Button>
      ) : null}
      {t && (
        <Button size="sm" variant="secondary" onClick={() => run({ type: 'timerReset' })}>
          ↺ Reset
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={() => run({ type: 'timerStart', kind: g.buzzer.winner ? 'answer' : 'buzz', seconds: (g.buzzer.winner ? defaults.answerSeconds : defaults.buzzSeconds) || 10 })}>
        ⏱ Start {(g.buzzer.winner ? defaults.answerSeconds : defaults.buzzSeconds) || 10}s
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
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm" data-testid="clue-panel">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-slate-500 uppercase">{clue.categoryName}</span>
        <span className="text-xl font-black text-blue-800">{clue.isDailyWager ? `Daily Wager${clue.wager ? ` · ${clue.wager.amount}` : ''}` : clue.value}</span>
      </div>
      <p className="text-xl leading-snug">{clue.question}</p>
      <div className="rounded-xl border-2 border-green-600 bg-green-50 p-3">
        <div className="text-xs font-bold tracking-wide text-green-800 uppercase">Answer (only you can see this)</div>
        <div className="text-2xl font-black text-green-900" data-testid="host-answer">
          {clue.answer}
        </div>
        {clue.notes && <div className="mt-1 text-sm text-slate-700">📝 {clue.notes}</div>}
      </div>

      {clue.isDailyWager && clue.stage === 'wager' ? (
        <DailyWagerForm g={g} run={run} />
      ) : (
        <>
          {!clue.resolved && !clue.isDailyWager && (
            <div className="grid grid-cols-2 gap-2">
              {g.buzzer.status === 'open' ? (
                <Button size="lg" variant="warning" onClick={() => run({ type: 'lockBuzzers' })}>
                  🔒 Lock buzzers
                </Button>
              ) : (
                <Button size="lg" variant="success" disabled={!!winner} onClick={() => run({ type: 'unlockBuzzers' })} data-testid="unlock">
                  🔓 Unlock buzzers
                </Button>
              )}
              <Button size="lg" variant="secondary" onClick={() => run({ type: 'resetBuzzers' })}>
                ↺ Reset buzzers
              </Button>
            </div>
          )}
          {g.buzzer.status === 'open' && !winner && <p className="rounded-xl bg-green-100 p-2 text-center font-semibold text-green-900">Buzzers are open…</p>}
          {responder && !clue.resolved && (
            <div className="space-y-3 rounded-xl bg-yellow-50 p-3 ring-2 ring-yellow-400">
              <div className="flex items-center gap-3">
                <Avatar profile={winner?.profileId ? g.profiles[winner.profileId] : competitorAvatar(responder, g)} size={44} />
                <div>
                  <div className="text-xl font-black" data-testid="host-winner">
                    {competitorName(responder, g)}
                  </div>
                  <div className="text-sm text-slate-600">
                    {winner?.profileId && responder.kind === 'team' ? `${profileName(g.profiles[winner.profileId])} buzzed` : ''}
                    {winner?.reactionMs != null ? ` · ${(winner.reactionMs / 1000).toFixed(2)}s · ${winner.sourceKind}` : ''}
                  </div>
                </div>
              </div>
              <Attribution g={g} c={responder} value={who} onChange={setWho} />
              <div className="grid grid-cols-2 gap-2">
                <ActionButton size="xl" variant="success" onAction={() => judge('correct')} data-testid="correct">
                  ✓ Correct
                </ActionButton>
                <ActionButton size="xl" variant="danger" onAction={() => judge('incorrect')} data-testid="incorrect">
                  ✗ Incorrect
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
          {!clue.isDailyWager && !clue.resolved && <TimerControls g={g} run={run} />}
        </>
      )}
      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button size="lg" variant="secondary" onClick={() => run({ type: clue.answerRevealed ? 'hideAnswer' : 'revealAnswer' })} data-testid="reveal">
          {clue.answerRevealed ? '🙈 Hide answer on TV' : '👁 Show answer on TV'}
        </Button>
        <ActionButton size="lg" variant={clue.resolved ? 'primary' : 'secondary'} onAction={() => run({ type: 'closeClue' })} data-testid="back-to-board">
          {clue.resolved ? '← Back to board' : 'Skip clue →'}
        </ActionButton>
      </div>
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
      <p className="font-bold">🎲 Daily Wager — the TV is hiding the clue until the wager is locked.</p>
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
