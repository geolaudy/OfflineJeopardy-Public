import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { Toasts } from './components/ui';
import { isDesktopApp } from './lib/desktop';

const BoardPage = lazy(() => import('./pages/board/BoardPage'));
const BoardPreview = lazy(() => import('./pages/board/Preview'));
const BoardPreviewPage = lazy(() => import('./pages/board/BoardPreview'));
const HostPage = lazy(() => import('./pages/host/HostPage'));
const JoinPage = lazy(() => import('./pages/join/JoinPage'));
const DeskPage = lazy(() => import('./pages/desk/DeskPage'));

function Launcher() {
  if (isDesktopApp()) return <Navigate to="/desk" replace />;
  const links = [
    ['/join', '📱 Player', 'Join a game, buzz, see your stats'],
    ['/host', '🎛️ Host controller', 'Run the game (iPad / tablet)'],
    ['/board', '📺 Game board', 'Show on the TV or projector'],
    ['/desk', '🖥️ Dashboard', 'Boards, players, settings'],
  ];
  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-center text-3xl font-black">OfflineJeopardy</h1>
      <div className="grid gap-3">
        {links.map(([to, title, sub]) => (
          <Link key={to} to={to} className="rounded-2xl bg-white p-4 shadow-sm hover:bg-slate-50">
            <div className="text-xl font-bold">{title}</div>
            <div className="text-slate-600">{sub}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Launcher />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/board/preview" element={<BoardPreview />} />
          <Route path="/board/preview/:id" element={<BoardPreviewPage />} />
          <Route path="/host" element={<HostPage />} />
          <Route path="/join/*" element={<JoinPage />} />
          <Route path="/players" element={<Navigate to="/join" replace />} />
          <Route path="/desk/*" element={<DeskPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toasts />
    </BrowserRouter>
  );
}
