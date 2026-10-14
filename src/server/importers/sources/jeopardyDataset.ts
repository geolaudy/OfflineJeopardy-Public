// Jeopardy-style clue datasets provided by the user as a file (R2-21).
//
// Shape: the widely circulated JSON array of clue objects:
//   { "category": "…", "air_date": "YYYY-MM-DD", "question": "'…'",
//     "value": "$200", "answer": "…", "round": "Jeopardy!", "show_number": "1234" }
// Clues are grouped by show number; the user picks which show(s) become boards.
//
// OfflineJeopardy never bundles, downloads or scrapes show content: this plugin only parses a
// file the user chose. Links inside clue text (to pictures on archive sites) are NOT followed.
import type { ImportInput, ImportSource, NormalizedBoard, NormalizedCategory, NormalizedClue, NormalizedImport, NormalizedRound } from '../types.js';
import { ImportError } from '../types.js';
import { hasHtmlLink, looksLikeJson, parseMoney, str, stripHtml } from '../text.js';

interface DatasetClue {
  category?: unknown;
  air_date?: unknown;
  question?: unknown;
  value?: unknown;
  answer?: unknown;
  round?: unknown;
  show_number?: unknown;
}

const MAX_ITEMS = 600_000;

const LADDERS: Record<1 | 2, number[][]> = {
  1: [
    [200, 400, 600, 800, 1000],
    [100, 200, 300, 400, 500],
  ],
  2: [
    [400, 800, 1200, 1600, 2000],
    [200, 400, 600, 800, 1000],
  ],
};

function roundOf(r: unknown): 1 | 2 | 'final' | null {
  const s = str(r).toLowerCase().replace(/[^a-z]/g, '');
  if (s === 'jeopardy') return 1;
  if (s === 'doublejeopardy') return 2;
  if (s === 'finaljeopardy') return 'final';
  return null;
}

function cleanQuestion(q: string): string {
  let t = stripHtml(q);
  // The dataset wraps clue text in single quotes.
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) t = t.slice(1, -1).trim();
  return t;
}

/** Re-create a regular value ladder: aired Daily Double wagers become ladder slots + dailyWager. */
function assignValues(clues: { value: number; clue: NormalizedClue }[], ladder: number[]) {
  const used = new Set<number>();
  const pending: { value: number; clue: NormalizedClue }[] = [];
  for (const c of clues) {
    if (ladder.includes(c.value) && !used.has(c.value)) {
      used.add(c.value);
      c.clue.value = c.value;
    } else pending.push(c);
  }
  const free = ladder.filter((v) => !used.has(v));
  for (const c of pending) {
    const slot = free.shift();
    if (Number.isFinite(c.value)) c.clue.dailyWager = true; // an off-ladder aired value is a wager
    c.clue.value = slot ?? (Number.isFinite(c.value) ? c.value : ladder[ladder.length - 1]);
  }
}

