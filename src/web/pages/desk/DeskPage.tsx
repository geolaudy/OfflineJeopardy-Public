// Game computer start screen (R2-1/R2-2): Create lobby (primary), Resume, Settings, Help.
// After creating a lobby it shows the host pairing QR + temporary code, the host connection
// status and the TV window controls. Everything else lives in the host app (/host/*), which looks
// and works the same here and on the iPad.
import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { CircleHelp, History as HistoryIcon, LayoutGrid, Monitor, MonitorX, Play, Power, RefreshCw, Settings as SettingsIcon, Smartphone, Tablet, Wifi } from 'lucide-react';
import { api, ensureLocalHost, hostApi, tokens } from '../../lib/api';
import { connect, disconnect, useLive } from '../../lib/socket';
import { ActionButton, Button, Card, QrImage, cx } from '../../components/ui';
import { attempt, useFetch } from '../../lib/hooks';
import { phaseLabel } from '../../lib/view';
import { desktop } from '../../lib/desktop';
import { NetworkInfo, type Info } from './Connect';

/** Old dashboard addresses keep working: they now open the matching host page. */
const LEGACY: Record<string, string> = { library: 'boards', controllers: 'buzzers', history: 'history', players: 'players', teams: 'teams', themes: 'themes', settings: 'settings', help: 'help' };
function LegacyRedirect() {
  const { '*': rest = '' } = useParams();
  const [head, ...tail] = rest.split('/');
  const target = head === 'boards' ? `boards/${tail.join('/')}` : LEGACY[head];
  return <Navigate to={target ? `/host/${target}` : '/desk'} replace />;
}

export default function DeskPage() {
  return (
    <Routes>
      <Route index element={<StartScreen />} />
      <Route path="*" element={<LegacyRedirect />} />
    </Routes>
  );
}

function StartScreen() {
  const [auth, setAuth] = useState<'checking' | 'ok' | 'denied'>('checking');
  useEffect(() => {
    ensureLocalHost().then((ok) => setAuth(ok ? 'ok' : 'denied'));
  }, []);
  useEffect(() => {
    if (auth !== 'ok') return;
    // An observer connection: this screen is not a host controller (the lobby's "host connected"
    // status counts only real host controllers).
    connect('host', () => tokens.host, { observer: true });
    return () => disconnect();
  }, [auth]);

  if (auth === 'checking') return <div className="app-screen flex items-center justify-center text-slate-500">Loading…</div>;
  if (auth === 'denied')
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">Start screen</h1>
        <p className="mt-2 text-slate-600">This screen opens on the game computer. From another device, use the host controller instead.</p>
        <a href="/host" className="mt-4 inline-block rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">
          Open host controller
        </a>
      </div>
    );
  return <Start />;
}

