// An OpenAI-compatible server (/chat/completions, /models): a local Ollama or LM Studio on the game
// computer or the LAN — no internet needed — or a cloud service with a key. Plain fetch.
import { AI_PROVIDERS, type AiConfig } from '../../shared/ai.js';
import { isAbort, isNetworkError, parseRetryAfter, type AiProviderImpl, type ChatKind, type ProviderDeps } from './types.js';

/** An HTTP error from an OpenAI-compatible server. */
export class CompatError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(`HTTP ${status}`);
  }
}

/** Small local models: short budgets keep them fast. */
const MAX_TOKENS: Record<ChatKind, number> = { test: 200, answer: 200, board: 6000, clue: 400 };

const base = (cfg: AiConfig) => cfg.baseUrl.replace(/\/+$/, '');

export function createOpenAiCompatProvider(deps: () => ProviderDeps): AiProviderImpl {
  return {
    id: 'openai',
    label: AI_PROVIDERS.openai,
    keyRequired: false,

    async chat(cfg, key, req) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), req.timeoutMs);
      try {
        const res = await deps().fetch(`${base(cfg)}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
          body: JSON.stringify({
            model: cfg.model,
            messages: [
              { role: 'system', content: req.system },
              { role: 'user', content: req.jsonHint ? `${req.prompt}\n${req.jsonHint}` : req.prompt },
            ],
            temperature: 0.7,
            max_tokens: MAX_TOKENS[req.kind],
            stream: false,
            ...(req.schema ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new CompatError(res.status, (await res.text().catch(() => '')).slice(0, 200), parseRetryAfter(res.headers.get('retry-after')));
        const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return body.choices?.[0]?.message?.content ?? '';
      } finally {
        clearTimeout(t);
      }
    },

    async models(cfg, key) {
      const res = await deps().fetch(`${base(cfg)}/models`, { headers: key ? { authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(cfg.timeoutSeconds * 1000) });
      if (!res.ok) throw new CompatError(res.status, '');
      const body = (await res.json()) as { data?: { id?: string }[] };
      return (body.data ?? []).map((m) => m.id).filter((id): id is string => !!id).map((id) => ({ id, label: id }));
    },

    describeError(e, cfg) {
      if (e instanceof CompatError)
        return e.status === 401 || e.status === 403
          ? 'The AI server did not accept the API key.'
          : e.status === 404
            ? /model/i.test(e.detail)
              ? `That model is not available on the AI server (for Ollama: "ollama pull ${cfg.model}").`
              : 'The AI server address looks wrong (expected something like http://localhost:11434/v1).'
            : e.status === 429
              ? 'The AI server is rate-limiting requests (or the account is out of credit).'
              : `The AI server returned an error (${e.status}).`;
      if (isAbort(e)) return 'The AI took too long to answer.';
      if (isNetworkError(e)) return `Could not reach the AI server at ${cfg.baseUrl} — is it running?`;
      return null;
    },

    rateLimit(e) {
      return e instanceof CompatError && e.status === 429 ? { retryAfterMs: e.retryAfterMs, label: 'The AI server is limiting requests' } : null;
    },
  };
}
