// Anthropic (Claude) through the official SDK. Behaviour unchanged from R3-14: structured JSON
// output, low effort, server-side refusal fallback for the models that offer it, no SDK retries.
import Anthropic from '@anthropic-ai/sdk';
import type { AiConfig } from '../../shared/ai.js';
import { AI_PROVIDERS } from '../../shared/ai.js';
import { AiRefusal, parseRetryAfter, type AiProviderImpl, type ChatKind, type ProviderDeps } from './types.js';

// Server-side refusal fallback ('default' routing) is offered for these models on the Claude API.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

/** Output budget per request kind (room for the model's own reasoning at low effort). */
const MAX_TOKENS: Record<ChatKind, number> = { test: 512, answer: 1024, board: 16000, clue: 2048 };

/** Our own deadline on top of the SDK's, so nothing can keep a bot waiting. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Anthropic.APIConnectionTimeoutError()), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

function routing(model: string) {
  const fb = FALLBACK_MODELS.has(model);
  return { betas: fb ? ['server-side-fallback-2026-07-01'] : [], fallbacks: fb ? ('default' as const) : undefined };
}

export function createAnthropicProvider(deps: () => ProviderDeps): AiProviderImpl {
  // One SDK client per key (and per factory, so tests that swap the factory get a fresh one).
  let client: Anthropic | null = null;
  let clientKey: string | null = null;
  let clientFactory: ProviderDeps['makeAnthropic'] | null = null;
  const sdk = (key: string | null, timeoutMs: number): Anthropic => {
    if (!key) throw new Error('No API key saved');
    const make = deps().makeAnthropic;
    if (!client || clientKey !== key || clientFactory !== make) {
      client = make(key, timeoutMs);
      clientKey = key;
      clientFactory = make;
    }
    return client;
  };

  return {
    id: 'anthropic',
    label: AI_PROVIDERS.anthropic,
    keyRequired: true,

    async chat(cfg: AiConfig, key, req) {
      const c = sdk(key, req.timeoutMs);
      const res = await withTimeout(
        c.beta.messages.create(
          {
            model: cfg.model,
            max_tokens: MAX_TOKENS[req.kind],
            ...routing(cfg.model),
            ...(req.kind === 'test' ? {} : { system: req.system }),
            output_config: { effort: 'low', ...(req.schema ? { format: { type: 'json_schema', schema: req.schema as Record<string, unknown> } } : {}) },
            messages: [{ role: 'user', content: req.prompt }],
          },
          { timeout: req.timeoutMs },
        ),
        req.timeoutMs + (req.kind === 'answer' ? 250 : 500),
      );
      if (res.stop_reason === 'refusal') throw new AiRefusal();
      const block = res.content.find((b) => b.type === 'text');
      return block && block.type === 'text' ? block.text : '';
    },

    async models(cfg, key) {
      const c = sdk(key, cfg.timeoutSeconds * 1000);
      const out: { id: string; label: string }[] = [];
      for await (const m of c.models.list({ limit: 100 })) out.push({ id: m.id, label: m.display_name || m.id });
      return out;
    },

    describeError(e) {
      if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) return 'The AI took too long to answer.';
      if (e instanceof Anthropic.AuthenticationError) return 'The API key was not accepted.';
      if (e instanceof Anthropic.PermissionDeniedError) return 'This API key may not use that model.';
      if (e instanceof Anthropic.NotFoundError) return 'That model was not found.';
      if (e instanceof Anthropic.RateLimitError) return 'The provider is rate-limiting requests (or the account is out of credit).';
      if (e instanceof Anthropic.APIConnectionTimeoutError) return 'The AI took too long to answer.';
      if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the AI provider (no internet connection?).';
      if (e instanceof Anthropic.APIError) return `The AI provider returned an error (${e.status ?? 'unknown'}).`;
      return null;
    },

    rateLimit(e) {
      if (!(e instanceof Anthropic.RateLimitError)) return null;
      const h = e.headers as Headers | undefined;
      return { retryAfterMs: parseRetryAfter(typeof h?.get === 'function' ? h.get('retry-after') : null), label: 'Anthropic rate limit reached' };
    },
  };
}
