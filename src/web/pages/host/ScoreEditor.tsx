// Score editor on the iPad (R7-22, references/host_score_adjust_screen*.png): the score itself is
// editable, − / + step by the round's lowest clue value, the change so far shows in green / red,
// and nothing happens until Save. "Latest score changes" lists this player's or team's recent
// changes; each can be taken back right away (a manual adjustment is removed, a gameplay change
// is offset — engine action reverseScoreChange, audited and undoable). Remove Player asks first.
// Manual changes stay quiet on the TV (D68).
import { useState } from 'react';
import { Minus, Plus, Trash2, Undo2, Crown } from 'lucide-react';
import type { CompetitorView, GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import type { GameplayEvent } from '../../../shared/game';
import { ActionButton, Button, Modal, cx, fmtScore } from '../../components/ui';
import { competitorName, profileName } from '../../lib/view';
import { Attribution } from './HostClue';

type Run = (a: HostAction) => Promise<{ ok: boolean }>;

/** − / + step: the lowest clue value of the current round (else of the first round, else 100). */
export function scoreStep(g: GameView): number {
  const values = (r: GameView['rounds'][number] | undefined) => (r && r.kind === 'standard' ? r.categories.flatMap((c) => c.clues.map((q) => q.value)).filter((v) => v > 0) : []);
  const here = values(g.rounds[g.roundIndex]);
  const any = here.length ? here : values(g.rounds.find((r) => r.kind === 'standard'));
  return any.length ? Math.min(...any) : 100;
}

// Amounts with a dollar sign, as in the reference ("Host deducted $400").
const money = (n: number) => `$${fmtScore(Math.abs(n))}`;

/** "Host awarded $400 to Alex", "Correct answer +$600 (Jordan)"… */
export function describeChange(e: GameplayEvent, g: GameView, who: string): string {
  const by = e.profileId && g.profiles[e.profileId] ? ` (${profileName(g.profiles[e.profileId])})` : '';
  const signed = `${e.scoreDelta > 0 ? '+' : '−'}${money(e.scoreDelta)}`;
  switch (e.type) {
    case 'score_adjust':
      if (e.correctsEventId) return `Score change taken back ${signed}`;
      return e.scoreDelta > 0 ? `Host awarded ${money(e.scoreDelta)} to ${who}` : `Host deducted ${money(e.scoreDelta)} from ${who}`;
    case 'answer':
      return `${e.result === 'correct' ? 'Correct answer' : 'Wrong answer'} ${signed}${by}`;
    case 'wager':
      return `${e.result === 'final' ? 'Final Jeopardy!' : 'Daily Double!'} wager ${signed}${by}`;
    case 'buzz':
      return `Early buzz penalty ${signed}${by}`;
    default:
      return `Score change ${signed}`;
  }
}

export default function ScoreEditor({ g, c, run, onClose }: { g: GameView; c: CompetitorView; run: Run; onClose: () => void }) {
  const name = competitorName(c, g);
  const step = scoreStep(g);
  const [text, setText] = useState(String(c.score));
  const [who, setWho] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const target = /^-?\d+$/.test(text) ? Number(text) : null;
  const change = target === null ? 0 : target - c.score;
  const bump = (d: number) => setText(String((target ?? c.score) + d));

  const events = g.events ?? [];
  const takenBack = new Set(events.filter((e) => !e.voided && e.type === 'score_adjust' && e.correctsEventId).map((e) => e.correctsEventId!));
  const recent = events
    .filter((e) => e.competitorId === c.id && !e.voided && e.scoreDelta !== 0)
    .slice(-5)
    .reverse();
  const scored = c.score !== 0 || events.some((e) => e.competitorId === c.id && !e.voided && e.scoreDelta !== 0);

  const save = async () => {
    if (!change) return onClose();
    const r = await run({ type: 'adjustScore', competitorId: c.id, delta: change, note: 'manual', profileId: c.kind === 'team' ? who : undefined });
    if (r.ok) onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Edit ${name}'s score`}>
      <div className="space-y-4" data-testid="score-editor">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="lg" className="w-14 shrink-0 px-0" onClick={() => bump(-step)} aria-label={`Minus ${step}`} data-testid="score-minus">
            <Minus size={22} aria-hidden />
          </Button>
          <label className="flex min-w-0 flex-1 items-center gap-1 rounded-xl border-2 border-slate-300 bg-white px-3 focus-within:border-blue-600">
            <span className="text-2xl font-black text-slate-400">$</span>
            <input
              className="h-14 w-full min-w-0 bg-transparent text-3xl font-black tabular-nums outline-none"
              inputMode="numeric"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^\d-]/g, '').replace(/(?!^)-/g, ''))}
              aria-label="Score"
              data-testid="score-input"
            />
          </label>
          <Button variant="secondary" size="lg" className="w-14 shrink-0 px-0" onClick={() => bump(step)} aria-label={`Plus ${step}`} data-testid="score-plus">
            <Plus size={22} aria-hidden />
          </Button>
        </div>
        <p className={cx('min-h-7 text-lg font-bold tabular-nums', change > 0 ? 'text-green-700' : change < 0 ? 'text-red-700' : 'text-slate-400')} data-testid="score-change" aria-live="polite">
          {target === null ? 'Enter a score' : change === 0 ? 'No change' : `${change > 0 ? '+' : '−'}${money(change)} (was ${c.score < 0 ? '−' : ''}${money(c.score)})`}
        </p>
        {c.kind === 'team' && change !== 0 && <Attribution g={g} c={c} value={who} onChange={setWho} compact={false} />}

        <section className="rounded-2xl bg-blue-900 p-3 text-white" aria-label="Latest score changes" data-testid="score-changes">
          <h3 className="mb-2 text-center text-lg font-black">Latest score changes</h3>
          {recent.length === 0 ? (
            <p className="py-2 text-center text-sm text-blue-100">No score changes yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recent.map((e) => {
                const gone = takenBack.has(e.id);
                const manual = e.type === 'score_adjust' && !e.correctsEventId;
                return (
                  <li key={e.id} className="flex items-center gap-2" data-testid="score-change-row">
                    <span className={cx('min-w-0 flex-1 text-sm font-semibold', gone && 'text-blue-200 line-through')}>
                      <span className={e.scoreDelta > 0 ? 'text-green-300' : 'text-red-300'}>{e.scoreDelta > 0 ? '▲' : '▼'}</span> {describeChange(e, g, name)}
                    </span>
                    {gone ? (
                      <span className="text-xs font-semibold text-blue-200">taken back</span>
                    ) : (
                      <ActionButton
                        size="sm"
                        variant="danger"
                        className="shrink-0"
                        onAction={() => run({ type: 'reverseScoreChange', eventId: e.id })}
                        aria-label={manual ? 'Remove this change' : 'Take back this change'}
                        data-testid="score-change-remove"
                      >
                        {manual ? <Trash2 size={16} aria-hidden /> : <Undo2 size={16} aria-hidden />}
                      </ActionButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {g.phase === 'board' && g.controlCompetitorId !== c.id && (
          <Button variant="ghost" className="w-full" onClick={async () => (await run({ type: 'setControl', competitorId: c.id })).ok && onClose()}>
            <Crown size={16} aria-hidden /> Give board control to {name}
          </Button>
        )}

        {confirmRemove ? (
          <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3" data-testid="remove-confirm">
            <p className="mb-2 font-semibold text-red-900">Remove {name} from this game?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
                Keep
              </Button>
              <ActionButton variant="danger" onAction={async () => (await run({ type: 'removeCompetitor', competitorId: c.id })).ok && onClose()} data-testid="remove-yes">
                Remove
              </ActionButton>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="shrink-0 whitespace-nowrap text-red-700" disabled={scored} onClick={() => setConfirmRemove(true)} data-testid="remove-player">
              <Trash2 size={16} aria-hidden /> Remove {c.kind === 'team' ? 'Team' : 'Player'}
            </Button>
            {scored && <span className="text-xs text-slate-500">Not possible once they have points in this game.</span>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
          <Button size="lg" variant="secondary" onClick={onClose} data-testid="score-cancel">
            Cancel
          </Button>
          <ActionButton size="lg" disabled={target === null || change === 0} onAction={save} data-testid="score-save">
            Save
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}
