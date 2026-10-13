import type { GameView } from '../../../shared/views';
import { act } from '../../lib/socket';
import { hostApi } from '../../lib/api';
import { attempt } from '../../lib/hooks';
import { ActionButton, Avatar, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorName, findCompetitor, profileName } from '../../lib/view';
import { Undo2 } from 'lucide-react';

export default function Results({ g }: { g: GameView }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h2 className="text-3xl font-black">Final results</h2>
      <div className="space-y-2">
        {(g.results ?? []).map((r) => {
          const c = findCompetitor(g, r.competitorId)!;
          return (
            <div key={r.competitorId} className={cx('flex items-center gap-3 rounded-2xl p-3', r.isWinner ? 'bg-yellow-300' : 'bg-white')}>
              <span className="w-10 text-2xl font-black">#{r.placement}</span>
              <Avatar profile={competitorAvatar(c, g)} size={44} />
              <div className="flex-1">
                <div className="text-lg font-bold">{competitorName(c, g)}</div>
                {c.kind === 'team' && (
                  <div className="text-sm text-slate-700">
                    {c.memberIds.map((m) => `${profileName(g.profiles[m])} (${fmtScore(g.contributions?.[m] ?? 0)})`).join(' · ')}
                  </div>
                )}
              </div>
              <span className="text-2xl font-black tabular-nums">{fmtScore(r.score)}</span>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-slate-600">Results, statistics and the full game history are saved. Players can see them in their profile.</p>
      <div className="flex flex-wrap gap-2">
        <ActionButton size="lg" onAction={() => attempt(() => hostApi('POST', '/api/games/close'))}>
          New game
        </ActionButton>
        <ActionButton size="lg" variant="secondary" onAction={async () => (confirm('Re-open the game? The final result will be undone.') ? act({ type: 'undo' }) : undefined)}>
          <Undo2 size={18} aria-hidden /> Undo end of game
        </ActionButton>
      </div>
    </div>
  );
}
