// Source plugin registry + the parse/normalise entry point.
import type { NetPolicy } from './net.js';
import { safeGet } from './net.js';
import { applyLimitsAll } from './pipeline.js';
import { createBuzzingaSource } from './sources/buzzinga.js';
import { genericCsvSource } from './sources/csv.js';
import { jeopardyDatasetSource } from './sources/jeopardyDataset.js';
import { remoteFileSource } from './sources/remoteFile.js';
import type { ImportInput, ImportSource, NormalizedImport, ParseContext } from './types.js';
import { ImportError } from './types.js';

export interface RegistryOptions {
  /** Tests only: point the Buzzinga plugin at a local fixture server. */
  buzzingaApiBase?: string;
}

/** Order matters: the first plugin whose detect() matches handles the input; generic ones last. */
export function createRegistry(opts: RegistryOptions = {}): ImportSource[] {
  return [createBuzzingaSource({ apiBase: opts.buzzingaApiBase }), jeopardyDatasetSource, genericCsvSource, remoteFileSource];
}

const UNSUPPORTED_FILE =
  'This file format is not recognised. Supported: a Buzzinga CSV export, a clue dataset (JSON list of clues), or a CSV with category, question and answer columns. OfflineJeopardy board files and packages are imported with "Import a board".';

export async function parseInput(input: ImportInput, sources: ImportSource[], net: NetPolicy): Promise<NormalizedImport> {
  const ctx: ParseContext = {
    async fetchText(url, o = {}) {
      const res = await safeGet(url, net, { timeoutMs: o.timeoutMs ?? 30_000, maxBytes: o.maxBytes ?? 10 * 1024 * 1024, accept: o.accept });
      if (res.status < 200 || res.status >= 300) {
        const msg = o.describe?.(res.status);
        throw new ImportError(msg ?? `${new URL(res.finalUrl).hostname} answered with an error (HTTP ${res.status}).`, res.status === 404 ? 404 : 502, 'http');
      }
      return { text: res.body.toString('utf8'), contentType: res.contentType, finalUrl: res.finalUrl };
    },
    async parseFile(file) {
      const fi: ImportInput = { kind: 'file', name: file.name, text: file.text };
      const src = sources.find((s) => s.detect(fi));
      if (!src) throw new ImportError(UNSUPPORTED_FILE, 400, 'unsupported');
      return src.parse(fi, ctx);
    },
  };
  if (input.kind === 'file') return applyLimitsAll(await ctx.parseFile(input));
  const src = sources.find((s) => s.detect(input));
  if (!src) throw new ImportError('This link is not supported.', 400, 'unsupported');
  return applyLimitsAll(await src.parse(input, ctx));
}
