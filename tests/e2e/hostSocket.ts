// Minimal host WebSocket client for E2E setup (engine actions without clicking through the UI).
import WebSocket from 'ws';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;

/** Minimal host WebSocket client: sends engine actions and waits for each result. */
export async function hostSocket(token: string) {
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)));
  let state: any = null;
  const pending = new Map<number, (m: any) => void>();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'state') state = m.game;
    if (m.t === 'result') pending.get(m.id)?.(m);
  });
  ws.send(JSON.stringify({ t: 'hello', role: 'host', token }));
  let id = 1;
  const act = (action: Record<string, unknown>) =>
    new Promise<any>((res, rej) => {
      const n = id++;
      pending.set(n, (m) => (m.ok ? res(m) : rej(new Error(`${action.type}: ${m.error}`))));
      ws.send(JSON.stringify({ t: 'host', id: n, action }));
    });
  const until = async (pred: (g: any) => boolean) => {
    for (let i = 0; i < 100 && !(state && pred(state)); i++) await new Promise((r) => setTimeout(r, 30));
    return state;
  };
  return { act, until, close: () => ws.close() };
}

