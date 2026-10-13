// Outbound HTTP for URL imports — the only internet-dependent feature of the app.
//
// Security (SSRF): only http(s) URLs without credentials; hosts that are (or resolve to)
// loopback, private, link-local, CGNAT, multicast or reserved addresses are refused. The check
// runs again at connect time (custom DNS lookup), so DNS rebinding cannot slip past it, and on
// every redirect hop. Responses are size-capped while streaming and time-limited.
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { ImportError } from './types.js';

export interface NetPolicy {
  /** Tests only: allow loopback/private targets (the local fixture server). Never true in production. */
  allowPrivateNetworks?: boolean;
  /** Tests only: replaces the transport (the URL checks still apply). */
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

export const DEFAULT_USER_AGENT = 'OfflineJeopardy board import (user-initiated)';
const MAX_REDIRECTS = 5;

// ---------- address classification ----------

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(addr, prefix, 'ipv4');
for (const [addr, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['100::', 64],
] as const)
  blocked.addSubnet(addr, prefix, 'ipv6');

/** Embedded IPv4 of IPv4-mapped (::ffff:a.b.c.d / ::ffff:xxxx:xxxx) and NAT64 (64:ff9b::/96) addresses. */
function embeddedV4(ip: string): string | null {
  const m = /^(?:::ffff:|64:ff9b::)(.+)$/i.exec(ip);
  if (!m) return null;
  const rest = m[1];
  if (net.isIPv4(rest)) return rest;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(rest);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** True for any address an import must never contact (loopback, LAN, link-local, reserved…). */
export function isPrivateAddress(ip: string): boolean {
  const addr = ip.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const v = net.isIP(addr);
  if (v === 4) return blocked.check(addr, 'ipv4');
  if (v === 6) {
    const v4 = embeddedV4(addr.toLowerCase());
    if (v4) return blocked.check(v4, 'ipv4');
    return blocked.check(addr, 'ipv6');
  }
  return true; // not an IP at all — refuse
}

/** Validate a user-supplied URL. Throws ImportError with a friendly message. */
export function checkUrl(raw: string | URL, policy: NetPolicy = {}): URL {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(String(raw).trim());
  } catch {
    throw new ImportError('That is not a valid link. Paste the full address, starting with https://', 400, 'bad-url');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ImportError('Only http:// and https:// links can be imported.', 400, 'bad-url');
  if (u.username || u.password) throw new ImportError('Links containing a user name or password are not accepted.', 400, 'bad-url');
  if (String(raw).length > 2048) throw new ImportError('That link is too long.', 400, 'bad-url');
  if (policy.allowPrivateNetworks) return u;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw blockedError();
    return u;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home.arpa') || !host.includes('.'))
    throw blockedError();
  return u;
}

const blockedError = () =>
  new ImportError('Links to this computer or to devices on your local network cannot be imported. Use a public link, or import the file directly.', 400, 'blocked');

// ---------- errors ----------

const OFFLINE_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'ENETDOWN', 'EHOSTUNREACH', 'EAI_FAIL', 'ENONET']);
export const OFFLINE_MESSAGE = 'No internet connection — importing from a link works only online; playing stays offline.';

function errorCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string; cause?: { code?: string } } };
  return err?.code ?? err?.cause?.code ?? err?.cause?.cause?.code;
}

function mapNetworkError(e: unknown, u: URL): ImportError {
  if (e instanceof ImportError) return e;
  const code = errorCode(e);
  if (code === 'EBLOCKEDADDR') return blockedError();
  if (code && OFFLINE_CODES.has(code)) return new ImportError(OFFLINE_MESSAGE, 503, 'offline');
  if (code === 'ETIMEDOUT' || code === 'ABORT_ERR' || (e as Error)?.name === 'AbortError' || (e as Error)?.name === 'TimeoutError')
    return new ImportError(`${u.hostname} did not answer in time. Check your internet connection and try again.`, 504, 'timeout');
  return new ImportError(`Could not reach ${u.hostname} (${code ?? 'connection failed'}). Check your internet connection and try again.`, 502, 'unreachable');
}

