// Host leaderboard with explicit TV controls (R3-2): "Show Leaderboard on TV" puts the public
// leaderboard on the TV; while it is there, changing the view or metric updates the TV live and
// tapping a player or team shows their public statistics. "Previous page" / "Lobby" return the TV.
// The host's screen stays private: only the server-built public payload reaches the TV.
import { useCallback, useRef } from 'react';
import { ArrowLeft, Monitor, QrCode, Undo2 } from 'lucide-react';
import { present, useLive } from '../../lib/socket';
import { Button, PageTitleBar, cx, toast } from '../../components/ui';
import Leaderboard, { type BoardView } from '../join/Leaderboard';
import { usePresent } from './AppShell';

const TV_PAGES = new Set(['leaderboard', 'player', 'team']);

export function LeaderboardPanel() {
  const status = useLive((s) => s.status);
  const lobbyOpen = useLive((s) => !!s.lobby?.open);
  const hasGame = useLive((s) => !!s.game);
  const phase = useLive((s) => s.game?.phase);
  const tv = useLive((s) => s.presentation);
  const { enabled } = usePresent();
  const playing = phase === 'board' || phase === 'clue' || phase === 'final';
  const canPresent = status === 'open' && (lobbyOpen || hasGame) && !playing;
  const onTv = canPresent && !!tv && TV_PAGES.has(tv.page);
  const selectedId = tv?.page === 'player' ? (tv.player?.profile.id ?? null) : tv?.page === 'team' ? (tv.team?.id ?? null) : null;

  const current = useRef<{ view: BoardView; metric: string }>({ view: 'solo', metric: 'wins' });
  const follow = useRef(false);
  follow.current = onTv || (enabled && canPresent);
  const first = useRef(true);
  const onViewChange = useCallback((view: BoardView, metric: string) => {
    current.current = { view, metric };
    // On opening the page only "Present on TV" mode moves the TV; afterwards the TV follows
    // whenever it is showing the leaderboard.
    const initial = first.current;
    first.current = false;
    if (follow.current && (!initial || enabled)) present({ page: 'leaderboard', view, metric });
  }, [enabled]);

  const showBoard = () => {
    present({ page: 'leaderboard', ...current.current });
    toast('Leaderboard is on the TV');
  };
  const showPlayer = canPresent
    ? (profileId: string) => {
        present({ page: 'player', profileId });
      }
    : undefined;
  const showTeam = canPresent
    ? (teamId: string) => {
        present({ page: 'team', teamId });
      }
    : undefined;

  const tvLabel = tv?.page === 'player' ? (tv.player?.profile.nickname?.trim() || tv.player?.profile.name || 'Player') : tv?.page === 'team' ? (tv.team?.name ?? 'Team') : 'Leaderboard';

  return (
    <div className="space-y-4">
      <div className={cx('flex flex-wrap items-center gap-2 rounded-2xl p-3', onTv ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-white shadow-sm')} data-testid="leaderboard-tv-bar">
        {onTv ? (
          <>
            <span className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-blue-900" data-testid="leaderboard-on-tv">
              <Monitor size={18} aria-hidden /> <span className="truncate">On the TV: {tvLabel}</span>
            </span>
            {tv?.page !== 'leaderboard' && (
              <Button size="sm" variant="secondary" onClick={showBoard} data-testid="tv-show-leaderboard-again">
                <ArrowLeft size={16} aria-hidden /> Leaderboard
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => present({ page: 'lobby', back: true })} data-testid="tv-previous">
              <Undo2 size={16} aria-hidden /> Previous page
            </Button>
            <Button size="sm" variant="secondary" onClick={() => present({ page: 'lobby' })} data-testid="tv-lobby">
              <QrCode size={16} aria-hidden /> Lobby
            </Button>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-sm text-slate-600">
              {canPresent ? 'Show these rankings on the TV. You can keep changing them here.' : playing ? 'During play the TV shows the game.' : 'Open a lobby to show the leaderboard on the TV.'}
            </p>
            <Button onClick={showBoard} disabled={!canPresent} data-testid="show-leaderboard-on-tv">
              <Monitor size={18} aria-hidden /> Show Leaderboard on TV
            </Button>
          </>
        )}
      </div>
      {onTv && <p className="text-xs text-slate-500">Changes appear on the TV straight away. Tap a player or team to show their statistics.</p>}
      <Leaderboard asHost onViewChange={onViewChange} onSelectPlayer={showPlayer} onSelectTeam={showTeam} selectedId={onTv ? selectedId : null} />
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <PageTitleBar title="Leaderboard" subtitle="Solo games, team games, contributions and saved teams are ranked separately." />
      <LeaderboardPanel />
    </div>
  );
}
