// R12-12: a buzzer test in the lobby lights that player's lobby card (TV, host and phones) yellow
// for about a second. The glow restarts with every press; it never outlives LOBBY_GLOW_MS.
import { useEffect, useState } from 'react';
import { useLive } from './socket';

export const LOBBY_GLOW_MS = 1000;

/** When the card of profile `id` started glowing, while it glows (else null). */
export function useLobbyGlow(id: string | null | undefined): number | null {
  const at = useLive((s) => (id ? s.lobbyGlow[id] : undefined));
  const [, force] = useState(0);
  const on = at != null && Date.now() - at < LOBBY_GLOW_MS;
  useEffect(() => {
    if (!on || at == null) return;
    const t = setTimeout(() => force((x) => x + 1), LOBBY_GLOW_MS - (Date.now() - at) + 20);
    return () => clearTimeout(t);
  }, [at, on]);
  return on ? at : null;
}

/** The glow itself: an overlay inside a positioned card (keyed by the press, so it restarts). */
export function LobbyGlow({ id, className }: { id: string | null | undefined; className?: string }) {
  const at = useLobbyGlow(id);
  if (at == null) return null;
  return <span key={at} className={`lobby-glow${className ? ` ${className}` : ''}`} aria-hidden data-testid="lobby-glow" />;
}
