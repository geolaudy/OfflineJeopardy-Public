// One navigation order for the game computer, the iPad host and the TV (R4-9). Each screen shows
// the items that make sense on it, always in this relative order.
import type { PresentPage } from './presentation.js';

export type NavId = 'home' | 'boards' | 'players' | 'teams' | 'buzzers' | 'leaderboards' | 'history' | 'tournaments' | 'settings' | 'help';

export interface NavItem {
  id: NavId;
  label: string;
  /** Host app route. */
  path: string;
  /** The public TV page for this item (null = nothing to show on the TV). */
  tv: PresentPage | null;
  /** Label on the TV rail when it differs (the TV's home is the lobby). */
  tvLabel?: string;
}

export const NAV: NavItem[] = [
  { id: 'home', label: 'Home', path: '/host', tv: 'lobby', tvLabel: 'Lobby' },
  { id: 'boards', label: 'Boards', path: '/host/boards', tv: 'boards' },
  { id: 'players', label: 'Players', path: '/host/players', tv: 'players' },
  { id: 'teams', label: 'Teams', path: '/host/teams', tv: 'teams' },
  { id: 'buzzers', label: 'Buzzers', path: '/host/buzzers', tv: 'buzzers' },
  { id: 'leaderboards', label: 'Leaderboards', path: '/host/leaderboard', tv: 'leaderboard' },
  { id: 'history', label: 'History', path: '/host/history', tv: null },
  { id: 'tournaments', label: 'Tournaments', path: '/host/tournaments', tv: null },
  { id: 'settings', label: 'Settings', path: '/host/settings', tv: 'rules' },
  { id: 'help', label: 'Help', path: '/host/help', tv: null },
];
