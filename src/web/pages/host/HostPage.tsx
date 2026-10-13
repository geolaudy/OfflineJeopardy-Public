// Host controller app (iPad and game computer): authentication gate (pairing code or one-tap
// pairing from the lobby QR), then the shared app shell with the desktop's navigation.
// Home is the game itself: set up → lobby → live game → results.
import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { EllipsisVertical, Monitor, MonitorOff, Pause, Play, Menu as MenuIcon, ArrowLeft, Save, QrCode, SlidersHorizontal, ScrollText, Power, Flag, Repeat } from 'lucide-react';
import { api, ensureLocalHost, hostApi, tokens } from '../../lib/api';
import { connect, disconnect, useLive, act } from '../../lib/socket';
import { Button, Drawer, toast, cx } from '../../components/ui';
import { phaseLabel } from '../../lib/view';
import { attempt } from '../../lib/hooks';
import GamePicker from './GamePicker';
import Setup from './Setup';
import Live from './Live';
import Results from './Results';
import EventLog from './EventLog';
import RulesEditor from './RulesEditor';
import AppShell, { isGameComputer, usePresent } from './AppShell';
import { isDesktopApp } from '../../lib/desktop';
import { reannounce, startInputBridge } from '../../lib/inputBridge';

const Library = lazy(() => import('../desk/Library'));
const BoardEditor = lazy(() => import('../desk/BoardEditor'));
const Players = lazy(() => import('../desk/Players'));
const Teams = lazy(() => import('../desk/Teams'));
const History = lazy(() => import('../desk/History'));
const Settings = lazy(() => import('../desk/Settings'));
const Help = lazy(() => import('../desk/Help'));
const Themes = lazy(() => import('../desk/Themes'));
const ControllersPage = lazy(() => import('../desk/ControllersPage'));

