// Category-introduction performance probe (R6-15). Starts a fresh local server on its own port,
// opens the TV page in Chromium at 1920×1080, plays the round introduction step by step through the
// host socket and measures each swipe:
//   - frame pacing from requestAnimationFrame (avg fps, p95 frame time, frames > 25 ms = dropped),
//   - long main-thread tasks (PerformanceObserver "longtask"),
//   - paint / raster / layout / style cost and counts from a Chrome trace,
//   - DOM mutations during the swipe (a proxy for re-render churn).
// Usage: npm run build:web && node scripts/perf-intro.mjs [--cpu=4] [--label=before] [--headed]
// --cpu throttles the CPU like DevTools (4 = a slow PC / TV box). Results: printed + JSON in
// test-results/perf-intro-<label>.json. Headless Chromium uses software compositing, so absolute
// numbers are pessimistic; compare runs on the same machine.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { chromium, request } from '@playwright/test';
import WebSocket from 'ws';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const CPU = Number(arg('cpu', '1'));
const LABEL = arg('label', 'run');
const HEADED = process.argv.includes('--headed');
const PORT = Number(arg('port', '3299'));
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = `test-results/perf-data-${PORT}`;

rmSync(DATA, { recursive: true, force: true });
mkdirSync('test-results', { recursive: true });
const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server/cli.ts', `--data=${DATA}`, `--port=${PORT}`, '--fresh'], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

async function waitUp() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/info`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}

async function hostSocket(token) {
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)));
  let state = null;
  const pending = new Map();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'state') state = m.game;
    if (m.t === 'result') pending.get(m.id)?.(m);
  });
  ws.send(JSON.stringify({ t: 'hello', role: 'host', token }));
  let id = 1;
  const act = (action) =>
    new Promise((res, rej) => {
      const n = id++;
      pending.set(n, (m) => (m.ok ? res(m) : rej(new Error(`${action.type}: ${m.error}`))));
      ws.send(JSON.stringify({ t: 'host', id: n, action }));
    });
  const until = async (pred) => {
    for (let i = 0; i < 200 && !(state && pred(state)); i++) await new Promise((r) => setTimeout(r, 25));
    return state;
  };
  return { act, until, close: () => ws.close() };
}

const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0);

await waitUp();
const api = await request.newContext({ baseURL: BASE });
const token = (await (await api.post('/api/host/local-login')).json()).token;
const H = { authorization: `Bearer ${token}` };
await api.post('/api/lobby', { headers: H, data: { name: 'Perf night' } });
const boards = await (await api.get('/api/boards', { headers: H })).json();
await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night').id, mode: 'solo' } });
const h = await hostSocket(token);
await h.until((g) => !!g);
// A full lobby: 8 players (the scoreboard renders under the intro).
for (let i = 0; i < 8; i++) {
  const p = await (await api.post('/api/profiles', { data: { name: `Player ${i + 1}`, color: ['#dc2626', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777'][i], avatar: 'fox', pin: '2468' } })).json();
  await h.act({ type: 'addPlayer', profileId: p.profile.id });
}
await h.act({ type: 'updateRules', rules: { categoryIntro: true } }).catch(() => {});

const browser = await chromium.launch({ headless: !HEADED, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const tv = await ctx.newPage();
const cdp = await ctx.newCDPSession(tv);
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await tv.addInitScript(() => {
  const w = window;
  w.__frames = [];
  w.__long = [];
  w.__mut = 0;
  w.__rec = false;
  const loop = (t) => {
    if (w.__rec) w.__frames.push(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  try {
    new PerformanceObserver((l) => {
      if (w.__rec) for (const e of l.getEntries()) w.__long.push(e.duration);
    }).observe({ type: 'longtask', buffered: false });
  } catch {}
  new MutationObserver((ms) => {
    if (w.__rec) w.__mut += ms.length;
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
});
await tv.goto(`${BASE}/board`);
await tv.getByTestId('scoreboard').or(tv.locator('.tvp-full')).first().waitFor();
await tv.waitForTimeout(1500);

async function measure(name, action, windowMs = 1100) {
  await tv.evaluate(() => {
    window.__frames = [];
    window.__long = [];
    window.__mut = 0;
    window.__rec = true;
  });
  await browser.startTracing(tv, { categories: process.env.PERF_TOP ? ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'blink', 'cc', 'disabled-by-default-v8.gc'] : ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
  const t0 = Date.now();
  await h.act(action);
  await tv.waitForTimeout(windowMs); // a swipe is 0.7 s
  const trace = JSON.parse((await browser.stopTracing()).toString());
  const r = await tv.evaluate(() => {
    window.__rec = false;
    return { frames: window.__frames, long: window.__long, mut: window.__mut };
  });
  const gaps = r.frames.slice(1).map((t, i) => t - r.frames[i]);
  const ev = trace.traceEvents ?? trace;
  const sum = (names) => ev.filter((e) => names.includes(e.name) && e.dur).reduce((a, e) => a + e.dur / 1000, 0);
  const count = (names) => ev.filter((e) => names.includes(e.name)).length;
  if (process.env.PERF_TOP) {
    // Where the time goes on the renderer main thread (top-level-ish events by total duration).
    const main = ev.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
    const tot = {};
    for (const e of ev) if (e.dur && (!main || (e.pid === main.pid && e.tid === main.tid))) tot[e.name] = (tot[e.name] ?? 0) + e.dur / 1000;
    const paints = {};
    for (const e of ev) if (e.name === 'Paint') { const k = JSON.stringify(e.args?.data?.clip?.map((x) => Math.round(x)) ?? e.args?.data?.nodeId ?? '?').slice(0, 20) + ` node=${e.args?.data?.nodeId ?? '?'}`; paints[k] = (paints[k] ?? 0) + 1; }
    console.log(name, 'paints:', Object.entries(paints).sort((a, b) => b[1] - a[1]).slice(0, 6));
    console.log(name, Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k}:${Math.round(v)}`).join('  '));
  }
  return {
    name,
    ms: Date.now() - t0,
    frames: r.frames.length,
    fps: gaps.length ? Math.round((1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)) * 10) / 10 : 0,
    p95FrameMs: Math.round(pct(gaps, 0.95) * 10) / 10,
    maxFrameMs: Math.round(Math.max(0, ...gaps) * 10) / 10,
    dropped: gaps.filter((g) => g > 25).length,
    longTasks: r.long.length,
    longTaskMs: Math.round(r.long.reduce((a, b) => a + b, 0)),
    paints: count(['Paint']),
    paintMs: Math.round(sum(['Paint', 'PaintImage'])),
    rasterMs: Math.round(sum(['RasterTask'])),
    layouts: count(['Layout']),
    layoutMs: Math.round(sum(['Layout'])),
    styleMs: Math.round(sum(['UpdateLayoutTree', 'RecalcStyles'])),
    scriptMs: Math.round(sum(['FunctionCall', 'EvaluateScript', 'v8.callFunction'])),
    mutations: r.mut,
  };
}

