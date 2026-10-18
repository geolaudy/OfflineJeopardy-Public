// Offline answers and clue choices for computer opponents (R3-9, R3-11). Nothing here scores
// anything: the bot's text goes to the host, who judges it like any other answer.
//
// Wrong answers are drawn from what a person might confuse the right answer with: other answers
// in the same category, then answers of the same shape elsewhere on the board (names with names,
// years with years), or a nearby number. Easier bots guess from further away.
import type { BotLevel, BoardContent, GameState } from '../shared/game.js';
import { scoresOf } from '../shared/game.js';
import { plainText } from '../shared/richText.js';

export interface ClueContext {
  category: string;
  question: string;
  answer: string;
  value: number;
  /** Other answers in the same category / anywhere on the board (for plausible confusions). */
  sameCategory: string[];
  board: string[];
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/^(what|who|where|when) (is|are|was|were) /, '')
    .replace(/^(the|a|an) /, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Find a clue (including the Final) and the answers around it — as plain text (no formatting tags or
 *  line breaks, R8-8), so bots and the AI compare and say real words. */
export function clueContext(board: BoardContent, clueId: string): ClueContext | null {
  for (const r of board.rounds)
    for (const c of r.categories) {
      const q = c.clues.find((x) => x.id === clueId);
      if (!q) continue;
      const all = board.rounds.flatMap((rr) => rr.categories.flatMap((cc) => cc.clues.map((x) => plainText(x.answer))));
      const answer = plainText(q.answer);
      return {
        category: c.name,
        question: plainText(q.question),
        answer,
        value: q.value,
        sameCategory: c.clues.filter((x) => x.id !== clueId).map((x) => plainText(x.answer)),
        board: all.filter((a) => a && norm(a) !== norm(answer)),
      };
    }
  return null;
}

/** Rough shape of an answer, so a person is confused with a person and a year with a year. */
function shape(a: string): string {
  const t = a.replace(/\(.*?\)/g, '').trim();
  if (/^\d{3,4}( (bc|ad|bce|ce))?$/i.test(t)) return 'year';
  if (/^-?\d+([.,]\d+)?( ?%| \w+)?$/.test(t)) return 'number';
  const words = t.split(/\s+/);
  if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Z]/.test(w) || /^(of|the|de|van|von|da|la|le)$/.test(w))) return 'name';
  if (words.length === 1 && /^[A-Z]/.test(t)) return 'proper';
  return words.length <= 2 ? 'short' : 'phrase';
}

function nearbyNumber(answer: string, level: BotLevel, rnd: () => number): string | null {
  const m = /-?\d+([.,]\d+)?/.exec(answer);
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const isYear = /^\d{3,4}$/.test(m[0]);
  const spread = isYear ? { easy: 40, medium: 15, hard: 6, expert: 3 }[level] : Math.max(1, Math.round(Math.abs(n) * { easy: 0.5, medium: 0.25, hard: 0.12, expert: 0.06 }[level]));
  let d = 0;
  while (d === 0) d = Math.round((rnd() * 2 - 1) * spread);
  const out = isYear || Number.isInteger(n) ? String(Math.round(n + d)) : (n + d).toFixed(1);
  return answer.slice(0, m.index) + out + answer.slice(m.index + m[0].length);
}

const tidy = (a: string) => a.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim() || a.trim();

/**
 * The bot's answer text. `correct` decides whether it knows; harder bots make closer mistakes.
 * `avoid` holds answers this bot already gave (no repeating the same wrong guess).
 */
