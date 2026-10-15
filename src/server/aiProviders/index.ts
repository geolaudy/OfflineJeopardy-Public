// The provider registry (R5-11). Adding a provider = one file implementing AiProviderImpl, one entry
// here and one in AI_PROVIDERS (src/shared/ai.ts). Bot logic in AiService stays untouched.
import type { AiProvider } from '../../shared/ai.js';
import { createAnthropicProvider } from './anthropic.js';
import { createGeminiProvider } from './gemini.js';
import { createOpenAiCompatProvider } from './openaiCompat.js';
import type { AiProviderImpl, ProviderDeps } from './types.js';

export function createProviders(deps: () => ProviderDeps): Record<AiProvider, AiProviderImpl> {
  return {
    anthropic: createAnthropicProvider(deps),
    gemini: createGeminiProvider(deps),
    openai: createOpenAiCompatProvider(deps),
  };
}

export * from './types.js';
