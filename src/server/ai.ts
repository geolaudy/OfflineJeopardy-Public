// Optional AI-powered answers for computer opponents (R3-14) and AI helpers in the editor (spec
// §19). Everything happens on the trusted game server: player phones, the TV and even the host's
// browser never see an API key, and the game never waits on the network for long — any failure
// falls back to offline answers.
//
// Providers (Anthropic, Google Gemini, local / OpenAI-compatible) live in ./aiProviders and only
// know how to talk to their API (R5-11). All game logic — prompts, guards, per-game limits, the
// cache, rate-limit cooldowns and fallbacks — is here and shared by every provider.
//
// Key storage: one file per provider in the data folder (never the database, so keys are not in
// backups, exports or game history; switching provider never reuses another provider's key). In
// the Windows app it is encrypted with Electron safeStorage (DPAPI, tied to the Windows user
// account); development servers without Electron store it unencrypted.
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { DB } from './db/db.js';
import { getSetting, setSetting } from './db/db.js';
import { AI_PROVIDER_IDS, AI_PROVIDERS, aiConfigSchema, DEFAULT_AI_CONFIG, keyRequired, type AiConfig, type AiModelOption, type AiProvider, type AiStatus, type AiTestResult } from '../shared/ai.js';
import type { BotLevel, BoardContent, Category } from '../shared/game.js';
import { blankClue, uid } from '../shared/boardUtils.js';
import { z } from 'zod';
import type { ClueContext } from './botAnswers.js';
import { AiNoModel, AiRefusal, createProviders, type AiProviderImpl, type ChatKind, type ChatRequest } from './aiProviders/index.js';

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

/** Pause after "too many requests" when the provider does not say how long (and the bounds). */
const DEFAULT_COOLDOWN_MS = 60_000;
const MIN_COOLDOWN_MS = 5_000;
const MAX_COOLDOWN_MS = 25 * 3600_000;

