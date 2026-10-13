// Media acquisition: download each permitted media URL once (size-capped, time-limited, only
// image/audio/video responses), then hand the bytes to the server's storeClueMedia, which
// re-validates the file by content. Every stored URL is recorded in `stored` *as it happens*, so
// the caller can roll back even when this function throws part-way.
import { ImageError } from '../images.js';
import type { NetPolicy } from './net.js';
import { safeGet } from './net.js';
import type { NormalizedBoard } from './types.js';
import { ImportError } from './types.js';
import type { StoredMedia } from './pipeline.js';
import { forEachMedia } from './pipeline.js';

export interface MediaOptions {
  net: NetPolicy;
  maxBytes: number; // per file
  maxTotalBytes: number;
  maxFiles: number;
  timeoutMs: number; // per file
  concurrency?: number;
  store: (buf: Buffer, originalName: string) => Promise<StoredMedia & { id?: string }>;
}

export interface MediaFailure {
  where: string;
  ref: string;
  reason: string;
}

const ALLOWED_TYPE = /^(image\/(?!svg)[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/(octet-stream|ogg)|binary\/octet-stream)$/;

function fileNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || 'media').slice(0, 120) || 'media';
  } catch {
    return 'media';
  }
}

export async function acquireMedia(boards: NormalizedBoard[], opts: MediaOptions, stored: string[]): Promise<{ map: Map<string, StoredMedia>; failures: MediaFailure[] }> {
  const where = new Map<string, string>();
  for (const b of boards) forEachMedia(b, (m, w) => m.url && !where.has(m.url) && where.set(m.url, w));
  const urls = [...where.keys()];
  const map = new Map<string, StoredMedia>();
  const failures: MediaFailure[] = [];
  if (urls.length > opts.maxFiles) {
    for (const u of urls.slice(opts.maxFiles)) failures.push({ where: where.get(u)!, ref: u, reason: `More than ${opts.maxFiles} media files — skipped.` });
    urls.length = opts.maxFiles;
  }
  let total = 0;
  let fatal: unknown = null;
  let next = 0;
  const worker = async () => {
    while (!fatal && next < urls.length) {
      const url = urls[next++];
      const fail = (reason: string) => failures.push({ where: where.get(url)!, ref: url, reason });
      let body: Buffer;
      try {
        const res = await safeGet(url, opts.net, { timeoutMs: opts.timeoutMs, maxBytes: opts.maxBytes, accept: 'image/*, audio/*, video/*' });
        if (res.status < 200 || res.status >= 300) {
          fail(`The server answered HTTP ${res.status}.`);
          continue;
        }
        const type = res.contentType.split(';')[0].trim();
        if (type && !ALLOWED_TYPE.test(type)) {
          fail(`Not a picture, sound or video (${type}).`);
          continue;
        }
        body = res.body;
      } catch (e) {
        if (e instanceof ImportError && e.code === 'offline') {
          fatal = e; // no point trying the rest
          return;
        }
        fail(e instanceof ImportError ? e.message : 'Download failed.');
        continue;
      }
      if (!body.length) {
        fail('The file is empty.');
        continue;
      }
      if (total + body.length > opts.maxTotalBytes) {
        fail(`The import's media would exceed ${Math.round(opts.maxTotalBytes / 1024 / 1024)} MB in total — skipped.`);
        continue;
      }
      total += body.length;
      try {
        const s = await opts.store(body, fileNameOf(url));
        stored.push(s.url);
        map.set(url, { url: s.url, kind: s.kind });
      } catch (e) {
        if (e instanceof ImageError) fail(`Rejected: ${e.message}`);
        else {
          fatal = e; // disk/database problem — abort and roll back
          return;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, urls.length)) }, worker));
  if (fatal) throw fatal;
  return { map, failures };
}
