// Statistics + history presentation (player dashboard and desktop).
// Solo stats, individual contributions in team games and team stats are shown separately.
import { useState } from 'react';
import { Card, Modal, cx, fmtScore, pct } from './ui';
import { useFetch } from '../lib/hooks';
import { api } from '../lib/api';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Stats = any;

function Stat({ label, value, hint }: { label: string; value: string | number | null; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3" title={hint}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="text-xl font-black tabular-nums">{value ?? '—'}</div>
    </div>
  );
}

function Categories({ list }: { list: { category: string; correct: number; incorrect: number; accuracy: number | null; points: number }[] }) {
  if (!list.length) return <p className="text-sm text-slate-500">No answers yet.</p>;
  const ranked = list.filter((c) => c.correct + c.incorrect >= 1);
  const strongest = [...ranked].sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0) || b.correct - a.correct)[0];
  const weakest = [...ranked].sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || b.incorrect - a.incorrect)[0];
  return (
    <div className="space-y-2">
      {ranked.length > 1 && (
        <p className="text-sm text-slate-600">
          Strongest: <b>{strongest?.category}</b> · Weakest: <b>{weakest?.category}</b>
        </p>
      )}
      {list.map((c) => (
        <div key={c.category} className="flex items-center gap-2 text-sm">
          <span className="w-32 truncate font-semibold">{c.category}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-red-200" aria-hidden>
            <div className="h-full bg-green-600" style={{ width: `${(c.accuracy ?? 0) * 100}%` }} />
          </div>
          <span className="w-28 text-right tabular-nums text-slate-600">
            {c.correct}✓ {c.incorrect}✗ {pct(c.accuracy)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ProfileStats({ stats }: { stats: Stats }) {
  const [tab, setTab] = useState<'solo' | 'team'>(stats.team.games.played > stats.solo.games.played ? 'team' : 'solo');
  const s = stats.solo;
  const t = stats.team;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Games played" value={stats.combined.gamesPlayed} />
        <Stat label="Wins" value={stats.combined.wins} />
        <Stat label="Correct answers" value={stats.combined.correct} hint="Only answers the host marked correct" />
        <Stat label="Accuracy" value={pct(stats.combined.correct + stats.combined.incorrect ? stats.combined.correct / (stats.combined.correct + stats.combined.incorrect) : null)} />
      </div>
      <div className="flex rounded-xl bg-slate-100 p-1" role="tablist">
        {(['solo', 'team'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('min-h-11 flex-1 rounded-lg font-semibold', tab === k ? 'bg-white shadow' : 'text-slate-600')}>
            {k === 'solo' ? 'Solo games' : 'Team games'}
          </button>
        ))}
      </div>
      {tab === 'solo' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Played" value={s.games.played} />
            <Stat label="Won / lost" value={`${s.games.wins} / ${s.games.losses}`} />
            <Stat label="Win rate" value={pct(s.games.winRate)} />
            <Stat label="Average score" value={s.games.averageScore == null ? null : fmtScore(s.games.averageScore)} />
            <Stat label="Highest score" value={s.games.highestScore == null ? null : fmtScore(s.games.highestScore)} />
            <Stat label="Lowest score" value={s.games.lowestScore == null ? null : fmtScore(s.games.lowestScore)} />
            <Stat label="Correct / incorrect" value={`${s.answers.correct} / ${s.answers.incorrect}`} />
            <Stat label="Accuracy" value={pct(s.answers.accuracy)} />
            <Stat label="Points earned" value={fmtScore(s.answers.pointsEarned)} />
            <Stat label="Points lost" value={fmtScore(s.answers.pointsLost)} />
            <Stat label="Buzzes (won / tried)" value={`${s.buzzer.successful} / ${s.buzzer.attempts}`} hint="Tried = buzzed while buzzers were open" />
            <Stat label="Avg buzz speed" value={s.buzzer.averageReactionMs == null ? null : `${(s.buzzer.averageReactionMs / 1000).toFixed(2)}s`} />
            <Stat label="Daily Wagers won / lost" value={`${s.dailyWagers.won} / ${s.dailyWagers.lost}`} />
            <Stat label="Final Wagers won / lost" value={`${s.finalWagers.won} / ${s.finalWagers.lost}`} />
          </div>
          <Card>
            <h4 className="mb-2 font-bold">Categories (solo)</h4>
            <Categories list={s.categories} />
          </Card>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Team points belong to the team. "Contribution" counts only answers you personally gave.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Team games" value={t.games.played} />
            <Stat label="Team wins / losses" value={`${t.games.wins} / ${t.games.losses}`} />
            <Stat label="Team win rate" value={pct(t.games.winRate)} />
            <Stat label="My correct / incorrect" value={`${t.contribution.correct} / ${t.contribution.incorrect}`} />
            <Stat label="My accuracy" value={pct(t.contribution.accuracy)} />
            <Stat label="Contribution earned" value={fmtScore(t.contribution.pointsEarned)} />
            <Stat label="Contribution lost" value={fmtScore(t.contribution.pointsLost)} />
            <Stat label="Net contribution" value={fmtScore(t.contribution.net)} />
            <Stat label="My buzzes (won / tried)" value={`${t.buzzer.successful} / ${t.buzzer.attempts}`} />
            <Stat label="Avg buzz speed" value={t.buzzer.averageReactionMs == null ? null : `${(t.buzzer.averageReactionMs / 1000).toFixed(2)}s`} />
          </div>
          <Card>
            <h4 className="mb-2 font-bold">Categories (my team answers)</h4>
            <Categories list={t.categories} />
          </Card>
        </div>
      )}
    </div>
  );
}

export function TeamStatsView({ stats }: { stats: Stats }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Games" value={stats.games.played} />
        <Stat label="Wins / losses" value={`${stats.games.wins} / ${stats.games.losses}`} />
        <Stat label="Average score" value={stats.games.averageScore == null ? null : fmtScore(stats.games.averageScore)} />
        <Stat label="Highest score" value={stats.games.highestScore == null ? null : fmtScore(stats.games.highestScore)} />
        <Stat label="Correct / incorrect" value={`${stats.answers.correct} / ${stats.answers.incorrect}`} />
        <Stat label="Unattributed answers" value={stats.unattributedAnswers} hint="Shared-buzzer answers without a named player" />
        <Stat label="Buzzes won" value={`${stats.buzzer.successful} / ${stats.buzzer.attempts}`} />
        <Stat label="Wagers won / lost" value={`${stats.wagers.won} / ${stats.wagers.lost} (${fmtScore(stats.wagers.net)})`} />
      </div>
      <Card>
        <h4 className="mb-2 font-bold">Categories</h4>
        <Categories list={stats.categories} />
      </Card>
    </div>
  );
}

export function HistoryList({ rows, as, highlightProfile }: { rows: any[]; as: 'host' | 'profile'; highlightProfile?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!rows.length) return <p className="text-slate-500">No completed games yet.</p>;
  return (
    <>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <button onClick={() => setOpen(r.id)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50" data-testid="history-row">
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate font-semibold">{r.title}</span>
                {r.isWinner && <span className="rounded-full bg-yellow-300 px-2 text-xs font-bold">WON</span>}
              </div>
              <div className="text-sm text-slate-500">
                {r.endedAt ? new Date(r.endedAt).toLocaleDateString() : ''}
                {r.durationMs ? ` · ${Math.round(r.durationMs / 60000)} min` : ''}
                {r.finalScore != null ? ` · ${r.competitorName}: ${fmtScore(r.finalScore)} (#${r.placement} of ${r.competitorCount})` : r.winners ? ` · Winner: ${r.winners}` : ''}
                {r.correct != null ? ` · ${r.correct}✓ ${r.incorrect}✗` : ''}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {open && <GameDetail id={open} as={as} onClose={() => setOpen(null)} highlightProfile={highlightProfile} />}
    </>
  );
}

export function GameDetail({ id, as, onClose, highlightProfile }: { id: string; as: 'host' | 'profile'; onClose: () => void; highlightProfile?: string }) {
  const d = useFetch(() => api<any>('GET', `/api/history/${id}`, undefined, { as }), [id]);
  const g = d.data;
  const name = (cid: string) => g?.competitors.find((c: any) => c.id === cid)?.name ?? '';
  const member = (pid: string | null) => {
    if (!pid) return null;
    for (const c of g?.competitors ?? []) for (const m of c.members) if (m.profileId === pid) return m.name;
    return null;
  };
  const clueById = new Map<string, any>((g?.clues ?? []).map((c: any) => [c.clueId, c]));
  const answers = (g?.events ?? []).filter((e: any) => !e.voided && (e.type === 'answer' || (e.type === 'buzz' && e.result === 'won')));
  return (
    <Modal open onClose={onClose} title={g?.title ?? 'Game'} wide>
      {!g ? (
        <p>{d.error ?? 'Loading…'}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            {g.endedAt ? new Date(g.endedAt).toLocaleString() : ''} · {g.mode === 'team' ? 'Team game' : 'Solo game'}
            {g.startedAt && g.endedAt ? ` · ${Math.round((g.endedAt - g.startedAt) / 60000)} min` : ''}
          </p>
          <div className="space-y-1">
            {g.competitors.map((c: any) => (
              <div key={c.id} className={cx('flex items-center gap-2 rounded-lg p-2', c.isWinner ? 'bg-yellow-100' : 'bg-slate-50')}>
                <span className="w-8 font-black">#{c.placement ?? '–'}</span>
                <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
                <span className="flex-1 font-semibold">
                  {c.name}
                  {c.kind === 'team' && <span className="text-sm font-normal text-slate-500"> — {c.members.map((m: any) => m.name).join(', ')} · {c.buzzerMode} buzzer</span>}
                </span>
                <span className="font-black tabular-nums">{fmtScore(c.finalScore ?? 0)}</span>
              </div>
            ))}
          </div>
          <div>
            <h4 className="mb-2 font-bold">Clue by clue</h4>
            <ul className="divide-y divide-slate-100 text-sm">
              {answers.map((e: any) => {
                const clue = clueById.get(e.clueId);
                const mine = highlightProfile && e.profileId === highlightProfile;
                return (
                  <li key={e.id} className={cx('py-2', mine && 'bg-blue-50')}>
                    <div className="text-xs text-slate-500">
                      {clue?.category} · {clue?.value || (e.wager != null ? `wager ${e.wager}` : '')}
                    </div>
                    <div>{clue?.question}</div>
                    <div className="text-slate-700">
                      <b>{name(e.competitorId)}</b>
                      {member(e.profileId) && g.mode === 'team' ? ` (${member(e.profileId)})` : ''}{' '}
                      {e.type === 'buzz' ? (
                        <span>buzzed first{e.reactionMs != null ? ` in ${(e.reactionMs / 1000).toFixed(2)}s` : ''}</span>
                      ) : (
                        <span className={e.result === 'correct' ? 'text-green-700' : 'text-red-700'}>
                          {e.result} {e.scoreDelta > 0 ? '+' : ''}
                          {fmtScore(e.scoreDelta)}
                        </span>
                      )}
                      {e.type === 'answer' && e.result === 'incorrect' ? '' : e.type === 'answer' ? <span className="text-slate-500"> — {clue?.answer}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
