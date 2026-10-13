// Personal game history (list) and a detailed per-game page built only from historical
// snapshots + gameplay events, so later board edits never change what is shown here.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { meApi } from '../../lib/api';
import { useFetch } from '../../lib/hooks';
import { cx, fmtScore } from '../../components/ui';
import type { Me } from './JoinPage';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface HistoryRow {
  id: string;
  title: string;
  mode: 'solo' | 'team';
  endedAt: number;
  durationMs: number | null;
  competitorName: string;
  kind: string;
  finalScore: number | null;
  placement: number | null;
  isWinner: boolean;
  competitorCount: number;
  winners: string | null;
  correct: number;
  incorrect: number;
}

export function HistoryPage({ me: _me }: { me: Me }) {
  const h = useFetch(() => meApi<HistoryRow[]>('GET', '/api/me/history'), []);
  if (!h.data) return <p className="text-slate-500">{h.error ?? 'Loading…'}</p>;
  if (!h.data.length) return <p className="rounded-2xl bg-white p-6 text-center text-slate-600 shadow-sm">No completed games yet. Your games appear here when the host ends them.</p>;
  return (
    <ul className="space-y-2">
      {h.data.map((r) => (
        <li key={r.id}>
          <Link to={`/join/history/${r.id}`} className="block rounded-2xl bg-white p-3 shadow-sm active:bg-slate-50" data-testid="history-row">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-bold">{r.title}</span>
              {r.isWinner && <span className="rounded-full bg-yellow-300 px-2 text-xs font-bold">WON</span>}
              <span aria-hidden className="text-slate-400">
                ›
              </span>
            </div>
            <div className="text-sm text-slate-500">
              {new Date(r.endedAt).toLocaleDateString()} · {r.mode === 'team' ? `Team game (${r.competitorName})` : 'Solo game'}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-sm">
              {r.finalScore != null && (
                <span className="font-semibold">
                  {fmtScore(r.finalScore)} · #{r.placement} of {r.competitorCount}
                </span>
              )}
              <span className="text-slate-600">
                {r.correct}✓ {r.incorrect}✗
              </span>
              {!r.isWinner && r.winners && <span className="text-slate-500">Winner: {r.winners}</span>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const BUZZ_LABEL: Record<string, string> = { won: 'buzzed in first', late: 'buzzed (too late)', early: 'buzzed too early' };

export function GameDetailPage({ me }: { me: Me }) {
  const { gameId = '' } = useParams();
  const d = useFetch(() => meApi<any>('GET', `/api/history/${gameId}`), [gameId]);
  const [mine, setMine] = useState(true);
  const g = d.data;

  const model = useMemo(() => {
    if (!g) return null;
    const myComp = g.competitors.find((c: any) => c.members.some((m: any) => m.profileId === me.id));
    const clueById = new Map<string, any>(g.clues.map((c: any) => [c.clueId, c]));
    const memberName = new Map<string, string>();
    for (const c of g.competitors) for (const m of c.members) memberName.set(m.profileId, m.name);
    const compName = (id: string) => g.competitors.find((c: any) => c.id === id)?.name ?? '';
    const events = (g.events as any[]).filter((e) => !e.voided && e.clueId && (e.type === 'answer' || e.type === 'buzz' || e.type === 'wager'));
    // Clues in the order they were played.
    const order: string[] = [];
    for (const e of g.events as any[]) if (e.type === 'clue_open' && e.clueId && !order.includes(e.clueId)) order.push(e.clueId);
    for (const e of events) if (!order.includes(e.clueId)) order.push(e.clueId);
    const isMine = (e: any) => e.profileId === me.id || (g.mode === 'team' && myComp && e.competitorId === myComp.id && !e.profileId);
    const closeResult = new Map<string, string>();
    for (const e of g.events as any[]) if (e.type === 'clue_close' && !e.voided) closeResult.set(e.clueId, e.result);
    const clues = order
      .map((id) => ({ clue: clueById.get(id), events: events.filter((e) => e.clueId === id), result: closeResult.get(id) }))
      .filter((x) => x.clue);
    const myEvents = events.filter(isMine);
    const answers = myEvents.filter((e) => e.type === 'answer');
    const pointsOf = (e: any) => (g.mode === 'team' ? e.contributionDelta : e.scoreDelta);
    const summary = {
      buzzWins: myEvents.filter((e) => e.type === 'buzz' && e.result === 'won' && e.profileId === me.id).length,
      early: myEvents.filter((e) => e.type === 'buzz' && e.result === 'early' && e.profileId === me.id).length,
      correct: answers.filter((e) => e.result === 'correct' && e.profileId === me.id).length,
      incorrect: answers.filter((e) => e.result === 'incorrect' && e.profileId === me.id).length,
      earned: answers.filter((e) => e.profileId === me.id && pointsOf(e) > 0).reduce((a, e) => a + pointsOf(e), 0),
      lost: answers.filter((e) => e.profileId === me.id && pointsOf(e) < 0).reduce((a, e) => a - pointsOf(e), 0),
      wagers: myEvents.filter((e) => e.type === 'answer' && e.wager != null),
    };
    const rounds = new Map<number, { name: string; kind: string; categories: string[] }>();
    for (const c of g.clues) {
      const r = rounds.get(c.roundIndex) ?? { name: c.roundName, kind: c.roundKind, categories: [] as string[] };
      if (!r.categories.includes(c.category)) r.categories.push(c.category);
      rounds.set(c.roundIndex, r);
    }
    return { myComp, clues, isMine, summary, rounds: [...rounds.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]), memberName, compName };
  }, [g, me.id]);

  if (d.error) return <p className="rounded-2xl bg-white p-6 text-center text-slate-600 shadow-sm">{d.error}</p>;
  if (!g || !model) return <p className="text-slate-500">Loading…</p>;
  const { myComp, clues, isMine, summary, rounds, memberName, compName } = model;
  const shown = mine ? clues.filter((c) => c.events.some(isMine)) : clues;
  const winners = g.competitors.filter((c: any) => c.isWinner).map((c: any) => c.name);

  return (
    <div className="space-y-5" data-testid="game-detail">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-2xl font-black">{g.title}</h2>
        <p className="text-sm text-slate-500">
          {g.endedAt ? new Date(g.endedAt).toLocaleString() : ''} · {g.mode === 'team' ? 'Team game' : 'Solo game'}
          {g.startedAt && g.endedAt ? ` · ${Math.max(1, Math.round((g.endedAt - g.startedAt) / 60000))} min` : ''}
        </p>
        {winners.length > 0 && (
          <p className="mt-2 font-semibold">
            🏆 {winners.join(' & ')} {winners.length > 1 ? 'tied for the win' : 'won'}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">Final scores</h3>
        {g.competitors.map((c: any) => (
          <div key={c.id} className={cx('flex items-center gap-3 rounded-xl p-3', c.isWinner ? 'bg-yellow-100' : 'bg-white shadow-sm', myComp?.id === c.id && 'ring-2 ring-blue-600')}>
            <span className="w-8 text-lg font-black">#{c.placement ?? '–'}</span>
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {c.name}
                {myComp?.id === c.id && <span className="ml-1 text-xs text-blue-700">(you)</span>}
              </span>
              {c.kind === 'team' && (
                <span className="block truncate text-xs text-slate-500">
                  {c.members.map((m: any) => m.name).join(', ')} · {c.buzzerMode === 'shared' ? 'shared buzzer' : 'own buzzers'}
                </span>
              )}
            </span>
            <span className="font-black tabular-nums">{fmtScore(c.finalScore ?? 0)}</span>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-3 gap-2">
        {(
          [
            ['Buzzed first', summary.buzzWins],
            ['Correct', summary.correct],
            ['Incorrect', summary.incorrect],
            [g.mode === 'team' ? 'My points earned' : 'Points earned', fmtScore(summary.earned)],
            [g.mode === 'team' ? 'My points lost' : 'Points lost', fmtScore(summary.lost)],
            ['Early buzzes', summary.early],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="text-xs font-semibold text-slate-500">{label}</div>
            <div className="text-xl font-black tabular-nums">{v}</div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">Categories</h3>
        {rounds.map((r) => (
          <div key={r.name}>
            <div className="text-xs font-semibold text-slate-500 uppercase">{r.name}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {r.categories.map((c) => (
                <span key={c} className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-900">
                  {c}
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold">Clue by clue</h3>
          <div className="flex rounded-lg bg-slate-200/70 p-0.5 text-sm" role="tablist" aria-label="Which clues">
            {(
              [
                [true, 'Mine'],
                [false, 'All'],
              ] as const
            ).map(([v, label]) => (
              <button key={label} role="tab" aria-selected={mine === v} onClick={() => setMine(v)} className={cx('min-h-9 rounded-md px-3 font-semibold', mine === v ? 'bg-white shadow' : 'text-slate-600')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 && <p className="text-sm text-slate-500">{mine ? "You didn't buzz in or answer on any clue in this game." : 'No clues were played.'}</p>}
        <ul className="space-y-2">
          {shown.map(({ clue, events, result }) => (
            <li key={clue.clueId} className="rounded-xl bg-white p-3 shadow-sm" data-testid="history-clue">
              <div className="text-xs font-semibold text-slate-500">
                {clue.roundKind === 'final' ? 'Final Wager' : `${clue.category} · ${clue.value}`}
                {clue.dailyWager ? ' · Daily Wager' : ''}
                {result === 'unanswered' ? ' · nobody got it' : result === 'skipped' ? ' · skipped' : ''}
              </div>
              <p className="mt-0.5">{clue.question}</p>
              <p className="text-sm font-semibold text-green-800">{clue.answer}</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {events
                  .filter((e: any) => !mine || isMine(e))
                  .filter((e: any) => e.type !== 'wager' || e.result === 'daily')
                  .map((e: any) => {
                    const who = e.profileId ? memberName.get(e.profileId) ?? 'Player' : `${compName(e.competitorId)} (team)`;
                    const pts = g.mode === 'team' && e.profileId ? e.contributionDelta : e.scoreDelta;
                    return (
                      <li key={e.id} className={cx(isMine(e) && 'font-semibold')}>
                        <span className="text-slate-700">{who}</span>{' '}
                        {e.type === 'buzz' ? (
                          <span className="text-slate-500">
                            {BUZZ_LABEL[e.result] ?? 'buzzed'}
                            {e.result === 'won' && e.reactionMs != null ? ` (${(e.reactionMs / 1000).toFixed(2)}s)` : ''}
                            {e.scoreDelta ? ` ${fmtScore(e.scoreDelta)}` : ''}
                          </span>
                        ) : e.type === 'wager' ? (
                          <span className="text-slate-500">wagered {e.wager?.toLocaleString()}</span>
                        ) : (
                          <span className={e.result === 'correct' ? 'text-green-700' : 'text-red-700'}>
                            {e.result === 'correct' ? 'correct' : 'incorrect'} {pts > 0 ? '+' : ''}
                            {fmtScore(pts)}
                            {e.wager != null ? ` (wager ${e.wager.toLocaleString()})` : ''}
                          </span>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