/** Pairing code passed by the lobby QR as a URL fragment (never sent to the server in the URL). */
function readPairFragment(): string | null {
  return /(?:^#|&)pair=(\d{6})/.exec(location.hash)?.[1] ?? null;
}

export default function HostPage() {
  const [auth, setAuth] = useState<'checking' | 'login' | 'ok'>('checking');
  // Read without side effects (a render may run more than once); the code is removed from the
  // address bar after mount so it does not linger in history or bookmarks.
  const [pair] = useState(readPairFragment);
  useEffect(() => {
    if (pair) history.replaceState(null, '', location.pathname + location.search);
  }, [pair]);
  const status = useLive((s) => s.status);

  useEffect(() => {
    (async () => {
      if (await ensureLocalHost()) return setAuth('ok');
      setAuth('login');
    })();
  }, []);

  useEffect(() => {
    if (auth !== 'ok') return;
    connect('host', () => tokens.host);
    return () => disconnect();
  }, [auth]);

  useEffect(() => {
    if (status === 'unauthorized') {
      tokens.host = null;
      disconnect();
      setAuth('login');
    }
  }, [status]);

  useEffect(() => {
    const onErr = (e: Event) => toast((e as CustomEvent).detail, 'error');
    window.addEventListener('oj-error', onErr);
    return () => window.removeEventListener('oj-error', onErr);
  }, []);

  if (auth === 'checking') return <div className="app-screen flex items-center justify-center text-slate-500">Loading…</div>;
  if (auth === 'login') return <HostLogin initialCode={pair} onDone={() => setAuth('ok')} />;
  return <HostApp />;
}

function HostLogin({ onDone, initialCode }: { onDone: () => void; initialCode: string | null }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (c: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string }>('POST', '/api/host/login', { code: c, label: navigator.userAgent.includes('iPad') ? 'iPad' : 'Host device' });
      tokens.host = r.token;
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (initialCode) void submit(initialCode); // scanned the lobby QR: pair in one step
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const press = (d: string) => {
    const next = (code + d).slice(0, 6);
    setCode(next);
    if (next.length === 6) void submit(next);
  };
  return (
    <div className="app-screen scroll-area flex items-center justify-center px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="my-auto w-full max-w-sm rounded-3xl bg-white p-6 shadow-lg">
        <h1 className="text-center text-2xl font-black">Host controller</h1>
        <p className="mt-2 text-center text-slate-600">{busy && initialCode ? 'Pairing with the game computer…' : 'Enter the 6-digit host code shown on the game computer after you create a lobby.'}</p>
        <div className="my-5 flex justify-center gap-2" aria-label={`${code.length} of 6 digits`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={cx('flex h-12 w-10 items-center justify-center rounded-lg border-2 text-xl font-bold', i < code.length ? 'border-blue-700' : 'border-slate-300')}>
              {code[i] ? '•' : ''}
            </span>
          ))}
        </div>
        <p className="mb-2 min-h-5 text-center text-sm font-semibold text-red-700" role="alert">
          {error}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d) =>
            d === '' ? (
              <span key="sp" />
            ) : (
              <button
                key={d}
                disabled={busy}
                onClick={() => (d === '⌫' ? setCode((c) => c.slice(0, -1)) : press(d))}
                className="h-16 rounded-2xl bg-slate-100 text-2xl font-bold active:bg-slate-300"
                aria-label={d === '⌫' ? 'Delete' : d}
              >
                {d}
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function HostApp() {
  const status = useLive((s) => s.status);
  useEffect(() => {
    // When hosting on the game computer itself, this window reads Joy-Cons / gamepads.
    if (status === 'open' && isDesktopApp()) {
      void startInputBridge({ keyboard: false, devices: true });
      reannounce();
    }
  }, [status]);
  return (
    <AppShell>
      <Suspense fallback={<div className="p-6 text-slate-500">Loading…</div>}>
        <Routes>
          <Route index element={<HostHome />} />
          <Route path="boards" element={<Library />} />
          <Route path="boards/:id" element={<BoardEditor />} />
          <Route path="players" element={<Players />} />
          <Route path="teams" element={<Teams />} />
          <Route path="buzzers" element={<ControllersPage />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
          <Route path="themes" element={<Themes />} />
          <Route path="help" element={<Help />} />
          <Route path="*" element={<Navigate to="/host" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

/** Home: the game itself (setup → lobby → live → results) with the game menu. */
function HostHome() {
  const game = useLive((s) => s.game);
  const status = useLive((s) => s.status);
  const ready = useLive((s) => s.ready);
  const lobby = useLive((s) => s.lobby);
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [log, setLog] = useState(false);
  const [rules, setRules] = useState(false);
  const present = usePresent();

  const run = async (a: Parameters<typeof act>[0]) => {
    const r = await act(a);
    if (!r.ok) toast(r.error ?? 'Action failed', 'error');
    return r;
  };

  const switchGame = async () => {
    setMenu(false);
    await attempt(() => hostApi('POST', '/api/games/close'));
  };
  const closeLobby = async () => {
    if (!confirm(game && game.phase !== 'ended' ? 'Close the lobby? The game stays saved and can be resumed later. The TV returns to its start screen.' : 'Close the lobby? The TV returns to its start screen.')) return;
    setMenu(false);
    if (await attempt(() => hostApi('DELETE', '/api/lobby'))) {
      if (isGameComputer()) location.href = '/desk';
      else navigate('/host');
    }
  };
  // Back arrow where it is meaningful: from setup or results back to the list of games.
  const canGoBack = !!game && (game.phase === 'lobby' || game.phase === 'ended');
  const playing = !!game && game.phase !== 'lobby' && game.phase !== 'ended';

  return (
    <div className="flex h-full flex-col">
      {/* Before any game or lobby the setup page has its own title, so this bar would only repeat it. */}
      <header className={cx('shrink-0 border-b border-slate-200 bg-white', ready && !game && !lobby?.open && 'hidden')}>
        <div className="safe-top flex min-h-14 items-center gap-2 px-2 py-1.5">
          {(game || lobby?.open) && (
            <button onClick={present.openNav} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 md:hidden" aria-label="Open navigation" data-testid="app-nav-toggle">
              <MenuIcon size={22} aria-hidden />
            </button>
          )}
          {canGoBack ? (
            <button onClick={switchGame} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100" aria-label="Back to games" data-testid="nav-back">
              <ArrowLeft size={22} aria-hidden />
            </button>
          ) : (
            <span className="w-1" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg leading-tight font-bold">{game?.title ?? (lobby?.open ? `Lobby: ${lobby.name}` : 'Host controller')}</h1>
            <div className="text-sm text-slate-600">{game ? <span data-testid="phase">{phaseLabel(game)}</span> : status === 'open' ? 'Ready' : 'Connecting…'}</div>
          </div>
          {lobby?.open && !present.playing && (
            <button onClick={() => present.setEnabled(!present.enabled)} className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full md:hidden', present.enabled ? 'bg-blue-700 text-white' : 'text-slate-600')} aria-label={present.enabled ? 'Present on TV: on' : 'Present on TV: off'}>
              {present.enabled ? <Monitor size={20} aria-hidden /> : <MonitorOff size={20} aria-hidden />}
            </button>
          )}
          {playing && (
            <Button variant={game.paused ? 'warning' : 'secondary'} onClick={() => run({ type: game.paused ? 'resumeGame' : 'pauseGame' })} aria-label={game.paused ? 'Resume' : 'Pause'}>
              {game.paused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
              <span className="hidden sm:inline">{game.paused ? 'Resume' : 'Pause'}</span>
            </Button>
          )}
          {(game || lobby?.open) && (
            <Button variant="secondary" onClick={() => setMenu(true)} aria-label="Game menu" data-testid="nav-menu">
              <EllipsisVertical size={18} aria-hidden />
              <span className="hidden sm:inline">Menu</span>
            </Button>
          )}
        </div>
      </header>
      <div className="scroll-area min-h-0 flex-1">
        {!ready ? <div className="p-6 text-center text-slate-500">Connecting to the game computer…</div> : !game ? <GamePicker /> : game.phase === 'lobby' ? <Setup g={game} /> : game.phase === 'ended' ? <Results g={game} /> : <Live g={game} run={run} />}
      </div>
      <Drawer
        open={menu}
        onClose={() => setMenu(false)}
        title={
          <div className="min-w-0">
            <div className="truncate font-bold">{game?.title ?? lobby?.name ?? 'Game'}</div>
            <div className="text-xs text-slate-500">{game ? phaseLabel(game) : 'No game yet'}</div>
          </div>
        }
      >
        <div className="grid gap-2">
          {game && (
            <>
              <Button
                variant="secondary"
                size="lg"
                onClick={async () => {
                  const r = await attempt(() => hostApi<{ savedAt: number }>('POST', '/api/games/save'));
                  if (r) toast('Game saved', 'success');
                }}
              >
                <Save size={20} aria-hidden /> Save now <span className="text-sm font-normal text-slate-500">(also saves automatically)</span>
              </Button>
              <Button variant="secondary" size="lg" onClick={() => run({ type: 'showJoinQr', show: !game.showJoinQr })}>
                <QrCode size={20} aria-hidden /> {game.showJoinQr ? 'Hide' : 'Show'} join QR code on TV
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => {
                  setMenu(false);
                  setRules(true);
                }}
              >
                <SlidersHorizontal size={20} aria-hidden /> Rules & timers
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => {
                  setMenu(false);
                  setLog(true);
                }}
              >
                <ScrollText size={20} aria-hidden /> Event history
              </Button>
              {playing && (
                <Button
                  variant="danger"
                  size="lg"
                  onClick={async () => {
                    if (!confirm('End the game now and show the results?')) return;
                    setMenu(false);
                    await run({ type: 'endGame' });
                  }}
                >
                  <Flag size={20} aria-hidden /> End game
                </Button>
              )}
              <Button variant="ghost" size="lg" onClick={switchGame} data-testid="switch-game">
                <Repeat size={20} aria-hidden /> Switch game (this one stays saved)
              </Button>
            </>
          )}
          {lobby?.open && (
            <Button variant="ghost" size="lg" className="text-red-700" onClick={closeLobby} data-testid="close-lobby">
              <Power size={20} aria-hidden /> Close lobby
            </Button>
          )}
        </div>
      </Drawer>
      {game && <EventLog open={log} onClose={() => setLog(false)} g={game} run={run} />}
      {game && <RulesEditor open={rules} onClose={() => setRules(false)} g={game} run={run} />}
    </div>
  );
}
