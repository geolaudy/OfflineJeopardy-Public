// Leaderboard: solo games, team games and individual contributions in team games are separate
// views with explicit ranking criteria — incompatible statistics are never mixed into one ranking.
// Ranking rules live in src/shared/leaderboard.ts (the TV presentation uses the same rules).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { hostApi, meApi } from '../../lib/api';
import { useFetch } from '../../lib/hooks';
import { Avatar, cx } from '../../components/ui';
import { CRITERIA, VIEW_LABELS, formatValue, rankRows, secondaryLine, type LeaderRow, type LeaderView } from '../../../shared/leaderboard';

export type { LeaderRow };

function RowLink({ to, onClick, className, children }: { to: string | null; onClick?: () => void; className: string; children: ReactNode }) {
  if (to)
    return (
      <Link to={to} className={className} data-testid="leaderboard-row">
        {children}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cx(className, 'w-full text-left')} data-testid="leaderboard-row">
        {children}
      </button>
    );
  return (
    <div className={className} data-testid="leaderboard-row">
      {children}
    </div>
  );
}

/** Used by the phone portal (signed-in player) and the host app (asHost; may present on the TV). */
export default function Leaderboard({
  me,
  asHost,
  onViewChange,
  onSelectPlayer,
}: {
  me?: { id: string } | null;
  asHost?: boolean;
  /** Host: called whenever the shown view/metric changes (to mirror it on the TV). */
  onViewChange?: (view: LeaderView, metric: string) => void;
  /** Host: open a player's public stats instead of following a link. */
  onSelectPlayer?: (profileId: string) => void;
}) {
  const lb = useFetch(() => (asHost ? hostApi : meApi)<LeaderRow[]>('GET', '/api/stats/leaderboard'), [asHost]);
  const [view, setView] = useState<LeaderView>('solo');
  const [critKey, setCritKey] = useState('wins');
  const { crit, ranked, unranked, notPlayed } = useMemo(() => rankRows(lb.data ?? [], view, critKey), [lb.data, view, critKey]);
  useEffect(() => onViewChange?.(view, crit.key), [view, crit.key, onViewChange]);

  if (lb.error) return <p className="rounded-2xl bg-white p-4 text-slate-600 shadow-sm">{lb.error}</p>;
  if (!lb.data) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1" role="tablist" aria-label="Leaderboard type">
        {(Object.keys(VIEW_LABELS) as LeaderView[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={view === k}
            onClick={() => {
              setView(k);
              setCritKey(CRITERIA[k][0].key);
            }}
            className={cx('min-h-11 rounded-lg px-1 text-sm font-semibold', view === k ? 'bg-white text-slate-900 shadow' : 'text-slate-600')}
          >
            {VIEW_LABELS[k].label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{VIEW_LABELS[view].hint}</p>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        Ranked by
        <select className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-base" value={crit.key} onChange={(e) => setCritKey(e.target.value)} aria-label="Ranked by">
          {CRITERIA[view].map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {crit.min && <p className="text-xs text-slate-500">Only players with {crit.min.label} are ranked by {crit.label.toLowerCase()}.</p>}

      {ranked.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-600 shadow-sm">No completed {view === 'solo' ? 'solo' : 'team'} games yet.</p>
      ) : (
        <ol className="space-y-2" data-testid="leaderboard">
          {ranked.map(({ r, rank }) => (
            <li key={r.id}>
              <RowLink
                to={asHost ? null : `/join/players/${r.id}`}
                onClick={onSelectPlayer ? () => onSelectPlayer(r.id) : undefined}
                className={cx('flex min-h-16 items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm active:bg-slate-50', r.id === me?.id && 'ring-2 ring-blue-600')}
              >
                <span className={cx('w-8 text-center text-lg font-black tabular-nums', rank === 1 ? 'text-amber-500' : 'text-slate-400')}>{rank}</span>
                <Avatar profile={r} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">
                    {r.nickname?.trim() || r.name}
                    {r.id === me?.id && <span className="ml-1 text-xs font-semibold text-blue-700">(you)</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{secondaryLine(view, r)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-xl font-black tabular-nums">{formatValue(crit.value(r), crit.format)}</span>
                  <span className="block text-[11px] text-slate-500">{crit.label}</span>
                </span>
              </RowLink>
            </li>
          ))}
        </ol>
      )}
      {unranked.length > 0 && (
        <p className="text-sm text-slate-500">
          Not enough games yet: {unranked.map((r) => r.nickname?.trim() || r.name).join(', ')}
        </p>
      )}
      {notPlayed > 0 && <p className="text-xs text-slate-400">{notPlayed} player{notPlayed === 1 ? '' : 's'} with public statistics haven't played this kind of game yet.</p>}
    </div>
  );
}
