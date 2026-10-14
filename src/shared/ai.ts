// Optional AI answers for computer opponents (R3-14). Shared between the server and the host UI.
// The API key never appears in these types: the server only ever reports whether one is saved.
import { z } from 'zod';

export const AI_PROVIDERS = { anthropic: 'Anthropic (Claude)' } as const;
export type AiProvider = keyof typeof AI_PROVIDERS;

/** Used until the host picks one from the provider's model list. */
export const DEFAULT_AI_MODEL = 'claude-opus-5-5';

export const aiConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['anthropic']),
  model: z.string().trim().min(1).max(100),
  /** Give up on a request after this long (the bot then answers offline). */
  timeoutSeconds: z.number().int().min(2).max(60),
  /** Spending guard: AI answers per game; later answers are offline. 0 = no limit. */
  maxPerGame: z.number().int().min(0).max(1000),
  /** When the AI cannot answer: use the offline answer, or the bot passes. */
  fallback: z.enum(['local', 'pass']),
});
export type AiConfig = z.infer<typeof aiConfigSchema>;

export const DEFAULT_AI_CONFIG: AiConfig = { enabled: false, provider: 'anthropic', model: DEFAULT_AI_MODEL, timeoutSeconds: 8, maxPerGame: 100, fallback: 'local' };

export interface AiStatus {
  config: AiConfig;
  /** An API key is saved (its value is never sent to any client). */
  keySaved: boolean;
  /** The key is encrypted by Windows for this user account (false = stored as a plain file, development builds). */
  keyProtected: boolean;
  /** Enabled, key saved and the provider reachable as far as we know. */
  ready: boolean;
  requests: number;
  failures: number;
  lastLatencyMs: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  /** AI answers used in the current game (for the per-game limit). */
  gameRequests: number;
}