const REFUSAL: Record<ChatKind, string> = {
  test: 'The AI declined the test request.',
  answer: 'The AI declined to answer.',
  board: 'The AI declined to write this board — try another topic.',
  clue: 'The AI declined — try different wording.',
};

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/^(what|who|where|when) (is|are|was|were) /, '')
    .replace(/^(the|a|an) /, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Reads {"answer": "..."} even when a local model wraps it in prose or a code fence. */
function parseAnswerJson(raw: string): string | null {
  const v = parseJsonObject(raw) as { answer?: unknown } | null;
  return typeof v?.answer === 'string' ? v.answer : null;
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The model "Test connection" picks when none is chosen: the first with "flash" in its name, else the first. */
export function pickDefaultModel(models: AiModelOption[]): string | null {
  return (models.find((m) => /flash/i.test(m.id)) ?? models[0])?.id ?? null;
}

const ANSWER_SCHEMA = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false } as const;
const CLUE_SCHEMA = { type: 'object', properties: { clue: { type: 'string' }, answer: { type: 'string' } }, required: ['clue', 'answer'], additionalProperties: false } as const;

export class AiService {
  private secretsDir: string;
  private stats = { requests: 0, failures: 0, lastLatencyMs: null as number | null, lastError: null as string | null, lastErrorAt: null as number | null };
  private perGame = new Map<string, number>();
  private cache = new Map<string, string>();
  /** Provider paused after a rate-limit / quota error: no requests until `until`. */
  private cooldowns = new Map<AiProvider, { until: number; label: string }>();
  /** Replaced in tests (Anthropic SDK client). */
  makeClient: (key: string, timeoutMs: number) => Anthropic = (apiKey, timeout) => new Anthropic({ apiKey, timeout, maxRetries: 0 });
  /** Replaced in tests (Gemini and OpenAI-compatible providers use plain fetch). */
  fetchImpl: typeof fetch = (input, init) => fetch(input, init);
  readonly providers: Record<AiProvider, AiProviderImpl>;

  constructor(
    private db: DB,
    dataDir: string,
    private codec: SecretCodec | null,
  ) {
    this.secretsDir = path.join(dataDir, 'secrets');
    this.providers = createProviders(() => ({ fetch: this.fetchImpl, makeAnthropic: this.makeClient }));
    this.migrateLegacyKey();
  }

  private keyFile(p: AiProvider) {
    return path.join(this.secretsDir, `ai-key-${p}.${this.codec ? 'bin' : 'txt'}`);
  }

  /** Before R5-11 there was one key file: it belongs to the provider that was configured then. */
  private migrateLegacyKey() {
    const legacy = path.join(this.secretsDir, this.codec ? 'ai-key.bin' : 'ai-key.txt');
    try {
      if (!fs.existsSync(legacy)) return;
      const target = this.keyFile(this.config().provider);
      if (!fs.existsSync(target)) fs.renameSync(legacy, target);
    } catch {
      /* keep the old file; the host can paste the key again */
    }
  }

  config(): AiConfig {
    const r = aiConfigSchema.safeParse({ ...DEFAULT_AI_CONFIG, ...getSetting<Partial<AiConfig>>(this.db, 'aiConfig', {}) });
    return r.success ? r.data : DEFAULT_AI_CONFIG;
  }

  setConfig(c: AiConfig) {
    setSetting(this.db, 'aiConfig', c);
  }

  private readKey(p: AiProvider = this.config().provider): string | null {
    try {
      const buf = fs.readFileSync(this.keyFile(p));
      const key = this.codec ? this.codec.decrypt(buf) : buf.toString('utf8');
      return key.trim() || null;
    } catch {
      return null;
    }
  }

  /** Saves (or removes) the key of one provider — by default the configured one. */
  setKey(key: string | null, provider: AiProvider = this.config().provider) {
    const file = this.keyFile(provider);
    // A new key may come with a new quota: let the host try again straight away.
    this.cooldowns.delete(provider);
    if (!key) {
      fs.rmSync(file, { force: true });
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, this.codec ? this.codec.encrypt(key.trim()) : key.trim(), { mode: 0o600 });
  }

  private modelMissing(cfg: AiConfig) {
    return !cfg.model.trim();
  }

  /** Active pause of a provider after "too many requests" (expired pauses are dropped). */
  private cooldown(p: AiProvider) {
    const c = this.cooldowns.get(p);
    if (c && c.until <= Date.now()) {
      this.cooldowns.delete(p);
      return null;
    }
    return c ?? null;
  }

  status(gameId: string | null): AiStatus {
    const config = this.config();
    const keySaved = this.readKey(config.provider) != null;
    const needsKey = keyRequired(config.provider);
    const modelMissing = this.modelMissing(config);
    const cd = this.cooldown(config.provider);
    return {
      config,
      keySaved,
      keyProtected: !!this.codec,
      keyRequired: needsKey,
      ready: config.enabled && (keySaved || !needsKey) && !modelMissing,
      ...this.stats,
      gameRequests: gameId ? (this.perGame.get(gameId) ?? 0) : 0,
      cooldown: cd ? { until: cd.until, message: `${cd.label} — offline answers until ${clock(cd.until)}` } : null,
      modelMissing,
    };
  }

  /** AI answers are possible right now (enabled + key when the provider needs one + a model). */
  usable() {
    const cfg = this.config();
    return cfg.enabled && (!keyRequired(cfg.provider) || this.readKey() != null) && !this.modelMissing(cfg);
  }

  /** A provider error as plain words for the host — never containing any saved key. */
  private describe(e: unknown, kind: ChatKind = 'answer'): string {
    const cfg = this.config();
    let msg: string;
    if (e instanceof AiRefusal) msg = REFUSAL[kind];
    else msg = this.providers[cfg.provider].describeError(e, cfg) ?? (e instanceof Error ? e.message : String(e));
    for (const p of AI_PROVIDER_IDS) {
      const key = this.readKey(p);
      if (key) msg = msg.split(key).join('***');
    }
    return msg;
  }

  private fail(e: unknown, kind: ChatKind = 'answer') {
    this.stats.failures++;
    this.stats.lastError = this.describe(e, kind);
    this.stats.lastErrorAt = Date.now();
    // "Too many requests" / quota used up: pause this provider, bots answer offline meanwhile.
    const provider = this.config().provider;
    const rl = this.providers[provider].rateLimit(e);
    if (rl) {
      const wait = Math.min(MAX_COOLDOWN_MS, Math.max(MIN_COOLDOWN_MS, rl.retryAfterMs ?? DEFAULT_COOLDOWN_MS));
      const until = Date.now() + wait;
      this.cooldowns.set(provider, { until, label: rl.label });
      this.stats.lastError = `${rl.label} (paused until ${clock(until)})`;
    }
    return this.stats.lastError;
  }

  /** Plain-language reason when the provider is paused (null = go ahead). */
  private paused(provider: AiProvider): string | null {
    const cd = this.cooldown(provider);
    return cd ? `${cd.label} (paused until ${clock(cd.until)})` : null;
  }

  private chat(cfg: AiConfig, req: ChatRequest) {
    return this.providers[cfg.provider].chat(cfg, this.readKey(cfg.provider), req);
  }

  /**
   * "Test connection": one tiny request with the saved key and model. It is the host's way to
   * check again, so it also runs during a rate-limit pause (and ends the pause when it works).
   * Gemini has no default model: without one, the first Flash model from Google's list is chosen.
   */
  async test(): Promise<AiTestResult> {
    let cfg = this.config();
    const started = Date.now();
    const out: AiTestResult = { ok: false };
    try {
      if (this.modelMissing(cfg)) {
        const picked = pickDefaultModel(await this.providers[cfg.provider].models(cfg, this.readKey(cfg.provider)));
        if (!picked) return { ok: false, error: this.fail(new Error(`No ${AI_PROVIDERS[cfg.provider]} models are available for this key.`), 'test') };
        cfg = { ...cfg, model: picked };
        this.setConfig(cfg);
        out.model = picked;
        out.note = `No model was chosen, so ${picked} was selected.`;
      }
      const reply = await this.chat(cfg, { kind: 'test', system: 'You are a connection test.', prompt: 'Reply with the single word: ready', timeoutMs: Math.max(cfg.timeoutSeconds, 15) * 1000 });
      this.stats.lastLatencyMs = Date.now() - started;
      this.stats.lastError = null;
      this.cooldowns.delete(cfg.provider);
      return { ...out, ok: reply.trim().length > 0, latencyMs: this.stats.lastLatencyMs };
    } catch (e) {
      return { ...out, ok: false, error: this.fail(e, 'test') };
    }
  }

  /** Models this key can use (ids plus a readable label). */
  async models(): Promise<AiModelOption[]> {
    const cfg = this.config();
    return this.providers[cfg.provider].models(cfg, this.readKey(cfg.provider));
  }

  /** The model list for the host, or a plain-language reason (never containing a key). */
  async modelList(): Promise<{ ok: true; models: AiModelOption[] } | { ok: false; error: string }> {
    const cfg = this.config();
    if (keyRequired(cfg.provider) && !this.readKey(cfg.provider)) return { ok: false, error: 'Save an API key first' };
    try {
      return { ok: true, models: await this.models() };
    } catch (e) {
      const why = this.describe(e);
      return { ok: false, error: why === 'No API key saved' ? 'Save an API key first' : `Could not load the model list: ${why}` };
    }
  }

  /**
   * One answer for a computer opponent. Resolves to null (never throws) when the AI is off, the
   * per-game limit is reached, the provider is paused, the request fails or times out, or the
   * reply is unusable — the caller then uses its fallback. `budgetMs` caps the wait (e.g. the answer timer).
   */
  async answer(req: { gameId: string; level: BotLevel; ctx: ClueContext; correct: boolean; avoid: Set<string>; final: boolean; budgetMs?: number }): Promise<{ text: string } | { text: null; reason: string }> {
    const cfg = this.config();
    if (!cfg.enabled) return { text: null, reason: 'AI answers are turned off' };
    if (keyRequired(cfg.provider) && !this.readKey()) return { text: null, reason: 'No API key saved' };
    if (this.modelMissing(cfg)) return { text: null, reason: new AiNoModel(AI_PROVIDERS[cfg.provider]).message.replace(/\.$/, '') };
    const used = this.perGame.get(req.gameId) ?? 0;
    if (cfg.maxPerGame > 0 && used >= cfg.maxPerGame) return { text: null, reason: `AI limit of ${cfg.maxPerGame} answers for this game reached` };
    const cacheKey = `${cfg.provider}|${cfg.model}|${req.level}|${req.correct}|${req.ctx.question}|${req.ctx.answer}`;
    const cached = this.cache.get(cacheKey);
    if (cached && !req.avoid.has(cached)) return { text: cached };
    // Rate-limited: answer offline at once, without touching the network.
    const paused = this.paused(cfg.provider);
    if (paused) return { text: null, reason: paused };

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
    try {
      const raw = await this.chat(cfg, { kind: 'answer', system, prompt, jsonHint: 'Reply with JSON only, exactly like {"answer": "..."}.', schema: ANSWER_SCHEMA, timeoutMs });
      this.stats.lastLatencyMs = Date.now() - started;
      const parsed = parseAnswerJson(raw);
      if (parsed == null) return { text: null, reason: this.fail(new Error('The AI reply could not be read.')) };
      return this.accept(req, parsed, cacheKey);
    } catch (e) {
      return { text: null, reason: this.fail(e) };
    }
  }

  /** AI is set up for content creation (provider chosen, key saved when the provider needs one). */
  configured() {
    const cfg = this.config();
    return !keyRequired(cfg.provider) || this.readKey() != null;
  }

  /** Why content creation cannot run right now (null = it can). */
  private blocked(cfg: AiConfig, setup: string): string | null {
    if (!this.configured()) return setup;
    if (this.modelMissing(cfg)) return new AiNoModel(AI_PROVIDERS[cfg.provider]).message;
    const paused = this.paused(cfg.provider);
    return paused ? `${paused} — try again later.` : null;
  }

  /**
   * Spec §19 (optional offline AI): a whole board from a topic. Works with a local model (no internet,
   * no cost) or a cloud provider. The result is a draft for the host to check — every clue is marked as
   * AI-generated, and anything missing or duplicated is left blank to fill in by hand.
   */
  async generateBoard(req: { topic: string; categories: number; rows: number; difficulty: 'easy' | 'medium' | 'hard'; final: boolean }): Promise<{ ok: true; content: BoardContent; filled: number; total: number } | { ok: false; error: string }> {
    const cfg = this.config();
    const blocked = this.blocked(cfg, 'Set up AI first (Settings → AI answers): choose a local AI server or save an API key.');
    if (blocked) return { ok: false, error: blocked };
    const timeoutMs = Math.min(180, Math.max(90, cfg.timeoutSeconds * 6)) * 1000;
    const system = 'You write accurate trivia for a friendly offline quiz party game. Reply only with the JSON object asked for.';
    const prompt = [
      `Write a trivia board about: ${req.topic}.`,
      `Make exactly ${req.categories} categories, each with exactly ${req.rows} clues ordered from easiest to hardest (${req.difficulty} overall).`,
      'Each clue is a short factual statement (at most 25 words) in game-show style; its answer is a short response (1–5 words): a person, place, thing, title or number.',
      'Only use facts you are sure are true. Category names are short (at most 4 words), fun and different from each other. No answer may appear twice.',
      req.final ? 'Also write one harder Final Jeopardy! clue with its own category.' : '',
      'Reply with JSON only, exactly in this shape: {"categories":[{"name":"...","clues":[{"clue":"...","answer":"..."}]}]' + (req.final ? ',"final":{"category":"...","clue":"...","answer":"..."}' : '') + '}',
    ]
      .filter(Boolean)
      .join('\n');
    let raw: string;
    this.stats.requests++;
    const started = Date.now();
    try {
      raw = await this.chat(cfg, { kind: 'board', system, prompt, schema: GENERATED_JSON_SCHEMA, timeoutMs });
    } catch (e) {
      return { ok: false, error: this.fail(e, 'board') };
    }
    this.stats.lastLatencyMs = Date.now() - started;
    const parsed = generatedBoardSchema.safeParse(parseJsonObject(raw));
    if (!parsed.success) return { ok: false, error: this.fail(new Error('The AI reply was not a usable board — try again, or try a larger model.'), 'board') };
    this.stats.lastError = null;
    return { ok: true, ...buildGeneratedBoard(parsed.data, req) };
  }

  /**
   * Spec §19 helpers in the clue editor: write a clue for a given answer, or tidy an existing clue's
   * wording (grammar, clarity, game-show style) keeping its answer. A suggestion only — the host
   * accepts or ignores it.
   */
  async suggestClue(req: { mode: 'write' | 'tidy'; category: string; value: number; question: string; answer: string }): Promise<{ ok: true; question: string; answer: string } | { ok: false; error: string }> {
    const cfg = this.config();
    const blocked = this.blocked(cfg, 'Set up AI first (Settings → AI answers).');
    if (blocked) return { ok: false, error: blocked };
    const timeoutMs = Math.min(90, Math.max(20, cfg.timeoutSeconds * 3)) * 1000;
    const system = 'You help write accurate trivia for a friendly offline quiz party game. Reply only with the JSON object asked for.';
    const ctx = `Category: ${req.category || '(none)'}. Value: ${req.value} (higher = harder).`;
    const prompt =
      req.mode === 'write'
        ? `${ctx}\nWrite one game-show style clue (a short factual statement, at most 25 words) whose correct response is: "${req.answer}". Do not include the answer or an obvious form of it in the clue. Only use facts you are sure are true.\nReply with JSON only: {"clue": "...", "answer": "..."} (answer: the response as given, tidied if needed).`
        : `${ctx}\nImprove the wording of this clue: fix grammar and spelling, make it clear and in game-show style (a short factual statement, at most 25 words), keep the meaning and the facts. Correct response: "${req.answer || '(not given)'}" — it must not appear in the clue.\nClue: "${req.question}"\nReply with JSON only: {"clue": "...", "answer": "..."} (answer: the response, tidied if needed).`;
    this.stats.requests++;
    let raw: string;
    try {
      raw = await this.chat(cfg, { kind: 'clue', system, prompt, schema: CLUE_SCHEMA, timeoutMs });
    } catch (e) {
      return { ok: false, error: this.fail(e, 'clue') };
    }
    const v = parseJsonObject(raw) as { clue?: unknown; answer?: unknown } | null;
    const question = typeof v?.clue === 'string' ? v.clue.replace(/\s+/g, ' ').trim() : '';
    const answer = typeof v?.answer === 'string' && v.answer.trim() ? v.answer.replace(/\s+/g, ' ').trim() : req.answer;
    if (question.length < 3 || question.length > 400) return { ok: false, error: this.fail(new Error('The AI reply was not a usable clue — try again.'), 'clue') };
    // A clue that gives its own answer away is no clue.
    const a = norm(answer);
    if (a.length > 2 && norm(question).includes(a)) return { ok: false, error: 'The AI put the answer into the clue — try again or write it yourself.' };
    this.stats.lastError = null;
    return { ok: true, question, answer: answer.slice(0, 120) };
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

// ---------- AI board generation (spec §19) ----------

// Lenient on purpose: an empty or odd clue becomes a blank slot instead of rejecting the board.
const genClue = z.object({ clue: z.string().trim().max(400).optional(), answer: z.string().trim().max(120).optional() });
const generatedBoardSchema = z.object({
  categories: z.array(z.object({ name: z.string().trim().max(60).default(''), clues: z.array(genClue).max(10).default([]) })).min(1).max(8),
  final: z.object({ category: z.string().trim().min(1).max(60), clue: z.string().trim().min(3).max(400), answer: z.string().trim().min(1).max(120) }).optional(),
});
type GeneratedBoard = z.infer<typeof generatedBoardSchema>;

const GENERATED_JSON_SCHEMA = {
  type: 'object',
  properties: {
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, clues: { type: 'array', items: { type: 'object', properties: { clue: { type: 'string' }, answer: { type: 'string' } }, required: ['clue', 'answer'], additionalProperties: false } } },
        required: ['name', 'clues'],
        additionalProperties: false,
      },
    },
    final: { type: 'object', properties: { category: { type: 'string' }, clue: { type: 'string' }, answer: { type: 'string' } }, required: ['category', 'clue', 'answer'], additionalProperties: false },
  },
  required: ['categories'],
  additionalProperties: false,
} as const;

