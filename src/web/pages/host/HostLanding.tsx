// Host home before a lobby exists (R5-2.3, R5-4): the same welcome as the TV home screen, one
// obvious Create Lobby button (straight into lobby management — there is no separate setup
// screen any more), recent games that can be shown on the TV, and saved games to resume.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Crown, History, Monitor, Plus, RotateCcw, Trash2, Users } from 'lucide-react';
import { hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { present as sendPresent, useLive } from '../../lib/socket';
import { ActionButton, Avatar, Button, Card, Modal, cx, fmtScore } from '../../components/ui';
import { shortDate } from '../../components/PersonName';
import type { RecentGameCard } from '../../../shared/presentation';

interface SavedGame {
  id: string;
  title: string;
  mode: string;
  status: string;
  updatedAt: number;
}

export default function HostLanding() {
  const recent = useFetch(() => hostApi<{ recent: RecentGameCard[] }>('GET', '/api/games/recent'), []);
  const saved = useFetch(() => hostApi<{ games: SavedGame[] }>('GET', '/api/games'), []);
  const tvPage = useLive((s) => s.presentation?.page);
  const [open, setOpen] = useState<RecentGameCard | null>(null);
  const resumable = (saved.data?.games ?? []).filter((g) => g.status === 'active');

  const create = async () => {
    await attempt(() => hostApi('POST', '/api/lobby', { game: true }));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6" data-testid="host-home">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-6 text-white shadow-lg sm:p-8">
        <p className="text-sm font-bold tracking-[0.25em] text-amber-300 uppercase">Welcome</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">
          Offline<span className="text-amber-300">Jeopardy</span>
        </h1>
        <p className="mt-2 max-w-xl text-blue-100">The game-show quiz for your living room — on the TV, hosted from this tablet, buzzers on phones and Joy-Cons. No internet needed.</p>
        <ActionButton size="xl" variant="warning" className="mt-6 w-full sm:w-auto sm:min-w-72" onAction={create} data-testid="create-lobby">
          <Plus size={24} aria-hidden /> Create Lobby
        </ActionButton>
        <p className="mt-2 text-sm text-blue-200">Opens the lobby on the TV. You choose the board, players, teams and rules there.</p>
      </section>

      {resumable.length > 0 && (
        <Card className="space-y-2" data-testid="resume-games">
          <h2 className="text-lg font-bold">Continue a game</h2>
          {resumable.map((g) => (
            <div key={g.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{g.title}</div>
                <div className="text-xs text-slate-500">
                  In progress · {g.mode === 'team' ? 'Teams' : 'Individuals'} · {new Date(g.updatedAt).toLocaleString()}
                </div>
              </div>
              <ActionButton size="sm" onAction={() => attempt(async () => (await hostApi('POST', '/api/lobby', {}), hostApi('POST', `/api/games/${g.id}/load`)))} data-testid="resume-game">
                <RotateCcw size={16} aria-hidden /> Resume
              </ActionButton>
              <ActionButton
                size="sm"
                variant="ghost"
                aria-label={`Discard ${g.title}`}
                onAction={async () => {
                  if (!confirm(`Discard "${g.title}"? It will no longer appear here.`)) return;
                  await attempt(() => hostApi('DELETE', `/api/games/${g.id}`));
                  void saved.reload();
                }}
              >
                <Trash2 size={18} aria-hidden />
              </ActionButton>
            </div>
          ))}
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Recent games</h2>
          {tvPage === 'game' && (
            <Button size="sm" variant="secondary" onClick={() => sendPresent({ page: 'lobby' })} data-testid="tv-home">
              <Monitor size={16} aria-hidden /> Back to the home screen on TV
            </Button>
          )}
          <Link to="/host/history" className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-blue-700">
            <History size={16} aria-hidden /> All history
          </Link>
        </div>
        {recent.data?.recent.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.data.recent.map((r) => (
              <RecentCard key={r.id} r={r} onOpen={() => setOpen(r)} />
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-slate-500">{recent.loading ? 'Loading…' : 'No finished games yet — your first game will show up here.'}</p>
          </Card>
        )}
      </section>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.boardTitle ?? ''}>
        {open && (
          <div className="space-y-4">
            <RecentCard r={open} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                size="lg"
                onClick={() => {
                  sendPresent({ page: 'game', gameId: open.id });
                  setOpen(null);
                }}
                data-testid="show-game-on-tv"
              >
                <Monitor size={20} aria-hidden /> Show on TV
              </Button>
              <Link to="/host/history" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-100 font-semibold text-slate-800">
                <History size={18} aria-hidden /> Full details
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** One finished game: board, date, winner (with picture), winning score, number of players. */
export function RecentCard({ r, onOpen }: { r: RecentGameCard; onOpen?: () => void }) {
  const w = r.winners[0];
  const body = (
    <>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{r.boardTitle}</span>
          <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <CalendarDays size={13} aria-hidden /> {shortDate(r.endedAt)}
            {r.practice && <span className="ml-1 rounded bg-violet-100 px-1.5 font-semibold text-violet-800">Practice</span>}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          <Users size={13} aria-hidden /> {r.mode === 'team' ? `${r.teams} teams` : `${r.players + r.bots}`}
        </span>
      </div>
      {w ? (
        <div className="mt-3 flex items-center gap-3">
          <span className="relative">
            <Avatar profile={{ name: w.name, color: w.color, avatar: w.avatar, pictureUrl: w.pictureUrl }} size={44} />
            <Crown size={18} className="absolute -top-2 -right-1 fill-amber-400 text-amber-600" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{r.winners.map((x) => x.name).join(' & ')}</span>
            <span className="block text-sm text-slate-500">{r.winners.length > 1 ? 'Shared win' : 'Winner'}</span>
          </span>
          {r.winningScore != null && <span className="text-lg font-black tabular-nums">{fmtScore(r.winningScore)}</span>}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No winner recorded</p>
      )}
    </>
  );
  return onOpen ? (
    <button onClick={onOpen} className={cx('rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-400 active:scale-[0.99]')} data-testid="recent-game">
      {body}
    </button>
  ) : (
    <div className="rounded-2xl bg-slate-50 p-4" data-testid="recent-game-detail">
      {body}
    </div>
  );
}
