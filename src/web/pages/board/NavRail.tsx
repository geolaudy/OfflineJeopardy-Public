// Public navigation rail (R2-10): which public page the TV is showing. Presentation only — the
// host drives it from the iPad; nobody touches the TV.
import { motion } from 'motion/react';
import { Gamepad2, LayoutGrid, QrCode, ScrollText, Shield, Trophy, Users, type LucideIcon } from 'lucide-react';
import type { PresentPage } from '../../../shared/presentation';
import { NAV } from '../../../shared/navigation';
import { cx } from '../../components/ui';
import { EASE_MORPH_ARR, T } from './timing';

const ICONS: Partial<Record<PresentPage, LucideIcon>> = { lobby: QrCode, boards: LayoutGrid, players: Users, teams: Shield, buzzers: Gamepad2, leaderboard: Trophy, rules: ScrollText };
/** Same order as the host navigation (shared/navigation.ts, R4-9). */
const ITEMS: { id: PresentPage; label: string; icon: LucideIcon }[] = NAV.filter((n) => n.tv).map((n) => ({ id: n.tv!, label: n.tvLabel ?? n.label, icon: ICONS[n.tv!] ?? QrCode }));

/** The rail entry a page belongs to (a single player is part of Players, a board of Boards). */
export const railPage = (p: PresentPage): PresentPage => (p === 'player' ? 'players' : p === 'board' ? 'boards' : p === 'tournament' ? 'leaderboard' : p === 'team' ? 'teams' : p === 'compare' ? 'players' : p);

export function NavRail({ page }: { page: PresentPage }) {
  const current = railPage(page);
  return (
    <nav className="tvp-rail" aria-label="Now showing" data-testid="tv-nav-rail">
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const on = id === current;
        return (
          <div key={id} className={cx('tvp-rail-item', on && 'is-on')} aria-current={on ? 'page' : undefined}>
            {on && <motion.span layoutId="tv-rail-on" className="tvp-rail-pill" transition={{ duration: T.rail, ease: EASE_MORPH_ARR }} />}
            <Icon className="tvp-rail-icon" strokeWidth={2} aria-hidden />
            <span className="tvp-rail-label">{label}</span>
          </div>
        );
      })}
    </nav>
  );
}

export function Wordmark() {
  return (
    <div className="tvp-brand" aria-label="OfflineJeopardy">
      Offline<span>Jeopardy</span>
    </div>
  );
}
