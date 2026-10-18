// Developer tools (R7-31) — only when the server runs with dev tools on (never in a normal
// release): live diagnostics (versions, memory, event-loop delay, every connection's clock sync,
// controllers), a buzzer fairness test with chosen simulated network delays, and a JSON report to
// export (no tokens, PINs, keys, names or addresses — the server leaves them out).
import { useState } from 'react';
import { Download, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, hostApi } from '../../lib/api';
import { useFetch } from '../../lib/hooks';
import { ActionButton, Button, Card, Field, inputCls } from '../../components/ui';

type Jitter = 'low' | 'normal' | 'high';
interface PhoneCfg {
  delayMs: number;
  jitter: Jitter;
  spikes: boolean;
}
interface Summary {
  correctPct: number;
  callablePct: number;
  callable: number;
  waitP50: number;
  waitP99: number;
  falseEarly: number;
  wins: number[];
  truthWins: number[];
}
interface FairnessRun {
  config: unknown;
  result: { devices: string[]; trials: number; arrival: Summary; fair: Summary };
  tookMs: number;
}
interface Diagnostics {
  generatedAt: string;
  app: { version: string; node: string; electron: string | null; platform: string; arch: string; uptimeS: number };
  process: { rssMb: number; heapUsedMb: number; cpus: number; eventLoopDelayMs: { p50: number; p99: number; max: number } };
  game: Record<string, unknown> | null;
  connections: { connection: number; kind: string; controllers: number; clockSync: { synced: boolean; rttMedianMs: number | null; jitterMs: number | null; uncertaintyMs: number | null; samples: number } | null; lobbyDelayShownMs: number | null }[];
  controllers: { controller: number; kind: string; side: string | null; connected: boolean; presses: number; lastInputAgoMs: number | null }[];
}

/** Saves a JSON file in the browser (or the Windows app). */
function saveJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ms = (v: number | null | undefined) => (v == null ? '—' : `${v} ms`);