function buildShow(show: string, items: DatasetClue[]): { board: NormalizedBoard; linkClues: number } {
  const warnings: string[] = [];
  let linkClues = 0;
  let skipped = 0;
  const std: Record<1 | 2, Map<string, { value: number; clue: NormalizedClue }[]>> = { 1: new Map(), 2: new Map() };
  let final: { category: string; clue: NormalizedClue } | null = null;
  let airDate = '';
  for (const it of items) {
    airDate ||= str(it.air_date).trim();
    const rawQ = str(it.question);
    if (hasHtmlLink(rawQ)) linkClues++;
    const clue: NormalizedClue = { value: 0, question: cleanQuestion(rawQ), answer: stripHtml(str(it.answer)), media: [], answerMedia: [] };
    const cat = stripHtml(str(it.category)) || 'Category';
    const r = roundOf(it.round);
    if (r === 'final') {
      if (!final) final = { category: cat, clue };
      continue;
    }
    if (r === null) {
      skipped++;
      continue;
    }
    const list = std[r].get(cat) ?? [];
    list.push({ value: parseMoney(it.value), clue });
    std[r].set(cat, list);
  }
  const rounds: NormalizedRound[] = [];
  for (const rn of [1, 2] as const) {
    const cats = std[rn];
    if (!cats.size) continue;
    const all = [...cats.values()].flat().map((c) => c.value);
    const ladder = LADDERS[rn].map((l) => ({ l, hits: all.filter((v) => l.includes(v)).length })).sort((a, b) => b.hits - a.hits)[0].l;
    const categories: NormalizedCategory[] = [];
    for (const [name, list] of cats) {
      assignValues(list, ladder);
      categories.push({ name, clues: list.map((c) => c.clue).sort((a, b) => a.value - b.value) });
    }
    rounds.push({ name: `Round ${rn}`, kind: 'standard', categories });
  }
  if (final) rounds.push({ name: 'Final Jeopardy!', kind: 'final', categories: [{ name: final.category, clues: [final.clue] }] });
  if (skipped) warnings.push(`${skipped} tie-breaker or unknown-round clue${skipped === 1 ? '' : 's'} skipped.`);
  if (linkClues) warnings.push(`${linkClues} clue${linkClues === 1 ? '' : 's'} referred to pictures or video on another website; those are not downloaded (the clue text is kept).`);
  const clueCount = items.length - skipped;
  const title = `Show ${show}${airDate ? ` (${airDate})` : ''}`;
  return {
    board: {
      key: show,
      label: `Show #${show}${airDate ? ` · ${airDate}` : ''} · ${clueCount} clues`,
      title,
      description: `Imported from a clue dataset file (show ${show}${airDate ? `, aired ${airDate}` : ''}).`,
      tags: ['imported', 'dataset'],
      rounds,
      warnings,
    },
    linkClues,
  };
}

export function parseJeopardyDataset(text: string, fileName: string): NormalizedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('The file is not valid JSON.');
  }
  if (!Array.isArray(data)) throw new ImportError('Expected a list of clues (a JSON array).');
  if (data.length > MAX_ITEMS) throw new ImportError(`The dataset is too large (more than ${MAX_ITEMS.toLocaleString('en-US')} clues).`);
  const byShow = new Map<string, DatasetClue[]>();
  let invalid = 0;
  for (const it of data as DatasetClue[]) {
    if (!it || typeof it !== 'object' || (!str(it.question) && !str(it.answer))) {
      invalid++;
      continue;
    }
    const show = str(it.show_number).trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) || 'unknown';
    const list = byShow.get(show) ?? [];
    list.push(it);
    byShow.set(show, list);
  }
  if (!byShow.size) throw new ImportError('No clues were found in this file.');
  const boards = [...byShow.entries()]
    .sort(([a], [b]) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b))
    .map(([show, items]) => buildShow(show, items).board)
    .filter((b) => b.rounds.some((r) => r.kind === 'standard'));
  if (!boards.length) throw new ImportError('No show in this file has regular-round clues.');
  const warnings: string[] = [];
  if (invalid) warnings.push(`${invalid} entr${invalid === 1 ? 'y' : 'ies'} without a question or answer ignored.`);
  return {
    sourceId: 'jeopardy-dataset',
    sourceLabel: 'Clue dataset (JSON)',
    title: boards.length === 1 ? boards[0].title : fileName.replace(/\.[a-z0-9]+$/i, '') || 'Clue dataset',
    boards,
    warnings,
    attribution: 'Clues come from a dataset file you provided. Make sure you have the right to use them.',
  };
}

export const jeopardyDatasetSource: ImportSource = {
  id: 'jeopardy-dataset',
  label: 'Clue dataset (JSON)',
  detect(input: ImportInput) {
    if (input.kind !== 'file' || looksLikeJson(input.text) !== '[') return false;
    const head = input.text.slice(0, 4000);
    return /"(question|answer)"\s*:/.test(head) && /"(category|show_number|round)"\s*:/.test(head);
  },
  async parse(input: ImportInput) {
    if (input.kind !== 'file') throw new ImportError('Datasets are imported from a file.');
    return parseJeopardyDataset(input.text, input.name);
  },
};
