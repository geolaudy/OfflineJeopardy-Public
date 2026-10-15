// Optional AI answers for computer opponents (R3-14). Shared between the server and the host UI.
// The API key never appears in these types: the server only ever reports whether one is saved.
import { z } from 'zod';

export const AI_PROVIDERS = { anthropic: 'Anthropic (Claude)', gemini: 'Google Gemini', openai: 'Local AI or OpenAI-compatible (Ollama, LM Studio…)' } as const;
export type AiProvider = keyof typeof AI_PROVIDERS;
export const AI_PROVIDER_IDS = ['anthropic', 'gemini', 'openai'] as const satisfies readonly AiProvider[];

/** Used until the host picks one from the provider's model list. */
export const DEFAULT_AI_MODEL = 'claude-opus-5-5';
/** A small model most local servers can run (Ollama's name). */
export const DEFAULT_LOCAL_MODEL = 'llama3.2';
/** Ollama's OpenAI-compatible endpoint on the game computer itself. */
export const DEFAULT_LOCAL_URL = 'http://127.0.0.1:11434/v1';

/**
 * Gemini has no default model: model names change often, so the host picks one from Google's list
 * ("Load"). "Test connection" picks a Flash model automatically when none is chosen yet.
 */
export const DEFAULT_GEMINI_MODEL = '';

/** Cloud providers need a key; a local server usually does not (an OpenAI-compatible cloud service does). */
export const keyRequired = (p: AiProvider) => p === 'anthropic' || p === 'gemini';

/** One entry of a provider's model list (label = a readable name when the provider has one). */
export interface AiModelOption {
  id: string;
  label: string;
}

export const aiConfigSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.enum(AI_PROVIDER_IDS),
    /** OpenAI-compatible server (local Ollama/LM Studio, or a cloud service); http(s) only. */
    baseUrl: z.string().trim().max(200).regex(/^https?:\/\/[^\s]+$/i),
    /** Empty only for Gemini (= not chosen yet). */
    model: z.string().trim().max(100),
    /** Give up on a request after this long (the bot then answers offline). */
    timeoutSeconds: z.number().int().min(2).max(60),
    /** Spending guard: AI answers per game; later answers are offline. 0 = no limit. */
    maxPerGame: z.number().int().min(0).max(1000),
    /** When the AI cannot answer: use the offline answer, or the bot passes. */
    fallback: z.enum(['local', 'pass']),
  })
  .refine((c) => c.model.length > 0 || c.provider === 'gemini', { message: 'Choose a model', path: ['model'] });
export type AiConfig = z.infer<typeof aiConfigSchema>;

export const DEFAULT_AI_CONFIG: AiConfig = { enabled: false, provider: 'anthropic', model: DEFAULT_AI_MODEL, baseUrl: DEFAULT_LOCAL_URL, timeoutSeconds: 8, maxPerGame: 100, fallback: 'local' };

export interface AiStatus {
  config: AiConfig;
  /** An API key is saved (its value is never sent to any client). */
  keySaved: boolean;
  /** The key is encrypted by Windows for this user account (false = stored as a plain file, development builds). */
  keyProtected: boolean;
  /** The chosen provider needs an API key. */
  keyRequired: boolean;
  /** Enabled, key saved (when needed) and the provider reachable as far as we know. */
  ready: boolean;
  requests: number;
  failures: number;
  lastLatencyMs: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  /** AI answers used in the current game (for the per-game limit). */
  gameRequests: number;
  /**
   * The provider said "too many requests" or "quota used up": no requests until `until`, bots
   * answer offline meanwhile. `message` is plain language, e.g. "Gemini free-tier limit reached —
   * offline answers until 14:05".
   */
  cooldown: { until: number; message: string } | null;
  /** The provider needs a model chosen first (Gemini before "Load" / "Test connection"). */
  modelMissing: boolean;
}

/** Result of "Test connection"; `model` is set when the server picked one automatically. */
export interface AiTestResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  model?: string;
  note?: string;
}