const runs = [];
runs.push(await measure('board fill', { type: 'startGame' }, 4500)); // fill + round title
const g = await h.until((x) => !!x.intro);
const n = g.rounds[g.intro.roundIndex].categories.length;
for (let i = 0; i < n; i++) runs.push(await measure(`next → ${i + 1}`, { type: 'introNext' }));
runs.push(await measure('previous', { type: 'introPrev' }));
runs.push(await measure('jump → 1', { type: 'introGoto', step: 0 }));
runs.push(await measure('jump → last', { type: 'introGoto', step: n - 1 }));
await h.act({ type: 'introSkip' });
await tv.waitForTimeout(1500);
// The next round's fill on a TV that already shows the game (no lobby → game screen switch).
runs.push(await measure('round 2 fill', { type: 'setRound', roundIndex: 1 }, 4500));

const keys = ['fps', 'p95FrameMs', 'maxFrameMs', 'dropped', 'longTasks', 'longTaskMs', 'paints', 'paintMs', 'rasterMs', 'layouts', 'layoutMs', 'styleMs', 'scriptMs', 'mutations'];
const mean = Object.fromEntries(keys.map((k) => [k, Math.round((runs.reduce((a, r) => a + r[k], 0) / runs.length) * 10) / 10]));
console.table(runs.map((r) => Object.fromEntries([['name', r.name], ...keys.map((k) => [k, r[k]])])));
console.log(`mean (${LABEL}, cpu x${CPU}):`, mean);
writeFileSync(`test-results/perf-intro-${LABEL}.json`, JSON.stringify({ label: LABEL, cpu: CPU, headed: HEADED, runs, mean }, null, 2));

h.close();
await api.dispose();
await browser.close();
stop();
process.exit(0);
