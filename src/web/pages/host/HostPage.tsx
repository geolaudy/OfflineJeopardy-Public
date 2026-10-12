// iPad host controller: authentication gate, game picker, setup, live control.
import { useEffect, useState } from 'react';
import { api, ensureLocalHost, hostApi, tokens } from '../../lib/api';
import { connect, disconnect, useLive, act } from '../../lib/socket';
import { Button, ConnectionBadge, Modal, toast, cx } from '../../components/ui';
import { phaseLabel } from '../../lib/view';
import { attempt } from '../../lib/hooks';
import GamePicker from './GamePicker';
import Setup from './Setup';
import Live from './Live';
import Results from './Results';
import EventLog from './EventLog';
import RulesEditor from './RulesEditor';
import { isDesktopApp } from '../../lib/desktop';
import { reannounce, startInputBridge } from '../../lib/inputBridge';

export default function HostPage() {
  const [auth, setAuth] = useState<'checking' | 'login' | 'ok'>('checking');
  const status = useLive((s) => s.status);

  useEffect(() => {
    (async () => {
      setAuth((await ensureLocalHost()) ? 'ok' : 'login');
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

  if (auth === 'checking') return <div className="flex h-full items-center justify-center text-slate-500">Loading…</div>;
  if (auth === 'login') return <HostLogin onDone={() => setAuth('ok')} />;
  return <HostShell />;
}

function HostLogin({ onDone }: { onDone: () => void }) {
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
  const press = (d: string) => {
    const next = (code + d).slice(0, 6);
    setCode(next);
    if (next.length === 6) void submit(next);
  };
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-lg">
        <h1 className="text-center text-2xl font-black">Host controller</h1>
        <p className="mt-2 text-center text-slate-600">Enter the 6-digit host code shown on the game computer (Dashboard → Connect).</p>
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

function HostShell() {
  const game = useLive((s) => s.game);
  const status = useLive((s) => s.status);
  const ready = useLive((s) => s.ready);
  const [menu, setMenu] = useState(false);
  const [log, setLog] = useState(false);
  const [rules, setRules] = useState(false);

  useEffect(() => {
    // When hosting on the game computer itself, this window reads Joy-Cons / gamepads.
    if (status === 'open' && isDesktopApp()) {
      void startInputBridge({ keyboard: false, devices: true });
      reannounce();
    }
  }, [status]);

  const run = async (a: Parameters<typeof act>[0]) => {
    const r = await act(a);
    if (!r.ok) toast(r.error ?? 'Action failed', 'error');
    return r;
  };

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">{game?.title ?? 'OfflineJeopardy'}</div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <ConnectionBadge status={status} />
            {game && <span data-testid="phase">{phaseLabel(game)}</span>}
          </div>
        </div>
        {game && game.phase !== 'lobby' && game.phase !== 'ended' && (
          <Button variant={game.paused ? 'warning' : 'secondary'} onClick={() => run({ type: game.paused ? 'resumeGame' : 'pauseGame' })}>
            {game.paused ? '▶ Resume' : '❚❚ Pause'}
          </Button>
        )}
        {game && (
          <Button variant="secondary" onClick={() => setMenu(true)} aria-label="Game menu">
            ☰ Menu
          </Button>
        )}
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        {!ready ? <div className="p-6 text-center text-slate-500">Connecting to the game computer…</div> : !game ? <GamePicker /> : game.phase === 'lobby' ? <Setup g={game} /> : game.phase === 'ended' ? <Results g={game} /> : <Live g={game} run={run} />}
      </main>
      {game && (
        <Modal open={menu} onClose={() => setMenu(false)} title="Game menu">
          <div className="grid gap-2">
            <Button
              variant="secondary"
              size="lg"
              onClick={async () => {
                const r = await attempt(() => hostApi<{ savedAt: number }>('POST', '/api/games/save'));
                if (r) toast('Game saved', 'success');
              }}
            >
              💾 Save now <span className="text-sm font-normal text-slate-500">(also saves automatically)</span>
            </Button>
            <Button variant="secondary" size="lg" onClick={() => run({ type: 'showJoinQr', show: !game.showJoinQr })}>
              {game.showJoinQr ? 'Hide' : 'Show'} join QR code on TV
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                setMenu(false);
                setRules(true);
              }}
            >
              ⚙ Rules & timers
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                setMenu(false);
                setLog(true);
              }}
            >
              📜 Event history
            </Button>
            {game.phase !== 'lobby' && game.phase !== 'ended' && (
              <Button
                variant="danger"
                size="lg"
                onClick={async () => {
                  if (!confirm('End the game now and show the results?')) return;
                  setMenu(false);
                  await run({ type: 'endGame' });
                }}
              >
                End game
              </Button>
            )}
            <Button
              variant="ghost"
              size="lg"
              onClick={async () => {
                setMenu(false);
                await attempt(() => hostApi('POST', '/api/games/close'));
              }}
            >
              Switch game (this one stays saved)
            </Button>
          </div>
        </Modal>
      )}
      {game && <EventLog open={log} onClose={() => setLog(false)} g={game} run={run} />}
      {game && <RulesEditor open={rules} onClose={() => setRules(false)} g={game} run={run} />}
    </div>
  );
}
