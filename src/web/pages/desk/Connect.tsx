// Home: connection info for the iPad host + players, TV window controls, troubleshooting.
import { useEffect, useState } from 'react';
import { api, hostApi } from '../../lib/api';
import { useFetch, attempt } from '../../lib/hooks';
import { Button, Card, QrImage, cx } from '../../components/ui';
import { desktop } from '../../lib/desktop';
import { useLive } from '../../lib/socket';
import { phaseLabel } from '../../lib/view';

interface Info {
  urls: { join: string; host: string; board: string };
  addresses: { name: string; address: string; likelyVirtual: boolean }[];
  baseUrl: string;
  game: { id: string; title: string; phase: string } | null;
  clients: number;
}

export default function Connect() {
  const info = useFetch(() => api<Info>('GET', '/api/info'), []);
  const code = useFetch(() => hostApi<{ code: string }>('GET', '/api/host/pairing-code'), []);
  const [displays, setDisplays] = useState<{ id: number; label: string; primary: boolean }[]>([]);
  const [display, setDisplay] = useState<number | undefined>();
  const game = useLive((s) => s.game);
  const d = desktop();

  useEffect(() => {
    const t = setInterval(() => void info.reload(), 10_000);
    d?.listDisplays().then((list) => {
      setDisplays(list);
      setDisplay(list.find((x) => !x.primary)?.id ?? list[0]?.id);
    });
    return () => clearInterval(t);
  }, []);

  const i = info.data;
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-3xl font-black">Let's play</h1>
        {game && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
            Current game: {game.title} — {phaseLabel(game)}
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">1. Show the board on the TV</h2>
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
              <Button size="lg" className="w-full" onClick={() => d.openBoardWindow({ displayId: display, fullscreen: true })}>
                📺 Open game board
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => d.closeBoardWindow()}>
                Close game board window
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">Open this address in a browser on the TV computer:</p>
              <a href="/board" target="_blank" className="block font-mono text-sm break-all text-blue-700 underline">
                {i?.urls.board}
              </a>
            </>
          )}
          <p className="text-xs text-slate-500">Tip: plug the TV in with HDMI and choose "Extend" in Windows display settings (Win + P).</p>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-bold">2. Connect the host iPad</h2>
          <div className="flex gap-3">
            <QrImage target="host" className="h-32 w-32 shrink-0" />
            <div className="min-w-0 space-y-1 text-sm">
              <p>Scan with the iPad camera, or open in Safari:</p>
              <p className="font-mono break-all text-blue-800">{i?.urls.host}</p>
            </div>
          </div>
          <div className="rounded-xl bg-slate-900 p-3 text-center text-white">
            <div className="text-xs tracking-wide uppercase opacity-80">Host code</div>
            <div className="font-mono text-4xl font-black tracking-[0.3em]" data-testid="pairing-code">
              {code.data?.code ?? '······'}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const r = await attempt(() => hostApi<{ code: string }>('POST', '/api/host/pairing-code'));
                if (r) code.setData(r);
              }}
            >
              New code
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
          <p className="text-xs text-slate-500">The iPad stays signed in, so it can reconnect any time without the code.</p>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-bold">3. Players join</h2>
          <div className="flex gap-3">
            <QrImage target="join" className="h-32 w-32 shrink-0" />
            <div className="min-w-0 space-y-1 text-sm">
              <p>The TV shows this QR code in the lobby. Or open:</p>
              <p className="font-mono break-all text-blue-800">{i?.urls.join}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">Players pick their profile and enter their 4-digit PIN, or create a new profile. Joy-Cons and keyboard keys are assigned in Buzzers.</p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 text-lg font-bold">Network</h2>
        <NetworkInfo info={i} onChange={() => void info.reload()} />
      </Card>
    </div>
  );
}

function NetworkInfo({ info, onChange }: { info: Info | null; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  if (!info) return <p className="text-slate-500">Loading…</p>;
  const current = new URL(info.baseUrl).hostname;
  return (
    <div className="space-y-3 text-sm">
      <p>
        Server address: <b className="font-mono">{info.baseUrl}</b> · {info.clients} device(s) connected
      </p>
      {info.addresses.length === 0 && <p className="font-semibold text-red-700">This computer is not connected to a network. Connect to Wi-Fi or Ethernet so other devices can join.</p>}
      {info.addresses.length > 1 && (
        <div>
          <p className="mb-1 font-semibold">This computer has several network connections. Pick the one your iPad and phones use:</p>
          <div className="flex flex-wrap gap-2">
            {info.addresses.map((a) => (
              <button
                key={a.address}
                onClick={async () => {
                  await attempt(() => hostApi('PUT', '/api/settings', { preferredAddress: a.address }));
                  onChange();
                }}
                className={cx('rounded-lg border-2 px-3 py-2 text-left', a.address === current ? 'border-blue-700 bg-blue-50' : 'border-slate-200')}
              >
                <div className="font-mono font-semibold">{a.address}</div>
                <div className="text-xs text-slate-500">
                  {a.name}
                  {a.likelyVirtual ? ' (virtual)' : ''}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <button className="font-semibold text-blue-700" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} Devices can't connect?
      </button>
      {open && (
        <ol className="list-decimal space-y-1 pl-5 text-slate-700">
          <li>Make sure the iPad and phones are on the same Wi-Fi network as this computer (not a guest network, not mobile data).</li>
          <li>
            Allow OfflineJeopardy through Windows Firewall: when Windows asks, tick <b>Private networks</b> and click Allow. If you missed it: Windows Security → Firewall &amp; network protection → Allow an app through firewall →
            OfflineJeopardy → Private.
          </li>
          <li>Set your Wi-Fi network to "Private" in Windows (Settings → Network &amp; internet → Wi-Fi → your network → Network profile type → Private).</li>
          <li>Some routers block devices from talking to each other ("AP/client isolation" or "guest mode"). Turn it off in the router settings, or use a different network or a phone hotspot.</li>
          <li>Type the address exactly, starting with http:// (not https://).</li>
          <li>No internet is needed — a router without internet works fine.</li>
        </ol>
      )}
    </div>
  );
}
