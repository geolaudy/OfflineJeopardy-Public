// Chronological event history with audited attribution corrections.
import { useState } from 'react';
import type { GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import type { GameplayEvent } from '../../../shared/game';
import { Button, Modal, cx, fmtScore } from '../../components/ui';
import { competitorName, findCompetitor, profileName } from '../../lib/view';

function describe(e: GameplayEvent, g: GameView) {
  const c = findCompetitor(g, e.competitorId);
  const who = c ? competitorName(c, g) : '';
  const person = e.profileId && c?.kind === 'team' ? ` (${profileName(g.profiles[e.profileId])})` : c?.kind === 'team' && (e.type === 'answer' || e.type === 'buzz') ? ' (team)' : '';
  switch (e.type) {
    case 'game_start':
      return 'Game started';
    case 'round_change':
      return e.result === 'final' ? 'Final round started' : `Round ${(e.roundIndex ?? 0) + 1}`;
    case 'clue_open':
      return `Clue opened${e.result === 'daily_wager' ? ' (Daily Wager)' : ''}`;
    case 'clue_close':
      return `Clue ${e.result}`;
    case 'buzz':
      if (e.result === 'early') return `${who}${person} buzzed too early${e.scoreDelta ? ` ${fmtScore(e.scoreDelta)}` : ''}${e.note === 'refunded' ? ' (penalty refunded)' : ''}`;
      return `${who}${person} buzzed — ${e.result}${e.reactionMs != null ? ` (${(e.reactionMs / 1000).toFixed(2)}s, ${e.sourceKind})` : ''}`;
    case 'answer':
      return `${who}${person} ${e.result} ${fmtScore(e.scoreDelta)}`;
    case 'submission':
      return `${who} answered “${e.note ?? ''}” (waiting for the host)`;
    case 'wager':
      return `${who} wagered ${e.wager} (${e.result})`;
    case 'score_adjust':
      if (e.correctsEventId) return `${who}: ${e.note ?? 'correction'}`;
      return `${who} adjusted ${e.scoreDelta > 0 ? '+' : ''}${fmtScore(e.scoreDelta)}`;
    case 'attribution_correction':
      return `Attribution corrected for ${who}`;
    case 'undo':
      return `Undo: ${e.note}`;
    case 'game_end':
      return 'Game ended';
  }
}

export default function EventLog({ open, onClose, g, run }: { open: boolean; onClose: () => void; g: GameView; run: (a: HostAction) => Promise<{ ok: boolean }> }) {
  const [fixing, setFixing] = useState<GameplayEvent | null>(null);
  const events = [...(g.events ?? [])].reverse();
  return (
    <Modal open={open} onClose={onClose} title="Event history" wide>
      <ul className="divide-y divide-slate-100">
        {events.map((e) => {
          const c = findCompetitor(g, e.competitorId);
          const canFix = !e.voided && c?.kind === 'team' && (e.type === 'answer' || e.type === 'wager');
          const canRefund = !e.voided && e.type === 'buzz' && e.result === 'early' && e.scoreDelta < 0;
          return (
            <li key={e.id} className={cx('flex items-center gap-3 py-2 text-sm', e.voided && 'text-slate-400 line-through')}>
              <span className="w-16 shrink-0 text-xs text-slate-400 tabular-nums">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span className="flex-1">{describe(e, g)}</span>
              {canFix && (
                <Button size="sm" variant="ghost" onClick={() => setFixing(e)}>
                  Change who answered
                </Button>
              )}
              {canRefund && (
                <Button size="sm" variant="ghost" onClick={() => confirm(`Give back ${Math.abs(e.scoreDelta)} points?`) && run({ type: 'refundPenalty', eventId: e.id })}>
                  Refund penalty
                </Button>
              )}
            </li>
          );
        })}
        {!events.length && <li className="py-4 text-slate-500">Nothing yet.</li>}
      </ul>
      {fixing && (
        <Modal open onClose={() => setFixing(null)} title="Who answered?">
          {(() => {
            const c = findCompetitor(g, fixing.competitorId)!;
            const pick = async (pid: string | null) => {
              const r = await run({ type: 'correctAttribution', eventId: fixing.id, profileId: pid });
              if (r.ok) setFixing(null);
            };
            return (
              <div className="grid gap-2">
                <p className="text-sm text-slate-600">The team score does not change. The correction is recorded in the history.</p>
                {c.memberIds.map((m) => (
                  <Button key={m} variant={fixing.profileId === m ? 'primary' : 'secondary'} onClick={() => pick(m)}>
                    {profileName(g.profiles[m])}
                  </Button>
                ))}
                <Button variant={fixing.profileId ? 'secondary' : 'primary'} onClick={() => pick(null)}>
                  Team only / unknown
                </Button>
              </div>
            );
          })()}
        </Modal>
      )}
    </Modal>
  );
}
