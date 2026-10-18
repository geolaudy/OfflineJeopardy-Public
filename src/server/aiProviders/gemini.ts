// Google Gemini through the official Gemini API (Google AI for Developers, REST v1beta), plain
// fetch — see RESEARCH_NOTES.md "Google Gemini API (R5-11)".
//
// - The key goes ONLY in the x-goog-api-key header, never in a query string, so it cannot end up
//   in a URL, a log line or an error message.
// - Model names come from Google's list (models.list); none is hardcoded.
// - 429 RESOURCE_EXHAUSTED: the RetryInfo retryDelay (or the daily reset) tells AiService how long
//   to pause; QuotaFailure tells whether it was the free tier.
// - R7-30.2: 500 / 502 / 503 / 504 ("model is overloaded") and dropped connections are retried at
//   most twice, with jittered backoff (≈ 0.5 s, 1.5 s; Retry-After when Google sends one), and only
//   while the request's time budget allows — a bot must still answer before its timer ends.
import { AI_PROVIDERS, type AiModelOption } from '../../shared/ai.js';
import { AiNoModel, AiRefusal, isAbort, isNetworkError, parseRetryAfter, type AiProviderImpl, type ChatKind, type JsonSchema, type ProviderDeps } from './types.js';

export const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';

/** Output budget per request kind. On thinking models these also cover the model's thinking. */
const MAX_TOKENS: Record<ChatKind, number> = { test: 512, answer: 1024, board: 16000, clue: 2048 };

/** Model ids as returned by models.list ("gemini-…"): safe to put into the URL path. */
const MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,99}$/i;

/** Waits between attempts after a transient error (ms, before jitter). */
export const GEMINI_RETRY_DELAYS = [500, 1500];
const transient = (e: unknown) => (e instanceof GeminiError && [500, 502, 503, 504].includes(e.status)) || (!isAbort(e) && isNetworkError(e));
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

const BLOCKED = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'LANGUAGE', 'OTHER', 'IMAGE_SAFETY']);

/** An error response from the Gemini API ({"error": {"code", "message", "status", "details"}}). */
export class GeminiError extends Error {
  constructor(
    readonly status: number,
    /** Google's status name, e.g. RESOURCE_EXHAUSTED, INVALID_ARGUMENT. */
    readonly gStatus: string,
    /** Google's message (scrubbed of the key by AiService before anyone sees it; never shown raw). */
    readonly detail: string,
    /** ErrorInfo.reason, e.g. API_KEY_INVALID. */
    readonly reason: string,
    readonly retryAfterMs: number | null,
    readonly freeTier: boolean,
    readonly daily: boolean,
  ) {
    super(`Gemini HTTP ${status}`);
    this.name = 'GeminiError';
  }
}

type Detail = { '@type'?: string; retryDelay?: string; reason?: string; violations?: { quotaId?: string; quotaMetric?: string }[] };

/** google.protobuf.Duration in JSON: "37s", "1.5s". */
export function parseDuration(d: unknown): number | null {
  if (typeof d !== 'string') return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(d.trim());
  return m ? Math.round(Number(m[1]) * 1000) : null;
}

/** Milliseconds until the next midnight in Pacific time (when Gemini's per-day quotas reset). */
export function msUntilPacificMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now);
  const n = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value) || 0;
  const secs = (n('hour') % 24) * 3600 + n('minute') * 60 + n('second');
  return Math.max(60_000, (24 * 3600 - secs) * 1000);
}

