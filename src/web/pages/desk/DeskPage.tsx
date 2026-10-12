// Windows desktop dashboard (also usable from any browser with a host session).
import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ensureLocalHost, tokens } from '../../lib/api';
import { connect, disconnect, useLive } from '../../lib/socket';
import { cx } from '../../components/ui';
import { phaseLabel } from '../../lib/view';
import Connect from './Connect';
import { isDesktopApp } from '../../lib/desktop';
import { reannounce, startInputBridge } from '../../lib/inputBridge';

const Library = lazy(() => import('./Library'));
const BoardEditor = lazy(() => import('./BoardEditor'));
const Players = lazy(() => import('./Players'));
const Teams = lazy(() => import('./Teams'));
const History = lazy(() => import('./History'));
const Settings = lazy(() => import('./Settings'));
const Help = lazy(() => import('./Help'));
const ControllersPage = lazy(() => import('./ControllersPage'));

const NAV = [
  ['/desk', '🏠', 'Home', true],
  ['/desk/library', '📚', 'Boards', false],
  ['/desk/players', '🙂', 'Players', false],
  ['/desk/teams', '👥', 'Teams', false],
  ['/desk/controllers', '🎮', 'Buzzers', false],
  ['/desk/history', '🕘', 'History & stats', false],
  ['/desk/settings', '⚙️', 'Settings', false],
  ['/desk/help', '❓', 'Help', false],
] as const;

export default function DeskPage() {
  const [auth, setAuth] = useState<'checking' | 'ok' | 'denied'>('checking');
  const game = useLive((s) => s.game);
  const status = useLive((s) => s.status);
  useEffect(() => {
    // The desktop window is the controller reader (Joy-Cons via WebHID, other gamepads).
    if (status === 'open' && isDesktopApp()) {
      void startInputBridge({ keyboard: false, devices: true });
      reannounce();
    }
  }, [status]);
  useEffect(() => {
    ensureLocalHost().then((ok) => setAuth(ok ? 'ok' : 'denied'));
  }, []);
  useEffect(() => {
    if (auth !== 'ok') return;
    connect('host', () => tokens.host);
    return () => disconnect();
  }, [auth]);

  if (auth === 'checking') return <div className="flex h-full items-center justify-center text-slate-500">Loading…</div>;
  if (auth === 'denied')
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-2 text-slate-600">The dashboard opens on the game computer. From another device, use the host controller instead.</p>
        <a href="/host" className="mt-4 inline-block rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">
          Open host controller
        </a>
      </div>
    );

  return (
    <div className="flex h-full">
      <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-3" aria-label="Main">
        <div className="mb-3 px-2">
          <div className="text-lg font-black">OfflineJeopardy</div>
          {game && <div className="truncate text-xs text-slate-500">▶ {game.title} · {phaseLabel(game)}</div>}
        </div>
        {NAV.map(([to, icon, label, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold', isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50')}>
            <span aria-hidden>{icon}</span>
            {label}
          </NavLink>
        ))}
        <div className="flex-1" />
        <a href="/host" className="flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-3 font-bold text-white hover:bg-blue-800">
          🎛️ Host the game here
        </a>
      </nav>
      <main className="min-w-0 flex-1 overflow-auto">
        <Suspense fallback={<div className="p-6 text-slate-500">Loading…</div>}>
          <Routes>
            <Route index element={<Connect />} />
            <Route path="library" element={<Library />} />
            <Route path="boards/:id" element={<BoardEditor />} />
            <Route path="players" element={<Players />} />
            <Route path="teams" element={<Teams />} />
            <Route path="controllers" element={<ControllersPage />} />
            <Route path="history" element={<History />} />
            <Route path="settings" element={<Settings />} />
            <Route path="help" element={<Help />} />
            <Route path="*" element={<Navigate to="/desk" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
