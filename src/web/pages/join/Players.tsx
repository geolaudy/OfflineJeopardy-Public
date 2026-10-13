// Other players: a directory of profiles and each player's *public* page (statistics + results).
// Never shows PINs, sessions, preferences or other private settings (the API never returns them).
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { meApi } from '../../lib/api';
import { useFetch, useProfiles } from '../../lib/hooks';
import { Avatar, cx, fmtScore } from '../../components/ui';
import { ProfileStats } from '../../components/StatsView';
import { profileName } from '../../lib/view';
import type { ProfilePublic } from '../../../shared/views';
import type { Me } from './JoinPage';
import { Swords } from 'lucide-react';
import HeadToHead, { type CompareData } from '../../components/HeadToHead';

export function PlayersList({ me }: { me: Me }) {
  const profiles = useProfiles();
  const [q, setQ] = useState('');
  const list = (profiles.data ?? []).filter((p) => `${p.name} ${p.nickname}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-3">
      <input className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base" placeholder="Search players" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
      {profiles.error && <p className="text-red-700">{profiles.error}</p>}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm" data-testid="players-list">
        {list.map((p) => (
          <li key={p.id}>
            <Link to={`/join/players/${p.id}`} className="flex min-h-16 items-center gap-3 px-3 py-2 active:bg-slate-50" data-testid="player-row">
              <Avatar profile={p} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{profileName(p)}</span>
                {p.nickname?.trim() && <span className="block truncate text-xs text-slate-500">{p.name}</span>}
              </span>
              {p.id === me.id && <span className="text-xs font-semibold text-blue-700">you</span>}
              <span aria-hidden className="text-slate-400">
                ›
              </span>
            </Link>
          </li>
        ))}
        {profiles.data && list.length === 0 && <li className="p-4 text-center text-slate-500">No players found.</li>}
      </ul>
    </div>
  );
}

interface PlayerPageData {
  profile: ProfilePublic;
  own: boolean;
  stats: unknown;
  history: { id: string; title: string; mode: string; endedAt: number; competitorName: string; kind: string; finalScore: number | null; placement: number | null; isWinner: boolean; competitorCount: number; correct: number; incorrect: number }[];
}

export function PlayerPage({ me }: { me: Me }) {
  const { id = '' } = useParams();
  const profiles = useProfiles();
  const d = useFetch(() => meApi<PlayerPageData>('GET', `/api/stats/profiles/${id}`), [id]);
  const basic = d.data?.profile ?? profiles.data?.find((p) => p.id === id);
  const isPrivate = d.error && /private/i.test(d.error);
  const notFound = d.error && !isPrivate;
  return (
    <div className="space-y-5">
      {basic && (
        <section className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm" data-testid="player-card">
          <Avatar profile={basic} size={72} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-black" data-testid="player-name">
              {profileName(basic)}
            </h2>
            {basic.nickname?.trim() && <p className="truncate text-slate-500">{basic.name}</p>}
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <span className="inline-block h-4 w-4 rounded-full" style={{ background: basic.color }} aria-hidden />
              Player colour
            </p>
          </div>
          {id === me.id && (
            <Link to="/join/profile" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold">
              Edit
            </Link>
          )}
        </section>
      )}
      {d.data && id !== me.id && <CompareWithMe me={me} id={id} />}
      {isPrivate && <p className="rounded-2xl bg-white p-6 text-center text-slate-600 shadow-sm">This player keeps their statistics private.</p>}
      {notFound && <p className="rounded-2xl bg-white p-6 text-center text-slate-600 shadow-sm">{d.error}</p>}
      {!d.data && !d.error && <p className="text-slate-500">Loading…</p>}
      {d.data && (
        <>
          <ProfileStats stats={d.data.stats} />
          <section className="space-y-2">
            <h3 className="font-bold">Recent games</h3>
            {d.data.history.length === 0 ? (
              <p className="text-sm text-slate-500">No completed games yet.</p>
            ) : (
              <ul className="space-y-2">
                {d.data.history.map((h) => {
                  const body = (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-semibold">{h.title}</span>
                        {h.isWinner && <span className="rounded-full bg-yellow-300 px-2 text-xs font-bold">WON</span>}
                      </div>
                      <div className="text-sm text-slate-500">
                        {h.endedAt ? new Date(h.endedAt).toLocaleDateString() : ''} · {h.kind === 'team' ? `Team ${h.competitorName}` : 'Solo'}
                        {h.finalScore != null ? ` · ${fmtScore(h.finalScore)} (#${h.placement} of ${h.competitorCount})` : ''}
                      </div>
                    </>
                  );
                  // Game details are only available for games you played in yourself.
                  return (
                    <li key={h.id}>
                      {d.data!.own ? (
                        <Link to={`/join/history/${h.id}`} className="block rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50">
                          {body}
                        </Link>
                      ) : (
                        <div className={cx('rounded-xl border border-slate-200 bg-white p-3')}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}


/** Head to head with the signed-in player (T10). Loaded only when asked for. */
function CompareWithMe({ me, id }: { me: Me; id: string }) {
  const [open, setOpen] = useState(false);
  const d = useFetch(() => (open ? meApi<CompareData>('GET', `/api/stats/compare?a=${me.id}&b=${id}`) : Promise.resolve(null)), [open, id]);
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 font-bold text-white" data-testid="compare-with-me">
        <Swords size={18} aria-hidden /> Compare with me
      </button>
    );
  if (d.error) return <p className="rounded-2xl bg-white p-4 text-center text-slate-600 shadow-sm">{d.error}</p>;
  return d.data ? <HeadToHead d={d.data} /> : <p className="text-slate-500">Loading…</p>;
}