async function toError(res: Response): Promise<GeminiError> {
  let body: { error?: { code?: number; message?: string; status?: string; details?: Detail[] } } = {};
  try {
    body = JSON.parse(await res.text());
  } catch {
    /* not JSON: keep the HTTP status only */
  }
  const err = body.error ?? {};
  const details = Array.isArray(err.details) ? err.details : [];
  const retry = details.find((d) => d['@type']?.endsWith('google.rpc.RetryInfo'));
  const quota = details.filter((d) => d['@type']?.endsWith('google.rpc.QuotaFailure')).flatMap((d) => d.violations ?? []);
  const info = details.find((d) => d['@type']?.endsWith('google.rpc.ErrorInfo'));
  const ids = quota.map((v) => `${v.quotaId ?? ''} ${v.quotaMetric ?? ''}`).join(' ');
  return new GeminiError(
    res.status,
    String(err.status ?? ''),
    String(err.message ?? '').slice(0, 300),
    String(info?.reason ?? ''),
    parseDuration(retry?.retryDelay) ?? parseRetryAfter(res.headers.get('retry-after')),
    /free[_-]?tier/i.test(ids),
    /per ?day/i.test(ids),
  );
}

/** JSON Schema → the OpenAPI-style Schema of generationConfig.responseSchema (types upper-case, no additionalProperties). */
export function toGeminiSchema(s: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'additionalProperties') continue;
    if (k === 'type' && typeof v === 'string') out.type = v.toUpperCase();
    else if (k === 'properties' && v && typeof v === 'object') {
      out.properties = Object.fromEntries(Object.entries(v as Record<string, JsonSchema>).map(([p, sub]) => [p, toGeminiSchema(sub)]));
      out.propertyOrdering = Object.keys(v);
    } else if (k === 'items' && v && typeof v === 'object') out.items = toGeminiSchema(v as JsonSchema);
    else out[k] = v;
  }
  return out;
}

/** The request may have used a generation option this model does not support (worth one plain retry). */
const unsupportedOption = (e: GeminiError) => e.status === 400 && e.reason !== 'API_KEY_INVALID' && !/api key/i.test(e.detail) && /thinking|schema|mime|generation_?config|unknown name|not supported|invalid json payload/i.test(e.detail);

