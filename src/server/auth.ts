// Local authentication: salted scrypt PIN hashes, hashed session tokens,
// per-profile lockouts and per-client rate limiting.
import crypto from 'node:crypto';
import type { DB } from './db/db.js';

// scrypt parameters (memory-hard; Argon2 is not available in Electron's BoringSSL).
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [alg, n, r, p, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(pin, Buffer.from(saltB64, 'base64'), expected.length, { N: +n, r: +r, p: +p });
  return crypto.timingSafeEqual(actual, expected);
}

export const PIN_RE = /^\d{4}$/;

export function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
export function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const DAY = 86_400_000;
export const SESSION_TTL = { host: 30 * DAY, profile: 180 * DAY };

export interface Session {
  kind: 'host' | 'profile';
  profileId: string | null;
}

export function createSession(db: DB, kind: 'host' | 'profile', profileId: string | null, label?: string): string {
  const token = newToken();
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, kind, profile_id, label, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    tokenHash(token),
    kind,
    profileId,
    label ?? null,
    now,
    now,
    now + SESSION_TTL[kind],
  );
  return token;
}

export function readSession(db: DB, token: string | undefined | null): Session | null {
  if (!token || token.length > 200) return null;
  const row = db
    .prepare(
      `SELECT s.kind, s.profile_id, s.expires_at, s.last_seen_at, p.deleted_at FROM sessions s
       LEFT JOIN profiles p ON p.id = s.profile_id WHERE s.token_hash = ?`,
    )
    .get(tokenHash(token)) as { kind: 'host' | 'profile'; profile_id: string | null; expires_at: number; last_seen_at: number; deleted_at: number | null } | undefined;
  if (!row) return null;
  const now = Date.now();
  if (row.expires_at < now || (row.kind === 'profile' && row.deleted_at)) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    return null;
  }
  if (now - row.last_seen_at > 60_000) {
    // sliding expiry
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?').run(now, now + SESSION_TTL[row.kind], tokenHash(token));
  }
  return { kind: row.kind, profileId: row.profile_id };
}

export function deleteSession(db: DB, token: string) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

export function deleteProfileSessions(db: DB, profileId: string) {
  db.prepare('DELETE FROM sessions WHERE profile_id = ?').run(profileId);
}

/** Lockout after repeated failures: 5 fails -> 30s, 10 -> 60s, 15 -> 120s ... capped at 15 min. */
export function lockoutMs(failedAttempts: number): number {
  if (failedAttempts < 5 || failedAttempts % 5 !== 0) return 0;
  return Math.min(30_000 * 2 ** (failedAttempts / 5 - 1), 15 * 60_000);
}

/** Sliding-window rate limiter keyed by client (IP) for authentication endpoints. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}
  /** Returns 0 if allowed, otherwise ms until the next attempt is allowed. */
  check(key: string, now = Date.now()): number {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return this.windowMs - (now - arr[0]);
    }
    arr.push(now);
    this.hits.set(key, arr);
    return 0;
  }
}

/** Short numeric pairing code shown only on the desktop app; entered on the iPad to become host. */
export function newPairingCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}
