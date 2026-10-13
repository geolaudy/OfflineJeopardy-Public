// Host-only routes for importing boards from other sources (R2-20 / R2-21).
//
//   POST   /api/import/inspect          parse + normalise, keep the result for 10 minutes, return a preview
//   GET    /api/import/:id/preview      preview one board of a multi-board import (?key=)
//   POST   /api/import/commit           download media, validate, create the board(s) — all or nothing
//   DELETE /api/import/:id              cancel
//
// URL imports are the only internet-dependent feature; offline they fail with a clear message.
// Media rule: media that cannot be imported at all (YouTube, local file names…) is listed in the
// preview. Media that fails to *download* at commit time is skipped and reported as warnings —
// the board is still created with the clue text — unless the request sets requireAllMedia, in
// which case any failure rolls the whole import back.
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { BoardContent } from '../shared/game.js';
import { acquireMedia, type MediaFailure } from './importers/media.js';
import type { NetPolicy } from './importers/net.js';
import { buildContent, previewBoard, validateContent, type StoredMedia } from './importers/pipeline.js';
import { createRegistry, parseInput } from './importers/registry.js';
import { checkUrl } from './importers/net.js';
import { ImportError, type ImportInput, type NormalizedImport } from './importers/types.js';

export interface ImportDeps {
  requireHost(req: FastifyRequest, reply: FastifyReply): boolean;
  /** Validates by content and stores one clue media file (throws ImageError for invalid files). */
  storeClueMedia(buf: Buffer, originalName: string): Promise<{ id: string; kind: 'image' | 'audio' | 'video'; url: string }>;
  saveBoard(input: { title: string; description: string; tags: string[]; content: BoardContent }): { id: string };
  listBoardTitles(): string[];
  /** Deletes a media file stored by storeClueMedia (rollback). */
  removeClueMedia(url: string): void | Promise<void>;
  /** Optional: delete a board created earlier in the same commit (rollback of multi-board imports). */
  deleteBoard?(id: string): void;
  audit(action: string, detail?: unknown): void;
  /** Tests only: replaces the HTTP transport. */
  fetchImpl?: typeof fetch;
  /** Tests only: network/limit overrides. Production code must not set allowPrivateNetworks. */
  testing?: {
    allowPrivateNetworks?: boolean;
    buzzingaApiBase?: string;
    maxMediaBytes?: number;
    mediaTimeoutMs?: number;
    now?: () => number;
  };
}

const TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 5;
const MAX_FILE_TEXT = 64 * 1024 * 1024;
const MAX_SELECTION = 10;

interface Pending {
  id: string;
  createdAt: number;
  result: NormalizedImport;
  busy: boolean;
}

const inspectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('url'), url: z.string().trim().min(1).max(2048) }),
  z.object({ kind: z.literal('file'), name: z.string().max(255).default('file'), text: z.string().min(1).max(MAX_FILE_TEXT) }),
]);
const commitSchema = z.object({
  importId: z.string().min(1).max(64),
  title: z.string().trim().max(120).optional(),
  selection: z.array(z.string().max(64)).max(MAX_SELECTION).optional(),
  requireAllMedia: z.boolean().optional(),
});

