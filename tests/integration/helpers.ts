import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer, type RunningServer } from '../../src/server/app';
import type { ServerMessage } from '../../src/shared/protocol';
import type { GameView } from '../../src/shared/views';

export function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oj-test-'));
}

export async function boot(dataDir = tempDir()): Promise<RunningServer & { dataDir: string }> {
  const s = await startServer({ dataDir, port: 0, host: '127.0.0.1', webDir: null });
  return Object.assign(s, { dataDir });
}

export async function api<T = any>(s: { url: string }, method: string, url: string, body?: unknown, token?: string): Promise<{ status: number; data: T }> {
  const res = await fetch(s.url + url, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data };
}

export async function hostToken(s: { url: string }) {
  const r = await api(s, 'POST', '/api/host/local-login');
  return r.data.token as string;
}

export class TestClient {
  ws: WebSocket;
  messages: ServerMessage[] = [];
  state: GameView | null = null;
  me: any = null;
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  private nextId = 1;
  closed: { code: number } | null = null;

  constructor(url: string) {
    this.ws = new WebSocket(url.replace('http', 'ws') + '/ws');
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString()) as ServerMessage;
      this.messages.push(m);
      if (m.t === 'state') {
        this.state = m.game;
        this.me = m.me ?? null;
      }
      this.waiters = this.waiters.filter((w) => {
        if (w.pred(m)) {
          w.resolve(m);
          return false;
        }
        return true;
      });
    });
    this.ws.on('close', (code) => (this.closed = { code }));
  }

  static async connect(s: { url: string }, role: 'host' | 'public' | 'player', token?: string) {
    const c = new TestClient(s.url);
    await new Promise<void>((res, rej) => {
      c.ws.once('open', () => res());
      c.ws.once('error', rej);
    });
    const welcome = c.wait((m) => m.t === 'welcome' || m.t === 'error');
    c.send({ t: 'hello', role, token });
    await welcome;
    return c;
  }

  send(m: unknown) {
    this.ws.send(JSON.stringify(m));
  }

  wait<T extends ServerMessage>(pred: (m: ServerMessage) => boolean, timeout = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting for message')), timeout);
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(t);
          resolve(m as T);
        },
      });
    });
  }

  waitState(pred: (g: GameView | null, me: any) => boolean, timeout = 3000) {
    if (pred(this.state, this.me)) return Promise.resolve(this.state);
    return this.wait((m) => m.t === 'state' && pred(m.game, m.me ?? null), timeout).then((m) => (m as any).game as GameView);
  }

  async act(action: Record<string, unknown>) {
    const id = this.nextId++;
    const p = this.wait((m) => m.t === 'result' && m.id === id);
    this.send({ t: 'host', id, action });
    const r = (await p) as Extract<ServerMessage, { t: 'result' }>;
    if (!r.ok) throw new Error(`${action.type}: ${r.error}`);
    return r;
  }

  async tryAct(action: Record<string, unknown>) {
    const id = this.nextId++;
    const p = this.wait((m) => m.t === 'result' && m.id === id);
    this.send({ t: 'host', id, action });
    return (await p) as Extract<ServerMessage, { t: 'result' }>;
  }

  close() {
    this.ws.close();
  }
}

export async function createProfile(s: { url: string }, name: string, pin = '1234', color = '#2563eb') {
  const r = await api(s, 'POST', '/api/profiles', { name, color, avatar: 'fox', pin });
  if (r.status !== 200) throw new Error(JSON.stringify(r.data));
  return { id: r.data.profile.id as string, token: r.data.token as string };
}

export async function sampleBoardId(s: { url: string }, token: string) {
  const r = await api(s, 'GET', '/api/boards', undefined, token);
  return r.data[0].id as string;
}
