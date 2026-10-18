// Host app shell (R2-3, R2-7, R2-8, R2-11): the same navigation and look on the iPad and on the
// game computer, a "Present on TV" switch that mirrors presentable pages on the TV (public data
// only — the server builds it), and a way back to the start screen on the game computer.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CircleHelp, Gamepad2, History as HistoryIcon, House, LayoutGrid, Medal, Trophy, Menu, Monitor, MonitorOff, Settings as SettingsIcon, Users, UsersRound, type LucideIcon } from 'lucide-react';
import { present as sendPresent, useLive } from '../../lib/socket';
import { ConnectionBadge, Drawer, cx } from '../../components/ui';
import { PAGE_LABELS, type PresentRequest } from '../../../shared/presentation';
import { isDesktopApp } from '../../lib/desktop';
import { NAV, type NavId } from '../../../shared/navigation';

const NAV_ICONS: Record<NavId, LucideIcon> = { home: House, boards: LayoutGrid, players: Users, teams: UsersRound, buzzers: Gamepad2, leaderboards: Medal, history: HistoryIcon, tournaments: Trophy, settings: SettingsIcon, help: CircleHelp };

/** Pages below a navigation page and where Back leads (R7-28: no dead ends on small screens). */
const SUB_PAGES: { match: RegExp; title: string; parent: string; parentLabel: string }[] = [
  { match: /^\/host\/themes\/?$/, title: 'TV themes', parent: '/host/settings', parentLabel: 'Settings' },
  { match: /^\/host\/boards\/[^/]+\/?$/, title: 'Board editor', parent: '/host/boards', parentLabel: 'Boards' },
  { match: /^\/host\/tournaments\/[^/]+\/?$/, title: 'Tournament', parent: '/host/tournaments', parentLabel: 'Tournaments' },
];
export const subPageOf = (path: string) => SUB_PAGES.find((p) => p.match.test(path)) ?? null;

/** Host navigation in the shared order (R4-9). */
export const HOST_NAV: { to: string; label: string; icon: LucideIcon; end?: boolean; id: NavId }[] = [
  ...NAV.map((n) => ({ to: n.path, label: n.label, icon: NAV_ICONS[n.id], end: n.id === 'home', id: n.id })),
];

/** Which public page the TV shows for a host page (null = private page: the TV is left alone). */
export function presentationForPath(path: string): PresentRequest | null {
  const p = path.replace(/\/+$/, '') || '/host';
  if (p === '/host') return { page: 'lobby' };
  const m = /^\/host\/boards\/([^/]+)$/.exec(p);
  if (m && m[1] !== 'new') return { page: 'board', boardId: m[1] };
  if (p === '/host/boards') return { page: 'boards' };
  if (p === '/host/players') return { page: 'players' };
  if (p === '/host/teams') return { page: 'teams' };
  if (p === '/host/buzzers') return { page: 'buzzers' };
  if (p === '/host/settings') return { page: 'rules' };
  if (p === '/host/leaderboard') return { page: 'leaderboard' };
  const t = /^\/host\/tournaments\/([^/]+)$/.exec(p);
  if (t) return { page: 'tournament', tournamentId: t[1] };
  return null; // history (until the leaderboard tab is chosen), themes, help…
}

interface PresentCtx {
  /** The TV follows this host's navigation. */
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  /** Present a specific public page (e.g. a selected player) — only when enabled. */
  show: (req: PresentRequest) => void;
  /** Open the navigation drawer (narrow screens). */
  openNav: () => void;
  /** The TV is showing the game, so presenting is paused. */
  playing: boolean;
}
const Ctx = createContext<PresentCtx>({ enabled: false, setEnabled: () => {}, show: () => {}, openNav: () => {}, playing: false });
export const usePresent = () => useContext(Ctx);

const KEY = 'oj.presentOnTv';
function readPref(): boolean | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v == null ? null : v === '1';
  } catch {
    return null;
  }
}