function Start() {
  const lobby = useLive((s) => s.lobby);
  const ready = useLive((s) => s.ready);
  const game = useLive((s) => s.game);
  const navigate = useNavigate();
  const info = useFetch(() => api<Info>('GET', '/api/info'), []);
  const saved = useFetch(() => hostApi<{ games: { id: string }[] }>('GET', '/api/games'), []);
  const [showNet, setShowNet] = useState(false);
  const d = desktop();

  const create = async () => {
    const r = await attempt(() => hostApi('POST', '/api/lobby', {}));
    // The TV window opens with the lobby (on the second screen when there is one).
    if (r && d) {
      const list = await d.listDisplays();
      await d.openBoardWindow({ displayId: list.find((x) => !x.primary)?.id ?? list[0]?.id, fullscreen: list.length > 1 });
    }
  };

  return (
    <div className="app-screen scroll-area bg-slate-100">
      <div className="safe-x mx-auto flex min-h-full max-w-5xl flex-col gap-6 p-6">
        <header className="flex items-center gap-3">
          <h1 className="flex-1 text-3xl font-black tracking-tight">OfflineJeopardy</h1>
          <button onClick={() => setShowNet((v) => !v)} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-white" aria-expanded={showNet}>
            <Wifi size={18} aria-hidden /> Network
          </button>
        </header>
        {showNet && (
          <Card>
            <NetworkInfo info={info.data} onChange={() => void info.reload()} />
          </Card>
        )}

        {!ready ? (
          <p className="text-slate-500">Starting…</p>
        ) : lobby?.open ? (
          <LobbyOpen name={lobby.name} hostConnected={lobby.hostConnected} gameLine={game ? `${game.title} — ${phaseLabel(game)}` : null} />
        ) : (
          <>
            <section className="grid flex-1 content-center gap-6 py-6 md:grid-cols-[1.3fr_1fr]">
              <div className="space-y-4">
                <h2 className="text-4xl leading-tight font-black">Ready to play?</h2>
                <p className="max-w-md text-lg text-slate-600">Create a lobby, then connect your iPad as the host controller. Players join on their phones by scanning the code on the TV.</p>
                <ActionButton size="xl" onAction={create} data-testid="create-lobby" className="min-w-64">
                  <Play size={24} aria-hidden /> Create lobby
                </ActionButton>
              </div>
              <nav className="grid content-center gap-3" aria-label="More">
                <Tile icon={HistoryIcon} title="Resume a game" sub={saved.data?.games.length ? `${saved.data.games.length} unfinished` : 'Continue where you left off'} onClick={() => navigate('/host')} testid="start-resume" />
                <Tile icon={LayoutGrid} title="Boards" sub="Create, edit and import boards" onClick={() => navigate('/host/boards')} testid="start-boards" />
                <Tile icon={SettingsIcon} title="Settings" sub="Sounds, themes, backups" onClick={() => navigate('/host/settings')} testid="start-settings" />
                <Tile icon={CircleHelp} title="Help" sub="How to play and connect devices" onClick={() => navigate('/host/help')} testid="start-help" />
              </nav>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ icon: Icon, title, sub, onClick, testid }: { icon: typeof Play; title: string; sub: string; onClick: () => void; testid: string }) {
  return (
    <button onClick={onClick} className="flex min-h-16 items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-sm hover:bg-slate-50" data-testid={testid}>
      <Icon size={26} strokeWidth={1.8} className="shrink-0 text-blue-700" aria-hidden />
      <span className="min-w-0">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-slate-500">{sub}</span>
      </span>
    </button>
  );
}

function LobbyOpen({ name, hostConnected, gameLine }: { name: string; hostConnected: boolean; gameLine: string | null }) {
  const code = useFetch(() => hostApi<{ pairingCode: string | null; hostUrl: string }>('GET', '/api/lobby'), []);
  const [displays, setDisplays] = useState<{ id: number; label: string; primary: boolean }[]>([]);
  const [display, setDisplay] = useState<number | undefined>();
  const d = desktop();
  useEffect(() => {
    d?.listDisplays().then((list) => {
      setDisplays(list);
      setDisplay(list.find((x) => !x.primary)?.id ?? list[0]?.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pairing = code.data?.pairingCode;

  const close = async () => {
    if (!confirm('Close the lobby? Any game in progress stays saved and can be resumed later.')) return;
    await attempt(() => hostApi('DELETE', '/api/lobby'));
    await d?.closeBoardWindow();
  };

  return (
    <section className="space-y-5" data-testid="lobby-open">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold tracking-wide text-green-700 uppercase">Lobby open</div>
          <h2 className="truncate text-3xl font-black">{name}</h2>
          {gameLine && <div className="text-slate-600">{gameLine}</div>}
        </div>
        <Button variant="secondary" onClick={close} data-testid="start-close-lobby">
          <Power size={18} aria-hidden /> Close lobby
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <Tablet size={22} className="text-blue-700" aria-hidden />
            <h3 className="flex-1 text-lg font-bold">Connect the host</h3>
            <span className={cx('flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold', hostConnected ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900')} data-testid="host-status">
              <span className={cx('h-2 w-2 rounded-full', hostConnected ? 'bg-green-600' : 'bg-amber-500')} aria-hidden />
              {hostConnected ? 'Host connected' : 'Waiting for the host'}
            </span>
          </div>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <QrImage target="hostPair" refreshKey={pairing} className="h-48 w-48 shrink-0 rounded-xl p-2 shadow-inner" />
            <div className="min-w-0 space-y-3">
              <p className="text-slate-700">Scan with the iPad camera to open the host controller and pair it in one step.</p>
              <div>
                <div className="text-sm text-slate-500">
                  Or open <span className="font-mono">{code.data?.hostUrl ?? '…/host'}</span> and enter
                </div>
                <div className="font-mono text-5xl font-black tracking-[0.25em]" data-testid="pairing-code">
                  {pairing ?? '······'}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const r = await attempt(() => hostApi<{ code: string }>('POST', '/api/host/pairing-code'));
                    if (r) void code.reload();
                  }}
                >
                  <RefreshCw size={16} aria-hidden /> New code
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!confirm('Sign out every paired host device? They will need the new host code.')) return;
                    await attempt(() => hostApi('POST', '/api/host/revoke-devices'), 'Host devices signed out');
                    void code.reload();
                  }}
                >
                  Sign out host devices
                </Button>
              </div>
              <p className="text-xs text-slate-500">The code works only while this lobby is open. A paired iPad stays signed in and reconnects by itself.</p>
            </div>
          </div>
          <Link to="/host" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 font-bold text-white hover:bg-blue-800" data-testid="host-here">
            Host on this computer instead
          </Link>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="flex items-center gap-2">
              <Monitor size={22} className="text-blue-700" aria-hidden />
              <h3 className="text-lg font-bold">TV</h3>
            </div>
            {d ? (
              <>
                {displays.length > 1 && (
                  <label className="block text-sm font-semibold text-slate-700">
                    Screen
                    <select className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" value={display} onChange={(e) => setDisplay(Number(e.target.value))}>
                      {displays.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                          {x.primary ? ' (this screen)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => d.openBoardWindow({ displayId: display, fullscreen: true })}>
                    <Monitor size={18} aria-hidden /> Show on TV
                  </Button>
                  <Button variant="ghost" onClick={() => d.closeBoardWindow()} aria-label="Close the TV window">
                    <MonitorX size={18} aria-hidden />
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-600">
                Open{' '}
                <a href="/board" target="_blank" className="font-mono text-blue-700 underline">
                  /board
                </a>{' '}
                in a browser on the TV computer.
              </p>
            )}
            <p className="text-xs text-slate-500">Tip: connect the TV with HDMI and choose "Extend" (Win + P).</p>
          </Card>
          <Card className="space-y-2">
            <div className="flex items-center gap-2">
              <Smartphone size={22} className="text-blue-700" aria-hidden />
              <h3 className="text-lg font-bold">Players</h3>
            </div>
            <p className="text-sm text-slate-600">The TV shows a QR code for players. Joy-Cons and keyboard keys are assigned from the host's Buzzers page.</p>
          </Card>
        </div>
      </div>
    </section>
  );
}
