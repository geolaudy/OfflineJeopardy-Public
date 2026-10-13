import { useState } from 'react';
import type { GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { ActionButton, Avatar, Button, inputCls, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorName, findCompetitor, profileName, useTimer } from '../../lib/view';
import { Trophy, Check, X } from 'lucide-react';

type Run = (a: HostAction) => Promise<{ ok: boolean }>;

const STAGES = ['category', 'wagers', 'clue', 'reveal', 'done'] as const;
const NEXT_LABEL: Record<string, string> = {
  category: 'Open wagers',
  wagers: 'Lock wagers & show the clue',
  clue: 'Close answers & start the reveal',
  reveal: 'Finish the Final',
};

export default function FinalControl({ g, run }: { g: GameView; run: Run }) {
  const f = g.final!;
  const remaining = useTimer(g.timer);
  const missingWagers = f.entries.filter((e) => !e.hasWager).length;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {STAGES.map((s) => (
            <span key={s} className={cx('rounded-full px-3 py-1', f.stage === s ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500')}>
              {s === 'category' ? 'Category' : s === 'wagers' ? 'Wagers' : s === 'clue' ? 'Clue' : s === 'reveal' ? 'Reveal' : 'Done'}
            </span>
          ))}
          {g.timer && <span className="ml-auto text-xl font-black tabular-nums">{Math.ceil((remaining ?? 0) / 1000)}s</span>}
        </div>
        <p className="mt-3 text-sm font-bold text-slate-500 uppercase">{f.category}</p>
        <p className="text-xl">{f.question}</p>
        <p className="mt-2 rounded-xl border-2 border-green-600 bg-green-50 p-2 text-xl font-black text-green-900">{f.answer}</p>
        {f.entries.length === 0 && <p className="mt-2 font-semibold text-amber-700">Nobody has a positive score, so nobody plays the Final. Finish to end the game.</p>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {f.entries.map((e) => (
          <FinalEntry key={e.competitorId} g={g} run={run} entry={e} />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {f.stage !== 'done' ? (
          <ActionButton
            size="xl"
            className="flex-1"
            onAction={() => {
              if (f.stage === 'wagers' && missingWagers && !confirm(`${missingWagers} wager(s) missing — they will count as 0. Continue?`)) return;
              return run({ type: 'finalNext' });
            }}
            data-testid="final-next"
          >
            {NEXT_LABEL[f.stage]}
          </ActionButton>
        ) : (
          <ActionButton size="xl" variant="success" className="flex-1" onAction={() => run({ type: 'endGame' })} data-testid="end-game">
            <Trophy size={20} aria-hidden /> Show the winner
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function FinalEntry({ g, run, entry: e }: { g: GameView; run: Run; entry: NonNullable<GameView['final']>['entries'][number] }) {
  const f = g.final!;
  const c = findCompetitor(g, e.competitorId)!;
  const [wager, setWager] = useState('');
  const [answer, setAnswer] = useState('');
  const [who, setWho] = useState<string | null>(null);
  return (
    <div className={cx('space-y-2 rounded-2xl bg-white p-3 shadow-sm', e.judged && (e.correct ? 'ring-2 ring-green-600' : 'ring-2 ring-red-600'))} data-testid="final-entry">
      <div className="flex items-center gap-2">
        <Avatar profile={competitorAvatar(c, g)} size={36} />
        <span className="flex-1 font-bold">{competitorName(c, g)}</span>
        <span className="font-black tabular-nums">{fmtScore(c.score)}</span>
      </div>
      <div className="text-sm text-slate-600">
        Wager: <b>{e.wager ?? '—'}</b> · Answer: <b>{e.answer || '—'}</b>
      </div>
      {(f.stage === 'category' || f.stage === 'wagers') && (
        <div className="flex gap-2">
          <input className={inputCls} inputMode="numeric" placeholder={`0–${Math.max(0, c.score)}`} value={wager} onChange={(x) => setWager(x.target.value.replace(/\D/g, ''))} aria-label={`Wager for ${competitorName(c, g)}`} />
          <Button variant="secondary" disabled={wager === ''} onClick={async () => (await run({ type: 'setFinalWager', competitorId: c.id, amount: Number(wager) })).ok && setWager('')}>
            Set
          </Button>
        </div>
      )}
      {(f.stage === 'clue' || f.stage === 'wagers') && (
        <div className="flex gap-2">
          <input className={inputCls} placeholder="Type their answer" value={answer} onChange={(x) => setAnswer(x.target.value)} aria-label={`Answer for ${competitorName(c, g)}`} />
          <Button variant="secondary" disabled={!answer.trim()} onClick={async () => (await run({ type: 'setFinalAnswer', competitorId: c.id, answer })).ok && setAnswer('')}>
            Set
          </Button>
        </div>
      )}
      {f.stage === 'reveal' && !e.judged && (
        <>
          {c.kind === 'team' && (
            <div className="flex flex-wrap gap-1 text-sm">
              <span className="text-slate-500">Credit (optional):</span>
              {c.memberIds.map((m) => (
                <button key={m} onClick={() => setWho(m)} className={cx('rounded-lg border px-2 py-1', who === m ? 'border-blue-700 bg-blue-50' : 'border-slate-200')}>
                  {profileName(g.profiles[m])}
                </button>
              ))}
              <button onClick={() => setWho(null)} className={cx('rounded-lg border px-2 py-1', who === null ? 'border-blue-700 bg-blue-50' : 'border-slate-200')}>
                Team
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <ActionButton variant="success" size="lg" onAction={() => run({ type: 'judgeFinal', competitorId: c.id, correct: true, profileId: c.kind === 'team' ? who : undefined })}>
              <Check size={18} aria-hidden /> Correct
            </ActionButton>
            <ActionButton variant="danger" size="lg" onAction={() => run({ type: 'judgeFinal', competitorId: c.id, correct: false, profileId: c.kind === 'team' ? who : undefined })}>
              <X size={18} aria-hidden /> Incorrect
            </ActionButton>
          </div>
        </>
      )}
      {e.judged && <p className={cx('font-bold', e.correct ? 'text-green-700' : 'text-red-700')}>{e.correct ? `+${e.wager}` : `−${e.wager}`}</p>}
    </div>
  );
}
