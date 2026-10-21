// Computer opponents (server-side). The driver looks at the authoritative state after every change
// and schedules what each computer player would do next — pick a clue, buzz, give an answer, wager —
// as ordinary engine actions, so they go through exactly the same arbitration and validation as
// Joy-Cons and phones. Computer players never buzz early and never judge themselves: their answer
// is shown to the host (and the TV), the answer timer stops, and the host decides (R3-10/13).
// In practice games the driver also opens the buzzers once the question has had time to be read.
import type { EngineAction } from '../shared/actions.js';
import { scoresOf, type BotLevel, type Competitor, type GameState } from '../shared/game.js';
import { timerRemaining } from '../shared/game.js';
import { roundMaxValue } from './engine/engine.js';
import { clueContext, localAnswer, pickClue, type ClueContext, type PickMemory } from './botAnswers.js';

interface LevelParams {
  know: number; // chance of knowing an average clue
  react: [number, number]; // ms after the buzzers open
  risk: number; // chance of buzzing without knowing (then answering wrong)
  think: [number, number]; // ms before answering after winning the buzz
  pick: [number, number]; // ms looking at the board before choosing a clue
  wager: number; // share of the allowed maximum it wagers on a Daily Wager
}

export const BOT_PARAMS: Record<BotLevel, LevelParams> = {
  easy: { know: 0.35, react: [1400, 2600], risk: 0.05, think: [2200, 3600], pick: [3000, 5000], wager: 0.2 },
  medium: { know: 0.55, react: [900, 1800], risk: 0.08, think: [1700, 3000], pick: [2400, 4000], wager: 0.35 },
  hard: { know: 0.72, react: [550, 1200], risk: 0.1, think: [1300, 2400], pick: [1800, 3000], wager: 0.5 },
  expert: { know: 0.88, react: [300, 750], risk: 0.1, think: [1000, 1900], pick: [1400, 2400], wager: 0.6 },
};

/** Request for an answer text (local generator by default; an AI provider can replace it). */
export interface AnswerRequest {
  bot: Competitor;
  level: BotLevel;
  clueId: string;
  ctx: ClueContext;
  /** Whether this bot is meant to get it right (decided by its difficulty). */
  correct: boolean;
  /** Answers this bot already gave in this game. */
  avoid: Set<string>;
  final: boolean;
  gameId: string;
  /** How long an answer may take (a running answer timer), if limited. */
  budgetMs?: number;
}
export interface AnswerResult {
  text: string;
  via: 'ai' | 'local';
  /** Shown to the host only (e.g. why the AI was not used). */
  warning?: string;
}
export type AnswerSource = (req: AnswerRequest, fallback: () => string) => Promise<AnswerResult>;

type Task = { delay: number; action: () => EngineAction | null | Promise<EngineAction | null> };

export class BotDriver {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private fired = new Set<string>();
  private memo = new Map<string, boolean>();
  private given = new Map<string, Set<string>>();
  /** Injected for tests. */
  random: () => number = Math.random;
  /** Multiplies every delay (tests use a small value). */
  speed = 1;
  /** Where answer texts come from (AI bots plug in here; must always resolve). */
  answerSource: AnswerSource = async (_req, fallback) => ({ text: fallback(), via: 'local' });
  /** Answers being prepared (started when the bot wins the buzz, so an AI reply has time). */
  private pending = new Map<string, Promise<AnswerResult>>();
  /** Latest state (async answers check it is still their turn). */
  private latest: GameState | null = null;
  /** R15-29: the clue a computer player is about to open (null: none) — shown on the board for
   *  `hintMs` before the clue opens, so everyone sees which tile it chose. */
  onHint: (clueId: string | null) => void = () => {};
  // R16-14: two short blinks and a longer third (board.css .is-picked), then the zoom.
  hintMs = 1400;

  constructor(private dispatch: (a: EngineAction) => void) {}

  sync(s: GameState | null) {
    this.latest = s;
    const wanted = new Map<string, Task>();
    if (s && !s.paused && s.phase !== 'lobby' && s.phase !== 'ended') this.plan(s, wanted);
    for (const [k, t] of this.timers)
      if (!wanted.has(k)) {
        clearTimeout(t);
        this.timers.delete(k);
      }
    for (const [k, task] of wanted) {
      if (this.timers.has(k) || this.fired.has(k)) continue;
      this.timers.set(
        k,
        setTimeout(() => {
          this.timers.delete(k);
          this.fired.add(k);
          if (this.fired.size > 2000) this.fired.clear();
          void Promise.resolve()
            .then(task.action)
            .then((a) => {
              if (a) this.dispatch(a);
            })
            .catch(() => {});
        }, Math.max(0, Math.round(task.delay * this.speed))),
      );
    }
  }

