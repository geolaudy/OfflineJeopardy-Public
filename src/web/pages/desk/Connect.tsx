// Network status and connection troubleshooting (shown on the start screen).
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { hostApi } from '../../lib/api';
import { attempt } from '../../lib/hooks';
import { cx } from '../../components/ui';

export interface Info {
  urls: { join: string; host: string; board: string };
  addresses: { name: string; address: string; likelyVirtual: boolean }[];
  baseUrl: string;
  game: { id: string; title: string; phase: string } | null;
  clients: number;
}

export function NetworkInfo({ info, onChange }: { info: Info | null; onChange: () => void }) {
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
        {open ? <ChevronDown size={16} className="mr-1 inline align-[-3px]" aria-hidden /> : <ChevronRight size={16} className="mr-1 inline align-[-3px]" aria-hidden />}
        Devices can't connect?
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
