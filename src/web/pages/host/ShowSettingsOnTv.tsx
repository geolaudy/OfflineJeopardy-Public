// "Show settings on TV" (R3-4): puts the read-only public settings page on the TV (the live game's
// rules, or the choices being made before the game exists). Works in Private view too, because the
// host asked for it explicitly.
import { Monitor } from 'lucide-react';
import { present, useLive } from '../../lib/socket';
import { Button, toast } from '../../components/ui';

export function ShowSettingsOnTv({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const status = useLive((s) => s.status);
  const lobbyOpen = useLive((s) => !!s.lobby?.open);
  const hasGame = useLive((s) => !!s.game);
  const phase = useLive((s) => s.game?.phase);
  const onTv = useLive((s) => s.presentation?.page === 'rules');
  const playing = phase === 'board' || phase === 'clue' || phase === 'final';
  const can = status === 'open' && (lobbyOpen || hasGame) && !playing;
  if (!lobbyOpen && !hasGame) return null;
  return (
    <Button
      size={size}
      variant={onTv ? 'primary' : 'secondary'}
      disabled={!can}
      title={playing ? 'During play the TV shows the game' : 'Show these settings on the TV (read-only)'}
      onClick={() => {
        present({ page: 'rules' });
        toast('Settings are on the TV');
      }}
      data-testid="show-settings-on-tv"
    >
      <Monitor size={16} aria-hidden /> {onTv ? 'On the TV' : 'Show on TV'}
    </Button>
  );
}
