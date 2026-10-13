// Tournament standings on the phone (O8): names and points only, your own row highlighted.
import { useState } from 'react';
import { Crown, Trophy } from 'lucide-react';
import { meApi } from '../../lib/api';
import { useFetch } from '../../lib/hooks';
import { useLive } from '../../lib/socket';
import { Avatar, cx, fmtScore } from '../../components/ui';

interface PublicTournament {
  id: string;
  name: string;
  mode: 'solo' | 'team';
  scoring: 'placement' | 'total';
  status: 'active' | 'finished';
  games: number;
  rows: { rank: number; name: string; color: string; avatar: string; pictureUrl: string | null; points: number; games: number; wins: number; me: boolean }[];
}

export default function Tournaments() {
  const v = useLive((s) => s.profilesVersion);
  const gamePhase = useLive((s) => s.game?.phase);
  // Refresh when a game ends (standings change) or profiles change.
  const list = useFetch(() => meApi<PublicTournament[]>('GET', '/api/tournaments/public'), [v, gamePhase === 'ended']);
  const [openId, setOpenId] = useState<string | null>(null);
  if (list.error) return <p className="rounded-2xl bg-white p-6 text-center text-slate-600 shadow-sm">{list.error}</p>;
  if (!list.data) return <p className="text-slate-500">Loading…</p>;
  if (!list.data.length)
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <Trophy size={32} className="mx-auto text-amber-500" aria-hidden />
        <p className="mt-2 font-semibold">No tournaments yet</p>
        <p className="text-sm text-slate-600">When the host starts one, the standings appear here.</p>
      </div>
    );
  const shown = list.data.find((t) => t.id === openId) ?? list.data[0];
  return (
    <div className="space-y-4" data-testid="phone-tournaments">
      {list.data.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.data.map((t) => (
            <button key={t.id} onClick={() => setOpenId(t.id)} aria-pressed={t.id === shown.id} className={cx('min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold', t.id === shown.id ? 'bg-blue-700 text-white' : 'bg-white text-slate-700 shadow-sm')}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Trophy size={22} className={shown.status === 'finished' ? 'text-slate-400' : 'text-amber-500'} aria-hidden />
          <h2 className="min-w-0 flex-1 truncate text-xl font-black">{shown.name}</h2>
        </div>
        <p className="text-sm text-slate-600">
          {shown.games} {shown.games === 1 ? 'game' : 'games'} · {shown.scoring === 'placement' ? 'placement points' : 'total score'}
          {shown.status === 'finished' ? ' · final standings' : ''}
        </p>
        {shown.rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No games finished yet.</p>
        ) : (
          <ol className="mt-3 space-y-1.5">
            {shown.rows.map((r) => (
              <li key={`${r.rank}:${r.name}`} className={cx('flex items-center gap-3 rounded-xl px-2 py-2', r.me ? 'bg-blue-50 ring-2 ring-blue-600' : 'bg-slate-50')} data-testid="phone-standing">
                <span className="w-6 text-center text-lg font-black text-slate-500 tabular-nums">{r.rank}</span>
                <Avatar profile={r} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 truncate font-bold">
                    {r.name}
                    {r.rank === 1 && <Crown size={14} className="shrink-0 text-amber-500" aria-label="Leader" />}
                    {r.me && <span className="text-xs font-semibold text-blue-700">(you)</span>}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {r.games} {r.games === 1 ? 'game' : 'games'} · {r.wins} {r.wins === 1 ? 'win' : 'wins'}
                  </span>
                </span>
                <span className="text-lg font-black tabular-nums">{shown.scoring === 'placement' ? `${r.points} pts` : fmtScore(r.points)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