  stop() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  /** Each computer player has its own pace (0.85–1.2×), so two "Hard" bots never feel identical. */
  private pace(b: Competitor) {
    let h = 0;
    for (const ch of b.id + b.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return 0.85 + (h % 1000) / 1000 * 0.35;
  }

  private between([a, b]: [number, number], bot?: Competitor) {
    return (a + this.random() * (b - a)) * (bot ? this.pace(bot) : 1);
  }

  /** Stable per-key random decision (so re-planning never re-rolls). */
  private decide(key: string, p: number) {
    let v = this.memo.get(key);
    if (v === undefined) {
      v = this.random() < p;
      this.memo.set(key, v);
      if (this.memo.size > 5000) this.memo.clear();
    }
    return v;
  }

  /** Does this computer player know the answer? Harder (higher-value) clues are known less often. */
  knows(s: GameState, bot: Competitor, clueId: string, value: number) {
    const p = BOT_PARAMS[bot.bot!];
    const round = s.board.rounds[s.roundIndex];
    const values = [...new Set((round?.categories ?? []).flatMap((c) => c.clues.map((q) => q.value)))].sort((a, b) => a - b);
    const rank = values.length > 1 ? Math.max(0, values.indexOf(value)) / (values.length - 1) : 0.5;
    const chance = Math.min(0.97, Math.max(0.05, p.know * (1.15 - 0.35 * rank)));
    return this.decide(`know:${s.id}:${clueId}:${bot.id}`, chance);
  }

  /** The bot's answer (AI source if configured for this bot, local generator otherwise). */
  private async answerText(s: GameState, bot: Competitor, clueId: string, correct: boolean, final = false, budgetMs?: number): Promise<AnswerResult> {
    const ctx = clueContext(s.board, clueId);
    if (!ctx) return { text: 'Pass', via: 'local' };
    const key = `${s.id}:${bot.id}`;
    const avoid = this.given.get(key) ?? new Set<string>();
    const fallback = () => localAnswer(ctx, { correct, level: bot.bot!, random: this.random, avoid });
    let r: AnswerResult;
    try {
      r = await this.answerSource({ bot, level: bot.bot!, clueId, ctx, correct, avoid, final, gameId: s.id, budgetMs }, fallback);
      if (!r.text.trim()) r = { text: fallback(), via: 'local', warning: r.warning };
    } catch {
      r = { text: fallback(), via: 'local' };
    }
    avoid.add(r.text);
    this.given.set(key, avoid);
    if (this.given.size > 200) this.given.clear();
    return { ...r, text: r.text.trim().slice(0, 200) };
  }

  /** Start preparing an answer now; the scheduled task picks it up after the bot's thinking time. */
  private prepare(key: string, make: () => Promise<AnswerResult>) {
    let p = this.pending.get(key);
    if (!p) {
      p = make();
      this.pending.set(key, p);
      if (this.pending.size > 100) this.pending.delete(this.pending.keys().next().value!);
    }
    return p;
  }

  private submit(bot: Competitor, r: AnswerResult): EngineAction {
    return { type: 'submitAnswer', competitorId: bot.id, answer: r.text, via: r.via, ...(r.warning ? { warning: r.warning } : {}) };
  }

  private answerBudget(s: GameState) {
    return s.timer?.running && s.timer.kind === 'answer' ? Math.floor(timerRemaining(s.timer, Date.now()) * 0.8) : undefined;
  }

  private memory(s: GameState, botId: string): PickMemory {
    const round = s.board.rounds[s.roundIndex];
    const catOf = (clueId?: string) => (clueId && round ? round.categories.findIndex((c) => c.clues.some((q) => q.id === clueId)) : -1);
    const good = new Set<number>();
    for (const e of s.events) if (!e.voided && e.type === 'answer' && e.result === 'correct' && e.competitorId === botId && e.roundIndex === s.roundIndex) good.add(catOf(e.clueId));
    good.delete(-1);
    const last = catOf(s.usedClueIds[s.usedClueIds.length - 1]);
    return { goodCategories: good, lastCategory: last >= 0 ? last : null };
  }

  private plan(s: GameState, out: Map<string, Task>) {
    const bots = s.competitors.filter((c) => c.bot);
    const clue = s.clue;

    // Practice games run themselves: open the buzzers once the question has been read.
    if (s.practice && s.phase === 'clue' && clue && clue.unlockMode === 'host' && clue.stage === 'question' && !clue.isDailyWager && !clue.resolved && !clue.answerRevealed && !clue.answeringEnded && s.buzzer.status === 'locked' && s.buzzer.openedAt == null) {
      const len = (clueContext(s.board, clue.clueId)?.question ?? '').length;
      out.set(`unlock:${clue.clueId}`, { delay: Math.min(6000, 1500 + 35 * len), action: () => ({ type: 'unlockBuzzers' }) });
    }
    // Practice games move on by themselves when a round is played out (K27): next round, then
    // Final Jeopardy!, then the results — a short pause first so the last answer can sink in.
    if (s.practice && s.phase === 'board' && !s.intro && !s.clue) {
      const round = s.board.rounds[s.roundIndex];
      const left = round?.categories.some((c) => c.clues.some((q) => !s.usedClueIds.includes(q.id)));
      if (round && round.kind === 'standard' && !left) {
        const next = s.board.rounds.findIndex((r, i) => i > s.roundIndex && r.kind === 'standard');
        const final = s.board.rounds.some((r) => r.kind === 'final' && r.categories[0]?.clues[0]);
        out.set(`advance:${s.id}:${s.roundIndex}`, {
          delay: 3500,
          action: () => {
            const cur = this.latest;
            if (!cur || cur.id !== s.id || cur.phase !== 'board' || cur.roundIndex !== s.roundIndex || cur.clue || cur.intro) return null;
            return next > 0 ? { type: 'setRound', roundIndex: next } : final ? { type: 'startFinal' } : { type: 'endGame' };
          },
        });
      }
    }
    if (!bots.length) return;

    // Picking a clue when a computer player has control (same turn rule as everyone else).
    const chooser = s.phase === 'board' && !s.intro && !s.clue ? bots.find((b) => b.id === s.controlCompetitorId) : undefined;
    if (chooser) {
      const turn = `pick:${s.id}:${s.roundIndex}:${s.usedClueIds.length}:${chooser.id}`;
      out.set(turn, {
        delay: this.between(BOT_PARAMS[chooser.bot!].pick, chooser),
        action: async () => {
          const still = (cur: GameState | null): cur is GameState => !!cur && !cur.paused && cur.phase === 'board' && !cur.clue && !cur.intro && cur.controlCompetitorId === chooser.id;
          const cur = this.latest;
          if (!still(cur)) return null;
          const id = pickClue(cur, chooser.id, chooser.bot!, this.memory(cur, chooser.id), this.random);
          if (!id) return null;
          // R15-29: the chosen tile is outlined on the board first, then the clue opens — only if
          // nothing changed meanwhile (the host took over, paused, or opened a clue).
          this.onHint(id);
          await new Promise((r) => setTimeout(r, Math.max(0, Math.round(this.hintMs * this.speed))));
          const now = this.latest;
          if (!still(now) || now.id !== cur.id || now.usedClueIds.includes(id)) {
            this.onHint(null);
            return null;
          }
          return { type: 'selectClue', clueId: id };
        },
      });
    }

    if (s.phase === 'clue' && clue && clue.stage === 'question' && !clue.isDailyWager && !clue.resolved) {
      // Buzz: each computer player that may still answer decides once per answering opportunity.
      if (s.buzzer.status === 'open' && !s.buzzer.winner && s.buzzer.openedAt != null) {
        for (const b of bots) {
          if (s.buzzer.attemptedCompetitors.includes(b.id)) continue;
          const key = `buzz:${clue.clueId}:${s.buzzer.openedAt}:${b.id}`;
          const knows = this.knows(s, b, clue.clueId, clue.value);
          if (!knows && !this.decide(`risk:${key}`, BOT_PARAMS[b.bot!].risk)) continue;
          out.set(key, { delay: this.between(BOT_PARAMS[b.bot!].react, b), action: () => ({ type: 'buzz', competitorId: b.id, profileId: null, controllerId: `bot:${b.id}`, sourceKind: 'bot' }) });
        }
      }
      // Answer after winning the buzz: the text goes to the host, who judges it.
      const w = s.buzzer.winner;
      const wb = w ? bots.find((b) => b.id === w.competitorId) : undefined;
      if (w && wb && s.buzzer.status === 'buzzed' && !clue.submission) {
        const knows = this.knows(s, wb, clue.clueId, clue.value);
        const key = `answer:${clue.clueId}:${w.at}`;
        const ready = this.prepare(key, () => this.answerText(s, wb, clue.clueId, knows, false, this.answerBudget(s)));
        out.set(key, { delay: this.thinkTime(s, wb), action: async () => this.submit(wb, await ready) });
      }
    }

    // Daily Wager picked while a computer player has control: once the host unlocks the wager it
    // sends one (pending, like a phone — R16-9), the host locks it and shows the clue, then it answers.
    // R16-9: the tasks are keyed by this opening of the clue (game + its clue_open event): keyed by
    // the clue alone, a bot never wagered again on that clue — in a later game on the same board, or
    // after the host undid the pick.
    if (s.phase === 'clue' && clue?.isDailyWager && !clue.resolved) {
      const opening = `${s.id}:${s.events.findLast((e) => e.type === 'clue_open' && e.clueId === clue.clueId)?.id ?? clue.clueId}`;
      if (clue.stage === 'wager') {
        const owner = bots.find((b) => b.id === (clue.wagerBy ?? s.controlCompetitorId));
        if (owner && clue.wagerOpen && !clue.pendingWager)
          out.set(`dw:${opening}`, { delay: 2500 * this.pace(owner), action: () => ({ type: 'submitDailyWager', competitorId: owner.id, profileId: null, amount: this.dailyWager(s, owner) }) });
      } else if (clue.wager && !clue.submission) {
        const owner = bots.find((b) => b.id === clue.wager!.competitorId);
        if (owner) {
          const knows = this.knows(s, owner, clue.clueId, clue.value);
          const key = `dwanswer:${opening}`;
          const ready = this.prepare(key, () => this.answerText(s, owner, clue.clueId, knows));
          out.set(key, { delay: 2500 + this.thinkTime(s, owner), action: async () => this.submit(owner, await ready) });
        }
      }
    }

    // Final: wager and write an answer; the host reveals and judges it like everyone else's.
    if (s.phase === 'final' && s.final) {
      const f = s.final;
      const fc = s.board.rounds[f.roundIndex]?.categories[0]?.clues[0];
      for (const e of f.entries) {
        const b = bots.find((x) => x.id === e.competitorId);
        if (!b || !fc) continue;
        if (f.stage === 'wagers' && e.wager == null)
          out.set(`fw:${s.id}:${b.id}`, { delay: 2000 + this.between([0, 1500], b), action: () => ({ type: 'setFinalWager', competitorId: b.id, amount: this.finalWager(s, b) }) });
        const knows = this.decide(`fknow:${s.id}:${b.id}`, Math.min(0.95, BOT_PARAMS[b.bot!].know * 0.85));
        if (f.stage === 'clue' && !e.answer) {
          const key = `fa:${s.id}:${b.id}`;
          const ready = this.prepare(key, () => this.answerText(s, b, fc.id, knows, true));
          out.set(key, { delay: 4000 + this.between([0, 3000], b), action: async () => ({ type: 'setFinalAnswer', competitorId: b.id, answer: (await ready).text }) });
        }
      }
    }
  }

  /** Thinking time, kept inside a running answer timer so a bot never times out by design. */
  private thinkTime(s: GameState, b: Competitor) {
    const t = this.between(BOT_PARAMS[b.bot!].think, b);
    if (s.timer?.running && s.timer.kind === 'answer') {
      const left = timerRemaining(s.timer, Date.now());
      return Math.max(300, Math.round(Math.min(t, left * 0.7)));
    }
    return t;
  }

  /** R16-9: a legal Daily Double! wager — the engine's own limits (minimum … max(score, the round's
   *  top value)), the bot's share of the maximum, in the board's steps (100s on a classic board, the
   *  smallest clue value on a custom one), never below the minimum or above the maximum. */
  private dailyWager(s: GameState, b: Competitor) {
    const score = scoresOf(s.events)[b.id] ?? 0;
    const max = Math.max(score, roundMaxValue(s));
    const values = (s.board.rounds[s.roundIndex]?.categories ?? []).flatMap((c) => c.clues.map((q) => q.value)).filter((v) => v > 0);
    const step = Math.min(100, ...values);
    const amount = Math.floor((max * BOT_PARAMS[b.bot!].wager) / 100 / step) * step;
    return Math.max(s.rules.dailyWagerMin, Math.min(max, amount));
  }

  private finalWager(s: GameState, b: Competitor) {
    const scores = scoresOf(s.events);
    const mine = Math.max(0, scores[b.id] ?? 0);
    const others = s.competitors.filter((c) => c.id !== b.id).map((c) => scores[c.id] ?? 0);
    const best = Math.max(0, ...others);
    let w: number;
    if (b.bot === 'easy') w = mine * 0.3;
    else if (mine > best) w = Math.min(mine, Math.max(0, 2 * best - mine + 1)); // cover a doubled runner-up
    else w = mine * (b.bot === 'medium' ? 0.5 : 0.8);
    return Math.max(0, Math.min(mine, Math.round(w)));
  }
}
