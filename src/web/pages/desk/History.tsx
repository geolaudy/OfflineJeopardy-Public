import { useCallback, useState } from 'react';
import { usePresent } from '../host/AppShell';
import type { LeaderView } from '../../../shared/leaderboard';
import { downloadFile, hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { HistoryList } from '../../components/StatsView';
import { Button, cx } from '../../components/ui';
import Leaderboard from '../join/Leaderboard';
import { Download } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function History() {
  const [tab, setTab] = useState<'games' | 'leaderboard'>('games');
  const games = useFetch(() => hostApi<any[]>('GET', '/api/history'), []);
  const { show } = usePresent();
  // The leaderboard (public names and totals) follows on the TV while presenting; game lists stay private.
  const presentBoard = useCallback((view: LeaderView, metric: string) => show({ page: 'leaderboard', view, metric }), [show]);
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-3xl font-black">History & statistics</h1>
        <Button variant="secondary" size="sm" onClick={() => attempt(() => downloadFile('/api/stats/export/players.csv', 'offlinejeopardy-players.csv'))}>
          <Download size={16} aria-hidden /> Player stats (CSV)
        </Button>
        <Button variant="secondary" size="sm" onClick={() => attempt(() => downloadFile('/api/stats/export/games.csv', 'offlinejeopardy-games.csv'))}>
          <Download size={16} aria-hidden /> Game results (CSV)
        </Button>
      </div>
      <div className="flex rounded-xl bg-white p-1 shadow-sm" role="tablist">
        {(['games', 'leaderboard'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx('min-h-11 flex-1 rounded-lg font-semibold', tab === t ? 'bg-blue-700 text-white' : 'text-slate-700')}>
            {t === 'games' ? 'Completed games' : 'Leaderboard'}
          </button>
        ))}
      </div>
      {tab === 'games' ? games.data ? <HistoryList rows={games.data} as="host" /> : <p>{games.error ?? 'Loading…'}</p> : <Leaderboard asHost onViewChange={presentBoard} />}
    </div>
  );
}
