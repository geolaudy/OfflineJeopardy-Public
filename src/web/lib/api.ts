// REST client + token storage. Tokens are bearer tokens kept in localStorage
// (host token and profile token are separate roles).

const HOST_KEY = 'oj.hostToken';
const PROFILE_KEY = 'oj.profileToken';

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string | null) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable (private mode) — session lasts for this page only */
  }
}

let memHost: string | null = null;
let memProfile: string | null = null;

export const tokens = {
  get host() {
    return memHost ?? safeGet(HOST_KEY);
  },
  set host(v: string | null) {
    memHost = v;
    safeSet(HOST_KEY, v);
  },
  get profile() {
    return memProfile ?? safeGet(PROFILE_KEY);
  },
  set profile(v: string | null) {
    memProfile = v;
    safeSet(PROFILE_KEY, v);
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  method: string,
  url: string,
  body?: unknown,
  opts: { as?: 'host' | 'profile'; form?: FormData } = {},
): Promise<T> {
  const token = opts.as === 'profile' ? tokens.profile : opts.as === 'host' ? tokens.host : undefined;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined && !opts.form) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: opts.form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError('Cannot reach the game computer. Check that you are on the same Wi-Fi network.', 0);
  }
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

export const hostApi = <T = unknown>(method: string, url: string, body?: unknown, form?: FormData) => api<T>(method, url, body, { as: 'host', form });
export const meApi = <T = unknown>(method: string, url: string, body?: unknown, form?: FormData) => api<T>(method, url, body, { as: 'profile', form });

/** Try to obtain a host session automatically on the game computer itself. */
export async function ensureLocalHost(): Promise<boolean> {
  if (tokens.host) {
    const r = await api<{ host: boolean }>('GET', '/api/host/check', undefined, { as: 'host' }).catch(() => ({ host: false }));
    if (r.host) return true;
    tokens.host = null;
  }
  try {
    const r = await api<{ token: string }>('POST', '/api/host/local-login');
    tokens.host = r.token;
    return true;
  } catch {
    return false;
  }
}

export async function downloadFile(url: string, filename: string) {
  const res = await fetch(url, { headers: tokens.host ? { authorization: `Bearer ${tokens.host}` } : {} });
  if (!res.ok) throw new ApiError('Download failed', res.status);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