/** Show the game computer's start screen link only where it exists (this PC). */
export const isGameComputer = () => isDesktopApp() || ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const status = useLive((s) => s.status);
  const lobby = useLive((s) => s.lobby);
  const phase = useLive((s) => s.game?.phase);
  const tvPage = useLive((s) => s.presentation?.page);
  const [menu, setMenu] = useState(false);
  const [pref, setPref] = useState<boolean | null>(readPref);
  // Default: present while a lobby is open (the intuitive behaviour for lobby hosting).
  const enabled = pref ?? !!lobby?.open;
  const playing = phase === 'board' || phase === 'clue' || phase === 'final';
  const setEnabled = useCallback((v: boolean) => {
    setPref(v);
    try {
      sessionStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      /* private mode */
    }
  }, []);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled && !playing;
  const show = useCallback((req: PresentRequest) => {
    if (enabledRef.current) sendPresent(req);
  }, []);

  // A new page starts at its top (R7-19: switching tabs never leaves the content scrolled).
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  // Navigation drives the TV while presenting (private pages leave it unchanged).
  useEffect(() => {
    setMenu(false);
    if (!enabled || playing || status !== 'open') return;
    const req = presentationForPath(location.pathname);
    if (req) sendPresent(req);
  }, [location.pathname, enabled, playing, status]);

  const openNav = useCallback(() => setMenu(true), []);
  const ctx = useMemo(() => ({ enabled, setEnabled, show, openNav, playing }), [enabled, setEnabled, show, openNav, playing]);
  // On Home with a game or lobby, the game bar carries the navigation button: one bar, not two (small phones).
  const hasGame = useLive((s) => !!s.game);
  const homeBar = (location.pathname === '/host' || location.pathname === '/host/') && (hasGame || !!lobby?.open);
  const sub = subPageOf(location.pathname);
  const navigate = useNavigate();
  const current = sub?.title ?? HOST_NAV.find((n) => (n.end ? location.pathname === n.to || location.pathname === `${n.to}/` : location.pathname.startsWith(n.to)))?.label ?? 'Host';

  const nav = (
    <ul className="space-y-1">
      {HOST_NAV.map(({ to, label, icon: Icon, end, id }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            data-testid={`hostnav-${id === 'leaderboards' ? 'leaderboard' : label.toLowerCase()}`}
            className={({ isActive }) => cx('flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold', isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50')}
          >
            <Icon size={20} strokeWidth={1.9} aria-hidden />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  );

  const presentSwitch = lobby?.open ? (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => setEnabled(!enabled)}
      disabled={playing}
      title={playing ? 'During play the TV shows the game' : enabled ? 'The TV follows what you open here' : 'Browse privately — the TV stays as it is'}
      className={cx('flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold disabled:opacity-50', enabled ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700')}
      data-testid="present-toggle"
    >
      {enabled ? <Monitor size={20} aria-hidden /> : <MonitorOff size={20} aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-tight">{enabled ? 'Present on TV' : 'Private view'}</span>
        <span className={cx('block text-xs font-normal', enabled ? 'text-blue-100' : 'text-slate-500')}>{playing ? 'TV shows the game' : `TV: ${tvPage ? PAGE_LABELS[tvPage] : 'Lobby'}`}</span>
      </span>
    </button>
  ) : null;

  const footer = (
    <div className="space-y-2">
      {presentSwitch}
      {isGameComputer() && (
        <a href="/desk" className="flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold text-slate-700 hover:bg-slate-50" data-testid="back-to-start">
          <ArrowLeft size={20} aria-hidden /> Back to start
        </a>
      )}
      <div className="px-3">
        <ConnectionBadge status={status} />
      </div>
    </div>
  );

  return (
    <Ctx.Provider value={ctx}>
      <div className="app-screen flex flex-col bg-slate-100 lg:flex-row">
        {/* Narrow screens: top bar + drawer. */}
        <header className={cx('safe-top safe-x flex min-h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 lg:hidden', homeBar && 'hidden')}>
          {sub && (
            <button onClick={() => navigate(sub.parent)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-100" aria-label={`Back to ${sub.parentLabel}`} data-testid="app-back">
              <ArrowLeft size={22} aria-hidden />
            </button>
          )}
          <button onClick={() => setMenu(true)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-100" aria-label="Open navigation" data-testid="app-nav-toggle">
            <Menu size={22} aria-hidden />
          </button>
          <span className="min-w-0 flex-1 truncate text-lg font-bold">{current}</span>
          {lobby?.open && (
            <button onClick={() => setEnabled(!enabled)} disabled={playing} className={cx('flex h-11 w-11 items-center justify-center rounded-full', enabled ? 'bg-blue-700 text-white' : 'text-slate-600')} aria-label={enabled ? 'Present on TV: on' : 'Present on TV: off'}>
              {enabled ? <Monitor size={20} aria-hidden /> : <MonitorOff size={20} aria-hidden />}
            </button>
          )}
        </header>
        <nav className="safe-top hidden w-60 shrink-0 flex-col gap-3 border-r border-slate-200 bg-white p-3 lg:flex" aria-label="Host navigation" style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))' }}>
          <div className="px-2">
            <div className="text-lg font-black">OfflineJeopardy</div>
            <div className="truncate text-xs text-slate-500" data-testid="lobby-status">
              {lobby?.open ? `Lobby: ${lobby.name}` : 'No lobby open'}
            </div>
          </div>
          <div className="scroll-area min-h-0 flex-1">{nav}</div>
          {footer}
        </nav>
        <Drawer open={menu} onClose={() => setMenu(false)} title={<span className="font-black">OfflineJeopardy</span>}>
          <div className="flex h-full flex-col gap-4">
            {nav}
            <div className="mt-auto">{footer}</div>
          </div>
        </Drawer>
        <main ref={mainRef} className="scroll-area safe-x relative min-h-0 min-w-0 flex-1">{children}</main>
      </div>
    </Ctx.Provider>
  );
}