export function createGeminiProvider(deps: () => ProviderDeps): AiProviderImpl {
  /** From models.list: false = the model does not think (never send thinkingConfig). */
  const thinks = new Map<string, boolean>();
  /** Models that rejected thinkingConfig / responseSchema once: send plain requests from then on. */
  const plain = new Set<string>();

  const headers = (key: string | null) => {
    if (!key) throw new Error('No API key saved');
    return { 'content-type': 'application/json', 'x-goog-api-key': key };
  };

  return {
    id: 'gemini',
    label: AI_PROVIDERS.gemini,
    keyRequired: true,

    async chat(cfg, key, req) {
      const model = cfg.model.replace(/^models\//, '');
      if (!model) throw new AiNoModel('Gemini');
      if (!MODEL_ID.test(model)) throw new Error('That Gemini model name looks wrong — load the model list and choose one.');
      const h = headers(key);
      const signal = AbortSignal.timeout(req.timeoutMs);
      const deadline = Date.now() + req.timeoutMs;
      const sendOnce = async (simple: boolean) => {
        const generationConfig: Record<string, unknown> = { maxOutputTokens: MAX_TOKENS[req.kind] };
        if (req.schema && !simple) Object.assign(generationConfig, { responseMimeType: 'application/json', responseSchema: toGeminiSchema(req.schema) });
        // Quick answers: keep thinking low so bots answer within the time limit.
        if (!simple && req.kind !== 'board' && thinks.get(model) !== false) generationConfig.thinkingConfig = { thinkingLevel: 'LOW' };
        const res = await deps().fetch(`${GEMINI_API}/models/${model}:generateContent`, {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: 'user', parts: [{ text: req.jsonHint ? `${req.prompt}\n${req.jsonHint}` : req.prompt }] }],
            generationConfig,
          }),
          signal,
        });
        if (!res.ok) throw await toError(res);
        return res.json() as Promise<{
          candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
          promptFeedback?: { blockReason?: string };
        }>;
      };
      const send = async (simple: boolean) => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await sendOnce(simple);
          } catch (e) {
            if (!transient(e) || attempt >= GEMINI_RETRY_DELAYS.length) throw e;
            const hinted = e instanceof GeminiError ? e.retryAfterMs : null;
            const wait = Math.min(5000, hinted ?? GEMINI_RETRY_DELAYS[attempt] * (0.8 + Math.random() * 0.4));
            // Not worth it when the answer would come after the time limit anyway.
            if (Date.now() + wait + 1000 > deadline) throw e;
            await pause(wait, signal);
          }
        }
      };
      let body;
      try {
        body = await send(plain.has(model));
      } catch (e) {
        if (!(e instanceof GeminiError) || plain.has(model) || !unsupportedOption(e)) throw e;
        plain.add(model);
        body = await send(true);
      }
      if (body.promptFeedback?.blockReason) throw new AiRefusal();
      const cand = body.candidates?.[0];
      const text = (cand?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('');
      if (!text.trim() && cand?.finishReason && BLOCKED.has(cand.finishReason)) throw new AiRefusal();
      if (!text.trim() && cand?.finishReason === 'MAX_TOKENS') throw new Error('The AI ran out of room before it answered — try another model.');
      return text;
    },

    async models(cfg, key) {
      const h = headers(key);
      const out: AiModelOption[] = [];
      let pageToken = '';
      // Paginate (at most 20 pages, so a misbehaving server cannot keep us looping).
      for (let page = 0; page < 20; page++) {
        const q = new URLSearchParams({ pageSize: '1000', ...(pageToken ? { pageToken } : {}) });
        const res = await deps().fetch(`${GEMINI_API}/models?${q}`, { headers: h, signal: AbortSignal.timeout(Math.max(cfg.timeoutSeconds, 10) * 1000) });
        if (!res.ok) throw await toError(res);
        const body = (await res.json()) as { models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[]; thinking?: boolean }[]; nextPageToken?: string };
        for (const m of body.models ?? []) {
          if (!m.name || !m.supportedGenerationMethods?.includes('generateContent')) continue;
          const id = m.name.replace(/^models\//, '');
          if (!MODEL_ID.test(id)) continue;
          if (typeof m.thinking === 'boolean') thinks.set(id, m.thinking);
          out.push({ id, label: m.displayName && m.displayName !== id ? `${m.displayName} (${id})` : id });
        }
        pageToken = body.nextPageToken ?? '';
        if (!pageToken) break;
      }
      return out;
    },

    describeError(e) {
      if (e instanceof GeminiError) {
        const s = e.status;
        if (s === 429) return e.freeTier ? 'Gemini free-tier limit reached.' : 'Gemini rate limit or quota reached.';
        if (e.reason === 'API_KEY_INVALID' || /api key (not valid|invalid|expired)/i.test(e.detail) || s === 401) return 'Google did not accept the API key.';
        if (s === 403) return 'This Google API key may not use Gemini or that model.';
        if (s === 402) return 'The Google account has no prepaid credit left.';
        if (s === 404) return 'That Gemini model was not found — load the model list and choose another.';
        if (s === 400 && /location|region|country/i.test(e.detail)) return 'Google Gemini is not available in your region with this key.';
        if (s === 400 && e.gStatus === 'FAILED_PRECONDITION') return 'Google needs billing set up for this request (see Google AI Studio).';
        if (s >= 500) return `Google Gemini is busy or unavailable right now (error ${s}).`;
        return `Google Gemini returned an error (${s}).`;
      }
      if (isAbort(e)) return 'The AI took too long to answer.';
      if (isNetworkError(e)) return 'Could not reach Google Gemini (no internet connection?).';
      return null;
    },

    rateLimit(e) {
      if (!(e instanceof GeminiError) || e.status !== 429) return null;
      // A used-up daily quota only resets at midnight Pacific time; otherwise Google says when to retry.
      const retryAfterMs = e.daily ? Math.max(e.retryAfterMs ?? 0, msUntilPacificMidnight()) : e.retryAfterMs;
      return { retryAfterMs, label: e.freeTier ? 'Gemini free-tier limit reached' : 'Gemini rate limit reached' };
    },
  };
}
