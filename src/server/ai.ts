// Optional AI-powered answers for computer opponents (R3-14). Everything happens on the trusted
// game server: player phones, the TV and even the host's browser never see the API key, and the
// game never waits on the network for long — any failure falls back to offline answers.
//
// Key storage: a separate file in the data folder (never the database, so it is not in backups,
// exports or game history). In the Windows app it is encrypted with Electron safeStorage (DPAPI,
// tied to the Windows user account); development servers without Electron store it unencrypted.
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { DB } from './db/db.js';
import { getSetting, setSetting } from './db/db.js';
import { aiConfigSchema, DEFAULT_AI_CONFIG, keyRequired, type AiConfig, type AiStatus } from '../shared/ai.js';
import type { BotLevel } from '../shared/game.js';
import type { ClueContext } from './botAnswers.js';

/** Electron's safeStorage, injected by the desktop app. */
export interface SecretCodec {
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

const LEVEL_PERSONA: Record<BotLevel, string> = {
  easy: 'a casual player who often guesses',
  medium: 'a reasonably well-read player',
  hard: 'a strong, confident quiz player',
  expert: 'a champion-level quiz player',
};

// Server-side refusal fallback ('default' routing) is offered for these models on the Claude API.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/^(what|who|where|when) (is|are|was|were) /, '')
    .replace(/^(the|a|an) /, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** An HTTP error from an OpenAI-compatible server (local Ollama / LM Studio or a cloud service). */
class CompatError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`HTTP ${status}`);
  }
}