export default function DevTools() {
  const info = useFetch(() => api<{ devTools?: boolean }>('GET', '/api/info'), []);
  const diag = useFetch(() => (info.data?.devTools ? hostApi<Diagnostics>('GET', '/api/dev/diagnostics') : Promise.resolve(null)), [info.data?.devTools]);
  const [phones, setPhones] = useState<PhoneCfg[]>([
    { delayMs: 3, jitter: 'normal', spikes: false },
    { delayMs: 35, jitter: 'normal', spikes: true },
  ]);
  const [joycons, setJoycons] = useState(0);
  const [spreadMs, setSpread] = useState(80);
  const [trials, setTrials] = useState(400);
  const [seed, setSeed] = useState(1);
  const [mode, setMode] = useState<'standard' | 'generous'>('standard');
  const [run, setRun] = useState<FairnessRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (info.loading) return <div className="p-6">Loading…</div>;
  if (!info.data?.devTools)
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6" data-testid="devtools-off">
        <h1 className="text-3xl font-black">Developer tools</h1>
        <Card>
          <p className="text-slate-700">Developer tools are off. They are not part of normal releases: start the server with <code>--dev-tools</code> (the development server does) or the Windows app with <code>OJ_DEV_TOOLS=1</code>.</p>
        </Card>
      </div>
    );

  const runTest = async () => {
    setError(null);
    try {
      setRun(await hostApi<FairnessRun>('POST', '/api/dev/fairness', { phones, joycons, spreadMs, trials, seed, mode }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const setPhone = (i: number, patch: Partial<PhoneCfg>) => setPhones((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const d = diag.data;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6" data-testid="devtools">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 text-3xl font-black">Developer tools</h1>
        <Button variant="secondary" onClick={() => diag.reload()}>
          <RefreshCw size={18} aria-hidden /> Refresh
        </Button>
        <Button onClick={() => saveJson(`offlinejeopardy-diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, { diagnostics: d, fairnessTest: run })} disabled={!d} data-testid="devtools-export">
          <Download size={18} aria-hidden /> Export report (JSON)
        </Button>
      </div>
      <p className="text-sm text-slate-600">Not part of normal releases. The report holds no tokens, PINs, keys, names or network addresses, so it can be shared.</p>

      <Card className="space-y-3" data-testid="devtools-diagnostics">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 text-lg font-bold">Diagnostics</h2>
          <Button size="sm" variant="ghost" onClick={async () => (await hostApi('POST', '/api/dev/diagnostics/reset'), diag.reload())}>
            Reset event-loop numbers
          </Button>
        </div>
        {!d ? (
          <p>{diag.error ?? 'Loading…'}</p>
        ) : (
          <>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="inline font-semibold">Version: </dt>
                <dd className="inline">
                  {d.app.version} · Node {d.app.node}
                  {d.app.electron ? ` · Electron ${d.app.electron}` : ''}
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold">System: </dt>
                <dd className="inline">
                  {d.app.platform} {d.app.arch} · {d.process.cpus} CPUs · up {Math.round(d.app.uptimeS / 60)} min
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold">Memory: </dt>
                <dd className="inline">
                  {d.process.rssMb} MB ({d.process.heapUsedMb} MB heap)
                </dd>
              </div>
              <div data-testid="devtools-loop">
                <dt className="inline font-semibold">Event-loop delay: </dt>
                <dd className="inline">
                  p50 {ms(d.process.eventLoopDelayMs.p50)} · p99 {ms(d.process.eventLoopDelayMs.p99)} · max {ms(d.process.eventLoopDelayMs.max)}
                </dd>
              </div>
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="devtools-connections">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 pr-3">#</th>
                    <th className="pr-3">Connection</th>
                    <th className="pr-3">Clock sync</th>
                    <th className="pr-3">Round trip</th>
                    <th className="pr-3">Jitter</th>
                    <th className="pr-3">± uncertainty</th>
                    <th className="pr-3">Samples</th>
                    <th>Lobby shows</th>
                  </tr>
                </thead>
                <tbody>
                  {d.connections.map((c) => (
                    <tr key={c.connection} className="border-t border-slate-100">
                      <td className="py-1 pr-3">{c.connection}</td>
                      <td className="pr-3">
                        {c.kind}
                        {c.controllers ? ` (${c.controllers} controllers)` : ''}
                      </td>
                      <td className="pr-3">{c.clockSync ? (c.clockSync.synced ? 'synced' : 'not yet') : '—'}</td>
                      <td className="pr-3">{ms(c.clockSync?.rttMedianMs)}</td>
                      <td className="pr-3">{ms(c.clockSync?.jitterMs)}</td>
                      <td className="pr-3">{ms(c.clockSync?.uncertaintyMs)}</td>
                      <td className="pr-3">{c.clockSync?.samples ?? '—'}</td>
                      <td>{ms(c.lobbyDelayShownMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">Event-loop delay is how late the server's timers run (it delays buzzes when high). On Windows it includes the system timer's ~15 ms granularity — compare changes, not the absolute value.</p>
            {d.controllers.length > 0 && (
              <p className="text-sm text-slate-600">Controllers: {d.controllers.map((c) => `${c.kind}${c.side ? ` (${c.side})` : ''} ${c.connected ? 'connected' : 'off'} · ${c.presses} presses`).join(' · ')}</p>
            )}
          </>
        )}
      </Card>

      <Card className="space-y-3" data-testid="devtools-fairness">
        <h2 className="text-lg font-bold">Buzzer fairness test (simulated)</h2>
        <p className="text-sm text-slate-600">
          Simulated buzzers with the network delays you choose press at known moments; the same clues are decided by plain arrival order and by fair timing (the real clock sync, correction and arbitration code). The live game is not touched, but the server is busy while the test runs, so it is refused during a clue.
        </p>
        <ul className="space-y-2">
          {phones.map((p, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2" data-testid="devtools-phone">
              <span className="w-20 pb-3 font-semibold">Phone {i + 1}</span>
              <Field label="Wi-Fi delay (ms, one way)">
                <input className={inputCls} type="number" min={0} max={300} value={p.delayMs} onChange={(e) => setPhone(i, { delayMs: Number(e.target.value) })} aria-label={`Phone ${i + 1} delay`} />
              </Field>
              <Field label="Jitter">
                <select className={inputCls} value={p.jitter} onChange={(e) => setPhone(i, { jitter: e.target.value as Jitter })}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </Field>
              <label className="flex min-h-11 items-center gap-2 pb-1 text-sm">
                <input type="checkbox" checked={p.spikes} onChange={(e) => setPhone(i, { spikes: e.target.checked })} /> Wi-Fi power-save spikes
              </label>
              <Button variant="ghost" aria-label={`Remove phone ${i + 1}`} onClick={() => setPhones((ps) => ps.filter((_, j) => j !== i))}>
                <Trash2 size={18} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="secondary" disabled={phones.length >= 12} onClick={() => setPhones((ps) => [...ps, { delayMs: 10, jitter: 'normal', spikes: false }])} data-testid="devtools-add-phone">
            <Plus size={18} aria-hidden /> Add a phone
          </Button>
          <Field label="Joy-Cons">
            <input className={inputCls} type="number" min={0} max={8} value={joycons} onChange={(e) => setJoycons(Number(e.target.value))} />
          </Field>
          <Field label="Presses within (ms)">
            <input className={inputCls} type="number" min={0} max={500} value={spreadMs} onChange={(e) => setSpread(Number(e.target.value))} />
          </Field>
          <Field label="Clues">
            <input className={inputCls} type="number" min={10} max={2000} value={trials} onChange={(e) => setTrials(Number(e.target.value))} />
          </Field>
          <Field label="Seed">
            <input className={inputCls} type="number" min={0} value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          </Field>
          <Field label="Fair timing">
            <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as 'standard' | 'generous')}>
              <option value="standard">Standard</option>
              <option value="generous">Slow Wi-Fi</option>
            </select>
          </Field>
          <ActionButton onAction={runTest} data-testid="devtools-run">
            <Play size={18} aria-hidden /> Run test
          </ActionButton>
        </div>
        {error && <p className="text-red-700">{error}</p>}
        {run && <FairnessResult run={run} />}
      </Card>
    </div>
  );
}

function FairnessResult({ run }: { run: FairnessRun }) {
  const { arrival: a, fair: f, devices, trials } = run.result;
  const rows: [string, string, string][] = [
    ['Right winner (all clues)', `${a.correctPct}%`, `${f.correctPct}%`],
    [`Right winner (first two ≥ 25 ms apart, ${f.callable} clues)`, `${a.callablePct}%`, `${f.callablePct}%`],
    ['Extra wait before the winner is known (median / 99%)', `${a.waitP50} / ${a.waitP99} ms`, `${f.waitP50} / ${f.waitP99} ms`],
    ['On-time presses called early', String(a.falseEarly), String(f.falseEarly)],
  ];
  return (
    <div className="space-y-3" data-testid="devtools-result">
      <p className="text-sm text-slate-600">
        {trials} simulated clues in {run.tookMs} ms.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 pr-3" />
              <th className="pr-3">First to arrive</th>
              <th>Fair timing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, x, y]) => (
              <tr key={k} className="border-t border-slate-100">
                <td className="py-1 pr-3 font-semibold">{k}</td>
                <td className="pr-3 tabular-nums">{x}</td>
                <td className="tabular-nums">{y}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 pr-3">Buzzer</th>
              <th className="pr-3">Really first</th>
              <th className="pr-3">Won by arrival</th>
              <th>Won with fair timing</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((name, i) => (
              <tr key={name} className="border-t border-slate-100">
                <td className="py-1 pr-3">{name}</td>
                <td className="pr-3 tabular-nums">{f.truthWins[i]}</td>
                <td className="pr-3 tabular-nums">{a.wins[i]}</td>
                <td className="tabular-nums">{f.wins[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