// ---------- transport ----------

interface RawResponse {
  status: number;
  headers: Record<string, string>;
  /** Present for non-redirect responses. */
  body?: Buffer;
}

export class TooLargeError extends ImportError {
  constructor(maxBytes: number) {
    super(`The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`, 413, 'too-large');
  }
}

type LookupCb = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

function guardedLookup(policy: NetPolicy) {
  return (hostname: string, options: dns.LookupOptions, cb: LookupCb) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err);
      const list = addrs as dns.LookupAddress[];
      if (!policy.allowPrivateNetworks && (list.length === 0 || list.some((a) => isPrivateAddress(a.address)))) {
        const e = new Error('blocked address') as NodeJS.ErrnoException;
        e.code = 'EBLOCKEDADDR';
        return cb(e);
      }
      if (options.all) cb(null, list);
      else cb(null, list[0].address, list[0].family);
    });
  };
}

function nodeRequest(u: URL, policy: NetPolicy, headers: Record<string, string>, maxBytes: number, signal: AbortSignal): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, { method: 'GET', headers, lookup: guardedLookup(policy) as unknown as typeof dns.lookup, signal }, (res) => {
      const h: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) h[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        res.resume();
        return resolve({ status, headers: h });
      }
      const declared = Number(h['content-length']);
      if (Number.isFinite(declared) && declared > maxBytes) {
        res.destroy();
        return reject(new TooLargeError(maxBytes));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) {
          res.destroy();
          reject(new TooLargeError(maxBytes));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => resolve({ status, headers: h, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchRequest(fetchImpl: typeof fetch, u: URL, headers: Record<string, string>, maxBytes: number, signal: AbortSignal): Promise<RawResponse> {
  const res = await fetchImpl(u.toString(), { method: 'GET', headers, redirect: 'manual', signal });
  const h: Record<string, string> = {};
  res.headers.forEach((v, k) => (h[k.toLowerCase()] = v));
  if (res.status >= 300 && res.status < 400) return { status: res.status, headers: h };
  const declared = Number(h['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) throw new TooLargeError(maxBytes);
  const chunks: Buffer[] = [];
  let size = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new TooLargeError(maxBytes);
      }
      chunks.push(Buffer.from(value));
    }
  }
  return { status: res.status, headers: h, body: Buffer.concat(chunks) };
}

export interface GetOptions {
  timeoutMs: number;
  maxBytes: number;
  accept?: string;
}

export interface GetResult {
  status: number;
  contentType: string;
  body: Buffer;
  finalUrl: string;
}

/** GET with SSRF checks on every hop, a hard deadline and a streamed size cap.
 *  Returns non-2xx responses too (callers turn them into friendly messages). */
export async function safeGet(raw: string | URL, policy: NetPolicy, opts: GetOptions): Promise<GetResult> {
  let u = checkUrl(raw, policy);
  const signal = AbortSignal.timeout(opts.timeoutMs);
  const headers = { 'user-agent': policy.userAgent ?? DEFAULT_USER_AGENT, accept: opts.accept ?? '*/*' };
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: RawResponse;
    try {
      res = policy.fetchImpl ? await fetchRequest(policy.fetchImpl, u, headers, opts.maxBytes, signal) : await nodeRequest(u, policy, headers, opts.maxBytes, signal);
    } catch (e) {
      throw mapNetworkError(e, u);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      u = checkUrl(new URL(res.headers.location, u), policy);
      continue;
    }
    return { status: res.status, contentType: (res.headers['content-type'] ?? '').toLowerCase(), body: res.body ?? Buffer.alloc(0), finalUrl: u.toString() };
  }
  throw new ImportError('The link redirects too many times.', 502, 'redirects');
}
