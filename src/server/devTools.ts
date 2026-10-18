// Developer tools (R7-31): not part of normal releases. The routes exist only when the server is
// started with dev tools on (`--dev-tools`, the dev server, an unpackaged Electron app or
// OJ_DEV_TOOLS=1) and always need a host session:
// - GET  /api/dev/diagnostics — versions, memory, event-loop delay, every connection's clock sync,
//   controllers and a game summary, as a JSON report that can be exported and shared: it holds no
//   tokens, PINs, keys, ids, names or network addresses;
// - POST /api/dev/fairness   — the buzzer fairness simulation with known, chosen network delays
//   (fair timing compared with plain arrival order on the same simulated clues).
import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Hub } from './hub.js';
import type { GameManager } from './gameManager.js';
import type { ControllerRegistry } from './controllers.js';
import { runFairnessTest } from './fairnessSim.js';

export const fairnessTestSchema = z.object({
  phones: z
    .array(z.object({ delayMs: z.number().min(0).max(300), jitter: z.enum(['low', 'normal', 'high']), spikes: z.boolean() }))
    .max(12),
  joycons: z.number().int().min(0).max(8),
  spreadMs: z.number().min(0).max(500),
  trials: z.number().int().min(10).max(2000),
  seed: z.number().int().min(0).max(1_000_000),
  mode: z.enum(['standard', 'generous']),
});

const mb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;
const ms = (ns: number) => Math.round(ns / 1e5) / 10;

export function registerDevRoutes(
  app: FastifyInstance,
  deps: { version: string; hub: Hub; games: GameManager; controllers: ControllerRegistry; requireHost: (req: FastifyRequest, reply: FastifyReply) => boolean },
) {
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  app.addHook('onClose', async () => loop.disable());

  app.get('/api/dev/diagnostics', async (req, reply) => {
    if (!deps.requireHost(req, reply)) return;
    const g = deps.games.current;
    const mem = process.memoryUsage();
    const report = {
      kind: 'OfflineJeopardy diagnostics',
      generatedAt: new Date().toISOString(),
      app: { version: deps.version, node: process.versions.node, electron: process.versions.electron ?? null, platform: `${os.platform()} ${os.release()}`, arch: os.arch(), uptimeS: Math.round(process.uptime()) },
      process: {
        rssMb: mb(mem.rss),
        heapUsedMb: mb(mem.heapUsed),
        cpus: os.cpus().length,
        // Event-loop delay since the server started (or the last reset): high values delay buzzes.
        eventLoopDelayMs: { p50: ms(loop.percentile(50)), p99: ms(loop.percentile(99)), max: ms(loop.max) },
      },
      game: g
        ? {
            phase: g.phase,
            mode: g.mode,
            competitors: g.competitors.length,
            bots: g.competitors.filter((c) => c.bot).length,
            buzzFairness: g.rules.buzzFairness ?? 'standard',
            buzzerStatus: g.buzzer.status,
            practice: g.practice,
          }
        : null,
      connections: deps.hub.diagnostics(),
      controllers: deps.controllers.list().map((d, i) => ({ controller: i + 1, kind: d.kind, side: d.side, connected: d.connected, buzzButtons: d.buzzButtons, presses: d.presses, lastInputAgoMs: d.lastInputAt ? Date.now() - d.lastInputAt : null })),
    };
    reply.header('cache-control', 'no-store');
    return report;
  });

  app.post('/api/dev/diagnostics/reset', async (req, reply) => {
    if (!deps.requireHost(req, reply)) return;
    loop.reset();
    return { ok: true };
  });

  app.post('/api/dev/fairness', async (req, reply) => {
    if (!deps.requireHost(req, reply)) return;
    const body = fairnessTestSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid test' });
    if (body.data.phones.length + body.data.joycons < 2) return reply.code(400).send({ error: 'Add at least two buzzers' });
    // The simulation runs on the game server's thread for up to a few seconds: never while a clue
    // or Final Jeopardy! is being played (it would delay real buzzes).
    const phase = deps.games.current?.phase;
    if (phase === 'clue' || phase === 'final') return reply.code(409).send({ error: 'Not while a clue or Final Jeopardy! is being played — try again on the board.' });
    const started = performance.now();
    const result = runFairnessTest(body.data);
    return { config: body.data, result, tookMs: Math.round(performance.now() - started) };
  });
}