/** Reads {"answer": "..."} even when a local model wraps it in prose or a code fence. */
function parseAnswerJson(raw: string): string | null {
  const tryParse = (t: string) => {
    try {
      const v = (JSON.parse(t) as { answer?: unknown }).answer;
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  };
  return tryParse(raw) ?? (() => {
    const m = /\{[\s\S]*\}/.exec(raw);
    return m ? tryParse(m[0]) : null;
  })();
}

/** Our own deadline on top of the SDK's, so nothing can keep a bot waiting. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Anthropic.APIConnectionTimeoutError()), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export class AiService {
  private keyFile: string;
  private client: Anthropic | null = null;
  private clientKey: string | null = null;
  private stats = { requests: 0, failures: 0, lastLatencyMs: null as number | null, lastError: null as string | null, lastErrorAt: null as number | null };
  private perGame = new Map<string, number>();
  private cache = new Map<string, string>();
  /** Replaced in tests. */
  makeClient: (key: string, timeoutMs: number) => Anthropic = (apiKey, timeout) => new Anthropic({ apiKey, timeout, maxRetries: 0 });
  /** Replaced in tests (OpenAI-compatible provider). */
  fetchImpl: typeof fetch = (input, init) => fetch(input, init);

  constructor(
    private db: DB,
    dataDir: string,
    private codec: SecretCodec | null,
  ) {
    this.keyFile = path.join(dataDir, 'secrets', codec ? 'ai-key.bin' : 'ai-key.txt');
  }

  config(): AiConfig {
    const r = aiConfigSchema.safeParse({ ...DEFAULT_AI_CONFIG, ...getSetting<Partial<AiConfig>>(this.db, 'aiConfig', {}) });
    return r.success ? r.data : DEFAULT_AI_CONFIG;
  }

  setConfig(c: AiConfig) {
    setSetting(this.db, 'aiConfig', c);
  }

  private readKey(): string | null {
    try {
      const buf = fs.readFileSync(this.keyFile);
      const key = this.codec ? this.codec.decrypt(buf) : buf.toString('utf8');
      return key.trim() || null;
    } catch {
      return null;
    }
  }

  setKey(key: string | null) {
    this.client = null;
    this.clientKey = null;
    if (!key) {
      fs.rmSync(this.keyFile, { force: true });
      return;
    }
    fs.mkdirSync(path.dirname(this.keyFile), { recursive: true });
    fs.writeFileSync(this.keyFile, this.codec ? this.codec.encrypt(key.trim()) : key.trim(), { mode: 0o600 });
  }

  status(gameId: string | null): AiStatus {
    const config = this.config();
    const keySaved = this.readKey() != null;
    const needsKey = keyRequired(config.provider);
    return { config, keySaved, keyProtected: !!this.codec, keyRequired: needsKey, ready: config.enabled && (keySaved || !needsKey), ...this.stats, gameRequests: gameId ? (this.perGame.get(gameId) ?? 0) : 0 };
  }

  /** AI answers are possible right now (enabled + key when the provider needs one). */
  usable() {
    const cfg = this.config();
    return cfg.enabled && (!keyRequired(cfg.provider) || this.readKey() != null);
  }

  /**
   * One chat request to an OpenAI-compatible server (/chat/completions). Works with a local Ollama
   * or LM Studio on the game computer or the LAN — no internet needed — or a cloud service with a key.
   */
  private async compatChat(cfg: AiConfig, system: string, user: string, timeoutMs: number, json: boolean): Promise<string> {
    const key = this.readKey();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.7,
          max_tokens: 200,
          stream: false,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new CompatError(res.status, (await res.text().catch(() => '')).slice(0, 200));
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return body.choices?.[0]?.message?.content ?? '';
    } finally {
      clearTimeout(t);
    }
  }

  private sdk(timeoutMs: number): Anthropic {
    const key = this.readKey();
    if (!key) throw new Error('No API key saved');
    if (!this.client || this.clientKey !== key) {
      this.client = this.makeClient(key, timeoutMs);
      this.clientKey = key;
    }
    return this.client;
  }

  /** A provider error as plain words for the host — never containing the key. */
  private describe(e: unknown): string {
    const key = this.readKey();
    let msg: string;
    const where = this.config().baseUrl;
    if (e instanceof CompatError) {
      msg =
        e.status === 401 || e.status === 403
          ? 'The AI server did not accept the API key.'
          : e.status === 404
            ? /model/i.test(e.detail)
              ? `That model is not available on the AI server (for Ollama: "ollama pull ${this.config().model}").`
              : 'The AI server address looks wrong (expected something like http://localhost:11434/v1).'
            : `The AI server returned an error (${e.status}).`;
    } else if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) msg = 'The AI took too long to answer.';
    else if (e instanceof TypeError && /fetch/i.test(e.message)) msg = `Could not reach the AI server at ${where} — is it running?`;
    else if (e instanceof Anthropic.AuthenticationError) msg = 'The API key was not accepted.';
    else if (e instanceof Anthropic.PermissionDeniedError) msg = 'This API key may not use that model.';
    else if (e instanceof Anthropic.NotFoundError) msg = 'That model was not found.';
    else if (e instanceof Anthropic.RateLimitError) msg = 'The provider is rate-limiting requests (or the account is out of credit).';
    else if (e instanceof Anthropic.APIConnectionTimeoutError) msg = 'The AI took too long to answer.';
    else if (e instanceof Anthropic.APIConnectionError) msg = 'Could not reach the AI provider (no internet connection?).';
    else if (e instanceof Anthropic.APIError) msg = `The AI provider returned an error (${e.status ?? 'unknown'}).`;
    else msg = e instanceof Error ? e.message : String(e);
    return key ? msg.split(key).join('***') : msg;
  }

  private fail(e: unknown) {
    this.stats.failures++;
    this.stats.lastError = this.describe(e);
    this.stats.lastErrorAt = Date.now();
    return this.stats.lastError;
  }

  private request(model: string) {
    const fb = FALLBACK_MODELS.has(model);
    return { betas: fb ? ['server-side-fallback-2026-07-01'] : [], fallbacks: fb ? ('default' as const) : undefined };
  }

  /** "Test connection": one tiny request with the saved key and model. */
  async test(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const cfg = this.config();
    const started = Date.now();
    if (cfg.provider === 'openai') {
      try {
        const reply = await this.compatChat(cfg, 'You are a connection test.', 'Reply with the single word: ready', Math.max(cfg.timeoutSeconds, 15) * 1000, false);
        this.stats.lastLatencyMs = Date.now() - started;
        this.stats.lastError = null;
        return { ok: reply.trim().length > 0, latencyMs: this.stats.lastLatencyMs };
      } catch (e) {
        return { ok: false, error: this.fail(e) };
      }
    }
    try {
      const client = this.sdk(cfg.timeoutSeconds * 1000);
      const extra = this.request(cfg.model);
      const res = await withTimeout(client.beta.messages.create(
        { model: cfg.model, max_tokens: 512, ...extra, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Reply with the single word: ready' }] },
        { timeout: Math.max(cfg.timeoutSeconds, 15) * 1000 },
      ), Math.max(cfg.timeoutSeconds, 15) * 1000 + 500);
      this.stats.lastLatencyMs = Date.now() - started;
      this.stats.lastError = null;
      return { ok: res.stop_reason !== 'refusal', latencyMs: this.stats.lastLatencyMs };
    } catch (e) {
      return { ok: false, error: this.fail(e) };
    }
  }

  /** Models this key can use (ids only). */
  async models(): Promise<string[]> {
    const cfg = this.config();
    if (cfg.provider === 'openai') {
      const key = this.readKey();
      const res = await this.fetchImpl(`${cfg.baseUrl.replace(/\/+$/, '')}/models`, { headers: key ? { authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(cfg.timeoutSeconds * 1000) });
      if (!res.ok) throw new CompatError(res.status, '');
      const body = (await res.json()) as { data?: { id?: string }[] };
      return (body.data ?? []).map((m) => m.id).filter((id): id is string => !!id);
    }
    const client = this.sdk(this.config().timeoutSeconds * 1000);
    const out: string[] = [];
    for await (const m of client.models.list({ limit: 100 })) out.push(m.id);
    return out;
  }

  /**
   * One answer for a computer opponent. Resolves to null (never throws) when the AI is off, the
   * per-game limit is reached, the request fails or times out, or the reply is unusable — the
   * caller then uses its fallback. `budgetMs` caps the wait (e.g. the answer timer).
   */
  async answer(req: { gameId: string; level: BotLevel; ctx: ClueContext; correct: boolean; avoid: Set<string>; final: boolean; budgetMs?: number }): Promise<{ text: string } | { text: null; reason: string }> {
    const cfg = this.config();
    if (!cfg.enabled) return { text: null, reason: 'AI answers are turned off' };
    if (keyRequired(cfg.provider) && !this.readKey()) return { text: null, reason: 'No API key saved' };
    const used = this.perGame.get(req.gameId) ?? 0;
    if (cfg.maxPerGame > 0 && used >= cfg.maxPerGame) return { text: null, reason: `AI limit of ${cfg.maxPerGame} answers for this game reached` };
    const cacheKey = `${cfg.provider}|${cfg.model}|${req.level}|${req.correct}|${req.ctx.question}|${req.ctx.answer}`;
    const cached = this.cache.get(cacheKey);
    if (cached && !req.avoid.has(cached)) return { text: cached };

    const timeoutMs = Math.max(1500, Math.min(cfg.timeoutSeconds * 1000, req.budgetMs ?? Infinity));
    const instruction = req.correct
      ? `You know this one. The correct response is: "${req.ctx.answer}". Give it the way a player would say it out loud — short, no explanation.`
      : `You do NOT know this one. The correct response is "${req.ctx.answer}" — you must not give it, part of it, or anything equivalent. Give a plausible wrong guess that ${LEVEL_PERSONA[req.level]} might make: related to the clue and category, same kind of thing as the right answer (a person for a person, a year for a year, a place for a place).${req.avoid.size ? ` Do not repeat any of these earlier guesses: ${[...req.avoid].slice(-8).map((a) => `"${a}"`).join(', ')}.` : ''}`;
    const prompt = `Category: ${req.ctx.category}\n${req.final ? 'Final clue' : `Clue (worth ${req.ctx.value})`}: ${req.ctx.question || '(a picture or sound clue)'}\n\nYou are ${LEVEL_PERSONA[req.level]}. ${instruction}\nThe answer may be up to 8 words.`;

    const started = Date.now();
    this.perGame.set(req.gameId, used + 1);
    if (this.perGame.size > 50) this.perGame.delete(this.perGame.keys().next().value!);
    this.stats.requests++;
    const system = 'You play a contestant in a friendly, offline trivia party game. Reply only with the JSON object asked for.';
    if (cfg.provider === 'openai') {
      try {
        const raw = await this.compatChat(cfg, system, `${prompt}\nReply with JSON only, exactly like {"answer": "..."}.`, timeoutMs, true);
        this.stats.lastLatencyMs = Date.now() - started;
        const parsed = parseAnswerJson(raw);
        if (parsed == null) return { text: null, reason: this.fail(new Error('The AI reply could not be read.')) };
        return this.accept(req, parsed, cacheKey);
      } catch (e) {
        return { text: null, reason: this.fail(e) };
      }
    }
    try {
      const client = this.sdk(timeoutMs);
      const res = await withTimeout(client.beta.messages.create(
        {
          model: cfg.model,
          max_tokens: 1024,
          ...this.request(cfg.model),
          system,
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false } },
          },
          messages: [{ role: 'user', content: prompt }],
        },
        { timeout: timeoutMs },
      ), timeoutMs + 250);
      this.stats.lastLatencyMs = Date.now() - started;
      if (res.stop_reason === 'refusal') return { text: null, reason: this.fail(new Error('The AI declined to answer.')) };
      const block = res.content.find((b) => b.type === 'text');
      const raw = block && block.type === 'text' ? block.text : '';
      let text = '';
      try {
        text = String((JSON.parse(raw) as { answer?: unknown }).answer ?? '');
      } catch {
        return { text: null, reason: this.fail(new Error('The AI reply could not be read.')) };
      }
      return this.accept(req, text, cacheKey);
    } catch (e) {
      return { text: null, reason: this.fail(e) };
    }
  }

  /** Checks shared by every provider: tidy the text, refuse empty/long replies and right "wrong" answers. */
  private accept(req: { correct: boolean; ctx: ClueContext }, raw: string, cacheKey: string): { text: string } | { text: null; reason: string } {
    const text = raw.replace(/\s+/g, ' ').replace(/^["“']+|["”']+$/g, '').trim();
    if (!text || text.length > 120) return { text: null, reason: this.fail(new Error('The AI reply was empty or too long.')) };
    // A "wrong" answer that is actually right would hand out points the bot should not get.
    if (!req.correct) {
      const a = norm(text);
      const b = norm(req.ctx.answer);
      if (a === b || (b.length > 3 && a.includes(b))) return { text: null, reason: 'The AI gave the right answer when it should not have; used an offline answer instead' };
    }
    this.stats.lastError = null;
    this.cache.set(cacheKey, text);
    if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value!);
    return { text };
  }
}