/** The first JSON object in a reply (local models sometimes add prose or a code fence). */
function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const m = /\{[\s\S]*\}/.exec(raw);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

export const AI_NOTE = 'AI-generated — check before playing';

/** A draft board from the AI reply: values 200…, every clue marked as AI-generated, gaps left blank. */
function buildGeneratedBoard(g: GeneratedBoard, req: { categories: number; rows: number; final: boolean }) {
  const seen = new Set<string>();
  const key = (a: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '');
  let filled = 0;
  const categories: Category[] = g.categories.slice(0, req.categories).map((cat) => ({
    id: uid('c'),
    name: cat.name,
    clues: Array.from({ length: req.rows }, (_, i) => {
      const value = (i + 1) * 200;
      const c = cat.clues[i];
      // Missing, incomplete or duplicate answers are left for the host to write.
      if (!c?.clue || c.clue.length < 3 || !c.answer || seen.has(key(c.answer))) return blankClue(value);
      seen.add(key(c.answer));
      filled++;
      return { id: uid('q'), value, question: c.clue, answer: c.answer, notes: AI_NOTE };
    }),
  }));
  while (categories.length < req.categories) categories.push({ id: uid('c'), name: '', clues: Array.from({ length: req.rows }, (_, i) => blankClue((i + 1) * 200)) });
  const content: BoardContent = { rounds: [{ id: uid('r'), name: 'Round 1', kind: 'standard', categories }] };
  if (req.final)
    content.rounds.push({
      id: uid('r'),
      name: 'Final Jeopardy!',
      kind: 'final',
      categories: [{ id: uid('c'), name: g.final?.category ?? '', clues: [g.final ? { id: uid('q'), value: 0, question: g.final.clue, answer: g.final.answer, notes: AI_NOTE } : blankClue(0)] }],
    });
  return { content, filled, total: req.categories * req.rows };
}
