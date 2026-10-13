// Computer opponents (offline, server-side). The driver looks at the authoritative state after
// every change and schedules what each computer player would do next — buzz, answer, wager — as
// ordinary engine actions, so they go through exactly the same arbitration and validation as
// Joy-Cons and phones. Computer players never buzz early. In practice games the driver also
// opens the buzzers automatically once the question has had time to be read.
import type { EngineAction } from '../shared/actions.js';
import { scoresOf, type BotLevel, type Competitor, type GameState } from '../shared/game.js';

interface LevelParams {
  know: number; // chance of knowing an average clue
  react: [number, number]; // ms after the buzzers open
  risk: number; // chance of buzzing without knowing (then answering wrong)
  think: [number, number]; // ms before answering after winning the buzz
  wager: number; // share of the allowed maximum it wagers on a Daily Wager
}

export const BOT_PARAMS: Record<BotLevel, LevelParams> = {
  easy: { know: 0.35, react: [1400, 2600], risk: 0.05, think: [1800, 2800], wager: 0.2 },
  medium: { know: 0.55, react: [900, 1800], risk: 0.08, think: [1400, 2400], wager: 0.35 },
  hard: { know: 0.72, react: [550, 1200], risk: 0.1, think: [1100, 2000], wager: 0.5 },
  expert: { know: 0.88, react: [300, 750], risk: 0.1, think: [900, 1600], wager: 0.6 },
};

type Task = { delay: number; action: () => EngineAction | null };

export class BotDriver {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private fired = new Set<string>();
  private memo = new Map<string, boolean>();
  /** Injected for tests. */
  random: () => number = Math.random;
  /** Multiplies every delay (tests use a small value). */
  speed = 1;

  constructor(private dispatch: (a: EngineAction) => void) {}

  sync(s: GameState | null) {
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
          const a = task.action();
          if (a) this.dispatch(a);
        }, Math.max(0, Math.round(task.delay * this.speed))),
      );
    }
  }

  stop() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  private between([a, b]: [number, number]) {
    return a + this.random() * (b - a);
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

  private plan(s: GameState, out: Map<string, Task>) {
    const bots = s.competitors.filter((c) => c.bot);
    const clue = s.clue;

    // Practice games run themselves: open the buzzers once the question has been read.
    if (s.practice && s.phase === 'clue' && clue && clue.stage === 'question' && !clue.isDailyWager && !clue.resolved && !clue.answerRevealed && !clue.answeringEnded && s.buzzer.status === 'locked' && s.buzzer.openedAt == null) {
      const len = (clueText(s, clue.clueId) ?? '').length;
      out.set(`unlock:${clue.clueId}`, { delay: Math.min(6000, 1500 + 35 * len), action: () => ({ type: 'unlockBuzzers' }) });
    }
    if (!bots.length) return;

    if (s.phase === 'clue' && clue && clue.stage === 'question' && !clue.isDailyWager && !clue.resolved) {
      // Buzz: each computer player that may still answer decides once per answering opportunity.
      if (s.buzzer.status === 'open' && !s.buzzer.winner && s.buzzer.openedAt != null) {
        for (const b of bots) {
          if (s.buzzer.attemptedCompetitors.includes(b.id)) continue;
          const key = `buzz:${clue.clueId}:${s.buzzer.openedAt}:${b.id}`;
          const knows = this.knows(s, b, clue.clueId, clue.value);
          if (!knows && !this.decide(`risk:${key}`, BOT_PARAMS[b.bot!].risk)) continue;
          out.set(key, { delay: this.between(BOT_PARAMS[b.bot!].react), action: () => ({ type: 'buzz', competitorId: b.id, profileId: null, controllerId: `bot:${b.id}`, sourceKind: 'bot' }) });
        }
      }
      // Answer after winning the buzz (correct only if it knew).
      const w = s.buzzer.winner;
      const wb = w ? bots.find((b) => b.id === w.competitorId) : undefined;
      if (w && wb && s.buzzer.status === 'buzzed') {
        const knows = this.knows(s, wb, clue.clueId, clue.value);
        out.set(`answer:${clue.clueId}:${w.at}`, { delay: this.between(BOT_PARAMS[wb.bot!].think), action: () => ({ type: 'judge', result: knows ? 'correct' : 'incorrect', competitorId: wb.id }) });
      }
    }

    // Daily Wager picked while a computer player has control: it wagers, then answers.
    if (s.phase === 'clue' && clue?.isDailyWager && !clue.resolved) {
      if (clue.stage === 'wager') {
        const owner = bots.find((b) => b.id === s.controlCompetitorId);
        if (owner) out.set(`dw:${clue.clueId}`, { delay: 2500, action: () => ({ type: 'setDailyWager', competitorId: owner.id, amount: this.dailyWager(s, owner) }) });
      } else if (clue.wager) {
        const owner = bots.find((b) => b.id === clue.wager!.competitorId);
        if (owner) {
          const knows = this.knows(s, owner, clue.clueId, clue.value);
          out.set(`dwanswer:${clue.clueId}`, { delay: 3000 + this.between(BOT_PARAMS[owner.bot!].think), action: () => ({ type: 'judge', result: knows ? 'correct' : 'incorrect' }) });
        }
      }
    }

    // Final: wager, answer, and judge their own (known) answers.
    if (s.phase === 'final' && s.final) {
      const f = s.final;
      const fc = s.board.rounds[f.roundIndex]?.categories[0]?.clues[0];
      for (const e of f.entries) {
        const b = bots.find((x) => x.id === e.competitorId);
        if (!b || !fc) continue;
        if ((f.stage === 'category' || f.stage === 'wagers') && e.wager == null)
          out.set(`fw:${s.id}:${b.id}`, { delay: 2000 + this.between([0, 1500]), action: () => ({ type: 'setFinalWager', competitorId: b.id, amount: this.finalWager(s, b) }) });
        const knows = this.decide(`fknow:${s.id}:${b.id}`, Math.min(0.95, BOT_PARAMS[b.bot!].know * 0.85));
        if (f.stage === 'clue' && !e.answer)
          out.set(`fa:${s.id}:${b.id}`, { delay: 4000 + this.between([0, 3000]), action: () => ({ type: 'setFinalAnswer', competitorId: b.id, answer: knows ? fc.answer : "I'm not sure" }) });
        if (f.stage === 'reveal' && !e.judged)
          out.set(`fj:${s.id}:${b.id}`, { delay: 1500, action: () => ({ type: 'judgeFinal', competitorId: b.id, correct: knows && !!e.answer }) });
      }
    }
  }

  private dailyWager(s: GameState, b: Competitor) {
    const score = scoresOf(s.events)[b.id] ?? 0;
    const round = s.board.rounds[s.roundIndex];
    const roundMax = Math.max(0, ...(round?.categories ?? []).flatMap((c) => c.clues.map((q) => q.value)));
    const max = Math.max(score, roundMax);
    const amount = Math.round((max * BOT_PARAMS[b.bot!].wager) / 100) * 100;
    return Math.min(max, Math.max(s.rules.dailyWagerMin, amount));
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

function clueText(s: GameState, clueId: string) {
  for (const r of s.board.rounds) for (const c of r.categories) for (const q of c.clues) if (q.id === clueId) return q.question;
  return null;
}
