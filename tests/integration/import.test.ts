// Board importing routes (R2-20/R2-21) on a minimal Fastify app with fake deps, plus a local
// fixture HTTP server standing in for Buzzinga's public share endpoint and media hosts.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import sharp from 'sharp';
import { registerImportRoutes, type ImportDeps } from '../../src/server/importRoutes';
import { ImageError } from '../../src/server/images';
import { boardContentSchema } from '../../src/shared/boardIO';
import type { BoardContent } from '../../src/shared/game';

const fx = (name: string) => fs.readFileSync(path.join(__dirname, '../fixtures/import', name), 'utf8');

let fixture: http.Server;
let base = '';
let png: Buffer;
const hits: string[] = [];

beforeAll(async () => {
  png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#3366cc' } }).png().toBuffer();
  fixture = http.createServer((req, res) => {
    const url = req.url ?? '';
    hits.push(url);
    const send = (status: number, type: string, body: string | Buffer) => {
      res.writeHead(status, { 'content-type': type });
      res.end(body);
    };
    if (url === '/api/getSharedBoard/good') return send(200, 'application/json', fx('buzzinga-board.json').replaceAll('https://uploads.example.test', base + '/media'));
    if (url === '/api/getSharedBoard/missing') return send(404, 'application/json', '{"error":"Game board not found"}');
    if (url === '/api/getSharedBoard/weird') return send(200, 'application/json', '{"hello":"world"}');
    if (url === '/media/pic.png' || url === '/media/elephant.png') return send(200, 'image/png', png);
    if (url === '/media/sound.mp3') return send(200, 'audio/mpeg', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64)]));
    if (url === '/media/page.html') return send(200, 'text/html', '<html>hi</html>');
    if (url === '/media/big.bin') return send(200, 'application/octet-stream', Buffer.alloc(2 * 1024 * 1024));
    if (url === '/media/bad.png') return send(200, 'image/png', Buffer.from('definitely not a png'));
    if (url === '/media/redirect.png') {
      res.writeHead(302, { location: '/media/pic.png' });
      return res.end();
    }
    if (url === '/media/slow') return; // never answers
    if (url === '/files/generic.csv') return send(200, 'text/csv', fx('generic.csv').replaceAll('https://uploads.example.test', base + '/media'));
    if (url === '/page') return send(200, 'text/html; charset=utf-8', '<!doctype html><html><body>A web page</body></html>');
    send(404, 'text/plain', 'not found');
  });
  await new Promise<void>((r) => fixture.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(fixture.address() as { port: number }).port}`;
});
afterAll(async () => {
  fixture.closeAllConnections();
  await new Promise((r) => fixture.close(r));
});

interface Harness {
  app: FastifyInstance;
  media: Map<string, Buffer>;
  boards: { id: string; title: string; description: string; tags: string[]; content: BoardContent }[];
  audits: { action: string; detail: unknown }[];
  clock: { t: number };
  failSave: { on: boolean };
  removed: string[];
}

const apps: FastifyInstance[] = [];
beforeEach(async () => {
  for (const a of apps.splice(0)) await a.close();
});

async function harness(opts: { production?: boolean; fetchImpl?: typeof fetch } = {}): Promise<Harness> {
  const media = new Map<string, Buffer>();
  const boards: Harness['boards'] = [];
  const audits: Harness['audits'] = [];
  const removed: string[] = [];
  const clock = { t: 1_000_000 };
  const failSave = { on: false };
  let n = 0;
  const deps: ImportDeps = {
    requireHost: (req, reply) => {
      if (req.headers.authorization === 'Bearer host') return true;
      reply.code(401).send({ error: 'Host sign-in required' });
      return false;
    },
    async storeClueMedia(buf) {
      const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const isMp3 = buf.subarray(0, 3).toString() === 'ID3';
      if (!isPng && !isMp3) throw new ImageError('That file is not a supported picture, sound or video.');
      const id = `m${++n}`;
      const url = `/media/clues/${id}.${isPng ? 'webp' : 'mp3'}`;
      media.set(url, buf);
      return { id, kind: isPng ? 'image' : 'audio', url };
    },
    saveBoard(input) {
      if (failSave.on) throw new Error('disk full');
      const id = `b${boards.length + 1}`;
      boards.push({ id, ...input });
      return { id };
    },
    deleteBoard(id) {
      const i = boards.findIndex((b) => b.id === id);
      if (i >= 0) boards.splice(i, 1);
    },
    listBoardTitles: () => ['Science Night', ...boards.map((b) => b.title)],
    removeClueMedia(url) {
      removed.push(url);
      media.delete(url);
    },
    audit: (action, detail) => audits.push({ action, detail }),
    fetchImpl: opts.fetchImpl,
    testing: opts.production ? { now: () => clock.t } : { allowPrivateNetworks: true, buzzingaApiBase: base, maxMediaBytes: 1024 * 1024, mediaTimeoutMs: 800, now: () => clock.t },
  };
  const app = Fastify();
  registerImportRoutes(app, deps);
  await app.ready();
  apps.push(app);
  return { app, media, boards, audits, clock, failSave, removed };
}

async function call(h: Harness, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown, auth = true) {
  const res = await h.app.inject({ method, url, payload: payload as object | undefined, headers: auth ? { authorization: 'Bearer host' } : {} });
  return { status: res.statusCode, data: res.json() as any };
}

describe('import routes', () => {
  it('are host-only', async () => {
    const h = await harness();
    expect((await call(h, 'POST', '/api/import/inspect', { kind: 'url', url: 'https://play.buzzinga.io/share/good' }, false)).status).toBe(401);
    expect((await call(h, 'POST', '/api/import/commit', { importId: 'x' }, false)).status).toBe(401);
    expect(hits.some((u) => u.includes('getSharedBoard'))).toBe(false);
  });

  it('imports a Buzzinga share link with media: preview, duplicate warning, download, URL rewrite', async () => {
    const h = await harness();
    const ins = await call(h, 'POST', '/api/import/inspect', { kind: 'url', url: 'https://play.buzzinga.io/share/good' });
    expect(ins.status).toBe(200);
    expect(ins.data.source.id).toBe('buzzinga');
    expect(ins.data.title).toBe('Science Night');
    expect(ins.data.duplicateTitle).toBe('Science Night');
    expect(ins.data.summary).toEqual({ rounds: 3, categories: 4, clues: 8, mediaFound: 2 });
    expect(ins.data.missingMedia.map((m: any) => m.reason).join(' ')).toMatch(/YouTube/);
    expect(ins.data.attribution).toMatch(/Buzzinga/);
    expect(ins.data.board.categories.map((c: any) => c.name)).toContain('Chemistry');

    const com = await call(h, 'POST', '/api/import/commit', { importId: ins.data.importId, title: 'Science Night (imported)' });
    expect(com.status).toBe(200);
    expect(com.data.media.stored).toBe(2);
    expect(com.data.media.failed).toEqual([]);
    const saved = h.boards.find((b) => b.id === com.data.boardId)!;
    expect(saved.title).toBe('Science Night (imported)');
    expect(saved.description).toMatch(/play\.buzzinga\.io\/share\/good/);
    expect(boardContentSchema.safeParse(saved.content).success).toBe(true);
    const space = saved.content.rounds[0].categories[0];
    expect(space.clues[1].media).toEqual([{ kind: 'image', url: expect.stringMatching(/^\/media\/clues\/m\d+\.webp$/), caption: 'Photo: NASA' }]);
    expect(space.clues[1].dailyWager).toBe(true);
    expect(saved.content.rounds[0].categories[1].clues[1].media?.[0].kind).toBe('audio');
    expect(h.media.size).toBe(2);
    expect(h.audits[0]).toMatchObject({ action: 'board.importSource' });
    // The pending import is consumed.
    expect((await call(h, 'POST', '/api/import/commit', { importId: ins.data.importId })).status).toBe(404);
  });

  it('explains share links that are not shareable and unexpected responses', async () => {
    const h = await harness();
    const r = await call(h, 'POST', '/api/import/inspect', { kind: 'url', url: 'https://play.buzzinga.io/share/missing' });
    expect(r.status).toBe(404);
    expect(r.data.error).toMatch(/not shareable/);
    const w = await call(h, 'POST', '/api/import/inspect', { kind: 'url', url: 'https://play.buzzinga.io/share/weird' });
    expect(w.status).toBe(502);
    expect(w.data.error).toMatch(/CSV/);
  });

  it('skips media that fail to download and reports them; requireAllMedia rolls back instead', async () => {
    const h = await harness();
    const csv = [
      'round,category,value,question,answer,image',
      `Round 1,Mixed,200,ok,a,${base}/media/pic.png`,
      `Round 1,Mixed,400,html,a,${base}/media/page.html`,
      `Round 1,Mixed,600,big,a,${base}/media/big.bin`,
      `Round 1,Mixed,800,slow,a,${base}/media/slow`,
      `Round 1,Mixed,1000,404,a,${base}/media/nope.png`,
      `Round 1,Other,200,bad,a,${base}/media/bad.png`,
      `Round 1,Other,400,redirect,a,${base}/media/redirect.png`,
    ].join('\n');
    const strict = await call(h, 'POST', '/api/import/inspect', { kind: 'file', name: 'mixed.csv', text: csv });
    expect(strict.status).toBe(200);
    expect(strict.data.summary.mediaFound).toBe(7);
    const fail = await call(h, 'POST', '/api/import/commit', { importId: strict.data.importId, requireAllMedia: true });
    expect(fail.status).toBe(422);
    expect(h.media.size).toBe(0); // rolled back
    expect(h.removed.length).toBe(2);
    expect(h.boards).toHaveLength(0);

    // Same import (still pending after the failed commit), lenient this time.
    const ok = await call(h, 'POST', '/api/import/commit', { importId: strict.data.importId });
    expect(ok.status).toBe(200);
    expect(ok.data.media.stored).toBe(2);
    const reasons = ok.data.media.failed.map((f: any) => f.reason).join(' | ');
    expect(reasons).toMatch(/Not a picture, sound or video \(text\/html\)/);
    expect(reasons).toMatch(/larger than 1 MB/);
    expect(reasons).toMatch(/did not answer in time/);
    expect(reasons).toMatch(/HTTP 404/);
    expect(reasons).toMatch(/Rejected: That file is not a supported/);
    expect(ok.data.warnings.length).toBe(5);
    expect(h.boards).toHaveLength(1);
    const mixed = h.boards[0].content.rounds[0].categories[0];
    expect(mixed.clues[0].media?.[0].kind).toBe('image');
    expect(mixed.clues[1].media).toBeUndefined();
  });

  it('rolls back stored media when saving the board fails', async () => {
    const h = await harness();
    const ins = await call(h, 'POST', '/api/import/inspect', { kind: 'url', url: 'https://play.buzzinga.io/share/good' });
    h.failSave.on = true;
    const r = await call(h, 'POST', '/api/import/commit', { importId: ins.data.importId });
    expect(r.status).toBe(500);
    expect(r.data.error).toMatch(/Nothing was saved/);
    expect(h.media.size).toBe(0);
    expect(h.removed).toHaveLength(2);
  });

  it('imports multi-show datasets by selection, one board per show', async () => {
    const h = await harness();
    const ins = await call(h, 'POST', '/api/import/inspect', { kind: 'file', name: 'clues.json', text: fx('jeopardy-dataset.json') });
    expect(ins.status).toBe(200);
    expect(ins.data.source.id).toBe('jeopardy-dataset');
    expect(ins.data.boards.map((b: any) => b.key)).toEqual(['2900', '4680']);
    const pv = await call(h, 'GET', `/api/import/${ins.data.importId}/preview?key=4680`);
    expect(pv.data.summary).toMatchObject({ rounds: 3, clues: 7 });
    expect((await call(h, 'POST', '/api/import/commit', { importId: ins.data.importId })).status).toBe(400);
    const com = await call(h, 'POST', '/api/import/commit', { importId: ins.data.importId, selection: ['4680', '2900'] });
    expect(com.status).toBe(200);
    expect(com.data.boards.map((b: any) => b.title)).toEqual(['Show 4680 (2004-12-31)', 'Show 2900 (1997-03-14)']);
    for (const b of h.boards) expect(boardContentSchema.safeParse(b.content).success).toBe(true);
  });

  it('imports a direct link to a CSV file and refuses web pages', async () => {
    const h = await harness();
    const ins = await call(h, 'POST', '/api/import/inspect', { kind: 'url', url: `${base}/files/generic.csv` });
    expect(ins.status).toBe(200);
    expect(ins.data.source.id).toBe('csv');
    expect(ins.data.title).toBe('generic');
    expect(ins.data.attribution).toMatch(/Downloaded from/);
    expect(ins.data.missingMedia).toHaveLength(1); // trumpet.mp3 is a local file name
    const page = await call(h, 'POST', '/api/import/inspect', { kind: 'url', url: `${base}/page` });
    expect(page.status).toBe(400);
    expect(page.data.error).toMatch(/web page/);
  });

  it('blocks localhost and private-network targets in production mode', async () => {
    const h = await harness({ production: true });
    const before = hits.length;
    for (const url of [`${base}/files/generic.csv`, 'http://localhost/x.csv', 'http://[::1]/x.csv', 'http://192.168.0.10/x.csv', 'http://169.254.169.254/latest/meta-data', 'ftp://example.com/x.csv', 'file:///C:/Windows/win.ini']) {
      const r = await call(h, 'POST', '/api/import/inspect', { kind: 'url', url });
      expect(r.status, url).toBe(400);
    }
    expect(hits.length).toBe(before); // nothing reached the fixture server
  });

  it('fails gracefully without internet', async () => {
    const offline = (async () => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.buzzinga.io'), { code: 'ENOTFOUND' }) });
    }) as unknown as typeof fetch;
    const h = await harness({ production: true, fetchImpl: offline });
    const r = await call(h, 'POST', '/api/import/inspect', { kind: 'url', url: 'https://play.buzzinga.io/share/abc' });
    expect(r.status).toBe(503);
    expect(r.data.error).toMatch(/No internet connection.*playing stays offline/);
    // File imports keep working offline.
    const f = await call(h, 'POST', '/api/import/inspect', { kind: 'file', name: 'g.csv', text: fx('generic.csv') });
    expect(f.status).toBe(200);
  });

  it('can be cancelled and expires after 10 minutes', async () => {
    const h = await harness();
    const a = await call(h, 'POST', '/api/import/inspect', { kind: 'file', name: 'g.csv', text: fx('generic.csv') });
    expect((await call(h, 'DELETE', `/api/import/${a.data.importId}`)).status).toBe(200);
    expect((await call(h, 'POST', '/api/import/commit', { importId: a.data.importId })).status).toBe(404);
    const b = await call(h, 'POST', '/api/import/inspect', { kind: 'file', name: 'g.csv', text: fx('generic.csv') });
    h.clock.t += 11 * 60 * 1000;
    const r = await call(h, 'POST', '/api/import/commit', { importId: b.data.importId });
    expect(r.status).toBe(404);
    expect(r.data.error).toMatch(/expired/);
  });

  it('rejects malformed requests', async () => {
    const h = await harness();
    expect((await call(h, 'POST', '/api/import/inspect', { kind: 'nope' })).status).toBe(400);
    expect((await call(h, 'POST', '/api/import/inspect', { kind: 'url', url: 'not a url' })).status).toBe(400);
    expect((await call(h, 'POST', '/api/import/inspect', { kind: 'file', name: 'x.txt', text: 'just text' })).status).toBe(400);
  });
});
