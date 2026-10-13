// Head to head (T10): two players side by side and their record against (and with) each other.
// Used on the phone ("Compare with me") and the host's Players page.
import { Swords, Users } from 'lucide-react';
import type { ProfilePublic } from '../../shared/views';
import { profileName } from '../lib/view';
import { Avatar, cx, fmtScore } from './ui';

export interface CompareSide {
  profile: ProfilePublic;
  summary: { games: number; wins: number; accuracy: number | null; bestScore: number | null; avgReactionMs: number | null };
}
export interface CompareData {
  a: CompareSide;
  b: CompareSide;
  h2h: {
    opponents: { games: number; aAhead: number; bAhead: number; tied: number };
    teammates: { games: number; wins: number };
    recent: { gameId: string; title: string; endedAt: number | null; together: boolean; aPlace: number | null; bPlace: number | null; aScore: number; bScore: number; won: 'a' | 'b' | 'both' | 'none' }[];
  };
}

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const secs = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`);

/** One stat row: the better side is highlighted (lower is better for buzz speed). */
function Row({ label, a, b, av, bv, lowerBetter }: { label: string; a: string; b: string; av: number | null; bv: number | null; lowerBetter?: boolean }) {
  const better = av == null || bv == null || av === bv ? null : (lowerBetter ? av < bv : av > bv) ? 'a' : 'b';
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5">
      <span className={cx('text-right tabular-nums', better === 'a' ? 'font-black text-blue-800' : 'text-slate-700')}>{a}</span>
      <span className="text-center text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</span>
      <span className={cx('tabular-nums', better === 'b' ? 'font-black text-blue-800' : 'text-slate-700')}>{b}</span>
    </div>
  );
}

export default function HeadToHead({ d }: { d: CompareData }) {
  const { a, b, h2h } = d;
  const o = h2h.opponents;
  return (
    <div className="space-y-4" data-testid="head-to-head">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <div className="flex flex-col items-center gap-1">
          <Avatar profile={a.profile} size={56} />
          <span className="max-w-full truncate font-bold">{profileName(a.profile)}</span>
        </div>
        <Swords size={28} className="text-slate-400" aria-hidden />
        <div className="flex flex-col items-center gap-1">
          <Avatar profile={b.profile} size={56} />
          <span className="max-w-full truncate font-bold">{profileName(b.profile)}</span>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-900 p-4 text-center text-white" data-testid="h2h-record">
        {o.games ? (
          <>
            <div className="text-xs font-semibold tracking-wide text-slate-300 uppercase">Against each other · {o.games} {o.games === 1 ? 'game' : 'games'}</div>
            <div className="mt-1 flex items-center justify-center gap-4 text-4xl font-black tabular-nums">
              <span>{o.aAhead}</span>
              <span className="text-xl text-slate-400">–</span>
              <span>{o.bAhead}</span>
            </div>
            <div className="text-xs text-slate-300">finished ahead{o.tied ? ` · ${o.tied} tied` : ''}</div>
          </>
        ) : (
          <div className="text-sm text-slate-300">No games against each other yet.</div>
        )}
      </div>
      {h2h.teammates.games > 0 && (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-700">
          <Users size={16} aria-hidden /> Teammates in {h2h.teammates.games} {h2h.teammates.games === 1 ? 'game' : 'games'}, won {h2h.teammates.wins}
        </p>
      )}

      <div className="divide-y divide-slate-100 rounded-2xl bg-white px-3 shadow-sm">
        <Row label="Games" a={String(a.summary.games)} b={String(b.summary.games)} av={a.summary.games} bv={b.summary.games} />
        <Row label="Wins" a={String(a.summary.wins)} b={String(b.summary.wins)} av={a.summary.wins} bv={b.summary.wins} />
        <Row label="Accuracy" a={pct(a.summary.accuracy)} b={pct(b.summary.accuracy)} av={a.summary.accuracy} bv={b.summary.accuracy} />
        <Row label="Best score" a={a.summary.bestScore == null ? '—' : fmtScore(a.summary.bestScore)} b={b.summary.bestScore == null ? '—' : fmtScore(b.summary.bestScore)} av={a.summary.bestScore} bv={b.summary.bestScore} />
        <Row label="Buzz speed" a={secs(a.summary.avgReactionMs)} b={secs(b.summary.avgReactionMs)} av={a.summary.avgReactionMs} bv={b.summary.avgReactionMs} lowerBetter />
      </div>

      {h2h.recent.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-sm font-bold text-slate-600">Recent games together</h3>
          <ul className="space-y-1">
            {h2h.recent.map((r) => (
              <li key={r.gameId} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
                <span className="min-w-0 flex-1 truncate font-semibold">{r.title}</span>
                {r.together ? (
                  <span className="text-slate-600">{r.won === 'both' ? 'Won together' : 'Same team'}</span>
                ) : (
                  <span className="tabular-nums text-slate-600">
                    #{r.aPlace ?? '–'} vs #{r.bPlace ?? '–'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