export function registerImportRoutes(app: FastifyInstance, deps: ImportDeps) {
  const t = deps.testing ?? {};
  const now = t.now ?? Date.now;
  const net: NetPolicy = { allowPrivateNetworks: !!t.allowPrivateNetworks, fetchImpl: deps.fetchImpl };
  const sources = createRegistry({ buzzingaApiBase: t.buzzingaApiBase });
  const pending = new Map<string, Pending>();

  const sweep = () => {
    for (const [id, p] of pending) if (!p.busy && now() - p.createdAt > TTL_MS) pending.delete(id);
    while (pending.size > MAX_PENDING) {
      const oldest = [...pending.values()].filter((p) => !p.busy).sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!oldest) break;
      pending.delete(oldest.id);
    }
  };
  const fail = (reply: FastifyReply, e: unknown) => {
    if (e instanceof ImportError) return reply.code(e.status).send({ error: e.message, code: e.code });
    app.log.error(e);
    return reply.code(500).send({ error: 'The import failed unexpectedly. Nothing was saved.' });
  };
  const titles = () => new Set(deps.listBoardTitles().map((s) => s.trim().toLowerCase()));
  const duplicateOf = (title: string, existing = titles()) => (existing.has(title.trim().toLowerCase()) ? title : undefined);
  const getPending = (id: string) => {
    sweep();
    const p = pending.get(id);
    if (!p) throw new ImportError('This import has expired or was cancelled. Please check the source again.', 404, 'expired');
    return p;
  };

  app.post('/api/import/inspect', { bodyLimit: MAX_FILE_TEXT + 1024 * 1024 }, async (req, reply) => {
    if (!deps.requireHost(req, reply)) return;
    const body = inspectSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') });
    try {
      const input: ImportInput = body.data.kind === 'url' ? { kind: 'url', url: checkUrl(body.data.url, net) } : { kind: 'file', name: body.data.name, text: body.data.text };
      const result = await parseInput(input, sources, net);
      sweep();
      const id = crypto.randomUUID();
      pending.set(id, { id, createdAt: now(), result, busy: false });
      sweep();
      const first = previewBoard(result.boards[0]);
      return {
        importId: id,
        expiresAt: now() + TTL_MS,
        source: { id: result.sourceId, label: result.sourceLabel },
        title: result.boards.length === 1 ? first.title : result.title,
        summary: first.summary,
        board: first,
        ...(result.boards.length > 1 ? { boards: result.boards.map((b) => ({ key: b.key, label: b.label })) } : {}),
        warnings: [...result.warnings, ...first.warnings],
        missingMedia: first.missingMedia,
        ...(duplicateOf(first.title) ? { duplicateTitle: first.title } : {}),
        ...(result.attribution ? { attribution: result.attribution } : {}),
        ...(result.originUrl ? { originUrl: result.originUrl } : {}),
      };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.get('/api/import/:id/preview', async (req, reply) => {
    if (!deps.requireHost(req, reply)) return;
    try {
      const p = getPending((req.params as { id: string }).id);
      const key = String((req.query as { key?: string }).key ?? '');
      const b = p.result.boards.find((x) => x.key === key) ?? p.result.boards[0];
      const pv = previewBoard(b);
      return { ...pv, ...(duplicateOf(b.title) ? { duplicateTitle: b.title } : {}) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.delete('/api/import/:id', async (req, reply) => {
    if (!deps.requireHost(req, reply)) return;
    const p = pending.get((req.params as { id: string }).id);
    if (p?.busy) return reply.code(409).send({ error: 'This import is being saved right now.' });
    if (p) pending.delete(p.id);
    return { ok: true };
  });

  app.post('/api/import/commit', async (req, reply) => {
    if (!deps.requireHost(req, reply)) return;
    const body = commitSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') });
    let p: Pending;
    try {
      p = getPending(body.data.importId);
    } catch (e) {
      return fail(reply, e);
    }
    if (p.busy) return reply.code(409).send({ error: 'This import is already being saved.' });
    const { result } = p;
    const keys = body.data.selection?.length ? [...new Set(body.data.selection)] : result.boards.length === 1 ? [result.boards[0].key] : [];
    if (!keys.length) return reply.code(400).send({ error: 'Choose which show(s) to import.' });
    const boards = keys.map((k) => result.boards.find((b) => b.key === k));
    if (boards.some((b) => !b)) return reply.code(400).send({ error: 'One of the chosen boards is not part of this import.' });

    p.busy = true;
    const stored: string[] = [];
    const savedIds: string[] = [];
    const rollback = async () => {
      for (const id of savedIds.splice(0)) {
        try {
          deps.deleteBoard?.(id);
        } catch {
          /* best effort */
        }
      }
      for (const url of stored.splice(0)) {
        try {
          await deps.removeClueMedia(url);
        } catch {
          /* best effort */
        }
      }
    };
    try {
      const chosen = boards as NonNullable<(typeof boards)[number]>[];
      // 1. media acquisition
      let map = new Map<string, StoredMedia>();
      let failures: MediaFailure[] = [];
      ({ map, failures } = await acquireMedia(
        chosen,
        {
          net,
          maxBytes: t.maxMediaBytes ?? 50 * 1024 * 1024,
          maxTotalBytes: 500 * 1024 * 1024,
          maxFiles: 300,
          timeoutMs: t.mediaTimeoutMs ?? 60_000,
          store: (buf, name) => deps.storeClueMedia(buf, name),
        },
        stored,
      ));
      if (failures.length && body.data.requireAllMedia) {
        await rollback();
        throw new ImportError(`${failures.length} media file${failures.length === 1 ? '' : 's'} could not be downloaded, so nothing was imported: ${failures[0].ref} — ${failures[0].reason}`, 422, 'media');
      }
      // 2. build + validate every board before saving anything
      const existing = titles();
      const plans = chosen.map((b) => {
        const title = (chosen.length === 1 && body.data.title) || b.title;
        const content = buildContent(b, map);
        const errors = validateContent(content);
        if (errors.length) throw new ImportError(`"${title}" is not a valid board: ${errors.slice(0, 3).join(' ')}`, 422, 'invalid-board');
        const description = [b.description, result.attribution && !b.description?.includes(result.attribution) ? result.attribution : '']
          .filter(Boolean)
          .join(' ')
          .slice(0, 2000);
        return { title: title.slice(0, 120), description, tags: (b.tags ?? ['imported']).slice(0, 30), content };
      });
      // 3. create
      const warnings: string[] = [];
      const created: { id: string; title: string }[] = [];
      for (const plan of plans) {
        if (existing.has(plan.title.toLowerCase())) warnings.push(`A board named "${plan.title}" already exists — the import was saved as a separate board.`);
        const saved = deps.saveBoard(plan);
        savedIds.push(saved.id);
        created.push({ id: saved.id, title: plan.title });
      }
      for (const f of failures) warnings.push(`${f.where}: media not imported (${f.reason}) ${f.ref}`);
      deps.audit('board.importSource', { source: result.sourceId, origin: result.originUrl ?? null, boards: created.map((c) => c.id), media: stored.length, mediaFailed: failures.length });
      pending.delete(p.id);
      stored.length = 0;
      savedIds.length = 0;
      return { boardId: created[0].id, boards: created, warnings, media: { stored: map.size, failed: failures } };
    } catch (e) {
      await rollback();
      p.busy = false;
      return fail(reply, e);
    }
  });
}
