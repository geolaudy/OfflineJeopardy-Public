import { useState } from 'react';
import { hostApi } from '../../lib/api';
import { useFetch } from '../../lib/hooks';
import { HistoryList } from '../../components/StatsView';
import { Avatar, cx, pct } from '../../components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function History() {
  const [tab, setTab] = useState<'games' | 'leaderboard'>('games');
  const games = useFetch(() => hostApi<any[]>('GET', '/api/history'), []);
  const board = useFetch(() => hostApi<any[]>('GET', '/api/stats/leaderboard'), []);
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-3xl font-black">History & statistics</h1>
      <div className="flex rounded-xl bg-white p-1 shadow-sm" role="tablist">
        {(['games', 'leaderboard'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx('min-h-11 flex-1 rounded-lg font-semibold', tab === t ? 'bg-blue-700 text-white' : 'text-slate-700')}>
            {t === 'games' ? 'Completed games' : 'Leaderboard'}
          </button>
        ))}
      </div>
      {tab === 'games' ? (
        games.data ? <HistoryList rows={games.data} as="host" /> : <p>{games.error ?? 'Loading…'}</p>
      ) : (
        <table className="w-full overflow-hidden rounded-2xl bg-white text-left shadow-sm">
          <thead className="bg-slate-50 text-sm text-slate-600">
            <tr>
              <th className="p-3">#</th>
              <th className="p-3">Player</th>
              <th className="p-3 text-right">Games</th>
              <th className="p-3 text-right">Wins</th>
              <th className="p-3 text-right">Correct</th>
              <th className="p-3 text-right">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {(board.data ?? []).map((r, i) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-3 font-bold">{i + 1}</td>
                <td className="flex items-center gap-2 p-3 font-semibold">
                  <Avatar profile={r} size={28} /> {r.name}
                </td>
                <td className="p-3 text-right tabular-nums">{r.games}</td>
                <td className="p-3 text-right tabular-nums">{r.wins}</td>
                <td className="p-3 text-right tabular-nums">{r.correct}</td>
                <td className="p-3 text-right tabular-nums">{pct(r.accuracy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