export function localAnswer(ctx: ClueContext, opts: { correct: boolean; level: BotLevel; random: () => number; avoid?: Set<string> }): string {
  const { level, random: rnd } = opts;
  if (opts.correct) return tidy(ctx.answer);
  const right = norm(ctx.answer);
  const avoid = new Set([...(opts.avoid ?? [])].map(norm));
  const ok = (a: string) => !!a && norm(a) !== right && !avoid.has(norm(a)) && norm(a).length > 0;
  const pick = (xs: string[]) => {
    const pool = [...new Set(xs.filter(ok).map(tidy))];
    return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
  };
  const want = shape(ctx.answer);
  const numeric = want === 'year' || want === 'number';
  // Closer confusions first; easy bots sometimes skip straight to a far-off guess.
  const far = rnd() < { easy: 0.5, medium: 0.25, hard: 0.1, expert: 0.05 }[level];
  const steps: (() => string | null)[] = numeric
    ? [() => nearbyNumber(ctx.answer, level, rnd), () => pick(ctx.sameCategory.filter((a) => shape(a) === want)), () => pick(ctx.board.filter((a) => shape(a) === want))]
    : far
      ? [() => pick(ctx.board.filter((a) => shape(a) === want)), () => pick(ctx.sameCategory), () => pick(ctx.board)]
      : [() => pick(ctx.sameCategory.filter((a) => shape(a) === want)), () => pick(ctx.sameCategory), () => pick(ctx.board.filter((a) => shape(a) === want)), () => pick(ctx.board)];
  for (const s of steps) {
    const v = s();
    if (v && ok(v)) return v;
  }
  return nearbyNumber(ctx.answer, level, rnd) ?? UNSURE[Math.floor(rnd() * UNSURE.length)];
}

/** Used only when the board offers nothing related at all (e.g. a one-clue board). */
const UNSURE = ['No idea — pass', 'I really thought I knew this one', 'Pass'];

// ---------------------------------------------------------------- choosing a clue

export interface PickMemory {
  /** Categories (index) where this bot answered correctly. */
  goodCategories: Set<number>;
  lastCategory: number | null;
}

/**
 * Which clue a computer opponent picks when it has control. Easy: random. Medium: sticks to
 * categories it did well in, cheaper clues first. Hard: works down one category, goes for the big
 * values when behind. Expert: score-aware — chases high values (where Daily Wagers usually hide)
 * when trailing or late, plays safer when comfortably ahead. Never peeks at Daily Wager positions.
 */
export function pickClue(s: GameState, botId: string, level: BotLevel, mem: PickMemory, rnd: () => number): string | null {
  const round = s.board.rounds[s.roundIndex];
  if (!round || round.kind !== 'standard') return null;
  const used = new Set(s.usedClueIds);
  const open = round.categories.flatMap((c, ci) => c.clues.map((q, qi) => ({ id: q.id, ci, qi, value: q.value })).filter((q) => !used.has(q.id)));
  if (!open.length) return null;
  const any = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const cheapest = (xs: typeof open) => xs.reduce((m, x) => (x.value < m.value ? x : m), xs[0]);
  const dearest = (xs: typeof open) => xs.reduce((m, x) => (x.value > m.value ? x : m), xs[0]);
  if (level === 'easy') return any(open).id;

  const scores = scoresOf(s.events);
  const mine = scores[botId] ?? 0;
  const best = Math.max(0, ...s.competitors.filter((c) => c.id !== botId).map((c) => scores[c.id] ?? 0));
  const total = round.categories.reduce((a, c) => a + c.clues.length, 0);
  const late = open.length <= Math.max(3, total / 4);
  const topValue = Math.max(...open.map((q) => q.value));
  const inCat = (ci: number | null) => (ci == null ? [] : open.filter((q) => q.ci === ci));

  if (level === 'medium') {
    const fav = open.filter((q) => mem.goodCategories.has(q.ci));
    const pool = fav.length && rnd() < 0.6 ? fav : open;
    const cat = any(pool).ci;
    const choices = inCat(cat).sort((a, b) => a.value - b.value).slice(0, 2);
    return any(choices).id;
  }

  const behind = best - mine > topValue * 2;
  if (level === 'hard') {
    if (behind || late) return dearest(open).id;
    const cont = inCat(mem.lastCategory);
    if (cont.length) return cheapest(cont).id;
    const fav = open.filter((q) => mem.goodCategories.has(q.ci));
    return cheapest(inCat(any(fav.length ? fav : open).ci)).id;
  }

  // expert
  const ahead = mine - best > topValue * 3;
  if (ahead && !late) {
    const safe = open.filter((q) => mem.goodCategories.has(q.ci));
    return cheapest(safe.length ? safe : open).id;
  }
  if (behind || late) return dearest(open).id;
  // Mid game: high rows of categories nobody has touched yet are where Daily Wagers tend to be.
  const touched = new Set(s.usedClueIds.map((id) => round.categories.findIndex((c) => c.clues.some((q) => q.id === id))));
  const fresh = open.filter((q) => !touched.has(q.ci) && q.qi >= 2);
  if (fresh.length && rnd() < 0.5) return any(fresh).id;
  return dearest(inCat(any(open).ci)).id;
}
