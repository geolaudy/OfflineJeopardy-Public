// AI provider registry (R5-11). A provider only knows how to talk to one kind of API: send one
// chat request, list models, and turn its errors into plain words. Everything about the game
// (bot answers, guards, per-game limits, cache, cooldowns, fallbacks) stays in AiService, so a new
// provider never touches bot logic. Providers run only in the game server process; the API key is
// passed in per call and must never appear in a URL, an error message or a log line.
import type Anthropic from '@anthropic-ai/sdk';
import type { AiConfig, AiModelOption, AiProvider } from '../../shared/ai.js';

/** What the request is for: providers pick token budgets per kind. */
export type ChatKind = 'test' | 'answer' | 'board' | 'clue';

/** A JSON Schema (the subset all providers understand: object/array/string, properties, required). */
export type JsonSchema = { readonly [k: string]: unknown };

export interface ChatRequest {
  kind: ChatKind;
  system: string;
  prompt: string;
  /**
   * Appended to the prompt by providers without strict structured output (e.g. local models), so
   * they still reply with JSON.
   */
  jsonHint?: string;
  /** Ask for JSON in this shape (structured output where the provider supports it). */
  schema?: JsonSchema;
  /** Hard deadline for the whole request, retries included. */
  timeoutMs: number;
}

/** Replaceable in tests (AiService.makeClient / AiService.fetchImpl). */
export interface ProviderDeps {
  fetch: typeof fetch;
  makeAnthropic: (key: string, timeoutMs: number) => Anthropic;
}

/** The provider asked us to slow down (HTTP 429) or the quota is used up. */
export interface RateLimitInfo {
  /** How long the provider asked us to wait (null = it did not say). */
  retryAfterMs: number | null;
  /** Short plain-language reason, e.g. "Gemini free-tier limit reached". */
  label: string;
}

export interface AiProviderImpl {
  id: AiProvider;
  label: string;
  keyRequired: boolean;
  /** One request; resolves to the reply text. Throws AiRefusal when the model declines. */
  chat(cfg: AiConfig, key: string | null, req: ChatRequest): Promise<string>;
  models(cfg: AiConfig, key: string | null): Promise<AiModelOption[]>;
  /** Plain words for the host, or null when the error is not one this provider knows. */
  describeError(e: unknown, cfg: AiConfig): string | null;
  /** Set when the error means "too many requests / quota reached": AiService pauses the provider. */
  rateLimit(e: unknown): RateLimitInfo | null;
}

/** The model declined (safety filter, refusal). AiService words it for the request kind. */
export class AiRefusal extends Error {
  constructor() {
    super('The AI declined to answer.');
    this.name = 'AiRefusal';
  }
}

/** The host has not chosen a model yet (Gemini has no default model). */
export class AiNoModel extends Error {
  constructor(provider: string) {
    super(`Choose a ${provider} model first (Settings → AI answers → Load).`);
    this.name = 'AiNoModel';
  }
}

export const isAbort = (e: unknown) => e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
export const isNetworkError = (e: unknown) => e instanceof TypeError && /fetch|network/i.test(e.message);

/** Retry-After header: seconds or an HTTP date. */
export function parseRetryAfter(v: string | null | undefined, now = Date.now()): number | null {
  if (!v) return null;
  const s = Number(v);
  if (Number.isFinite(s) && s >= 0) return Math.round(s * 1000);
  const d = Date.parse(v);
  return Number.isFinite(d) ? Math.max(0, d - now) : null;
}
