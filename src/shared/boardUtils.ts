// Board helpers shared by the editor, importers and the server.
import type { BoardContent, Category, Clue, Round } from './game.js';

let counter = 0;
export function uid(prefix = 'id'): string {
  const rnd =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rnd}${(counter++ % 1000).toString(36)}`;
}

export const DEFAULT_VALUES = [200, 400, 600, 800, 1000];

export function blankClue(value: number): Clue {
  return { id: uid('q'), value, question: '', answer: '' };
}

export function blankCategory(name = '', values = DEFAULT_VALUES): Category {
  return { id: uid('c'), name, clues: values.map(blankClue) };
}

export function blankRound(name: string, multiplier = 1, cats = 6, rows = 5): Round {
  const values = Array.from({ length: rows }, (_, i) => (i + 1) * 200 * multiplier);
  return { id: uid('r'), name, kind: 'standard', categories: Array.from({ length: cats }, () => blankCategory('', values)) };
}

export function blankFinal(): Round {
  return { id: uid('r'), name: 'Final Wager', kind: 'final', categories: [{ id: uid('c'), name: '', clues: [blankClue(0)] }] };
}

export function blankBoard(): BoardContent {
  return { rounds: [blankRound('Round 1'), blankRound('Round 2', 2), blankFinal()] };
}

/** Give every round/category/clue a fresh id (used by duplicate + import). */
export function reassignIds(content: BoardContent): BoardContent {
  return {
    rounds: content.rounds.map((r) => ({
      ...r,
      id: uid('r'),
      categories: r.categories.map((c) => ({ ...c, id: uid('c'), clues: c.clues.map((q) => ({ ...q, id: uid('q') })) })),
    })),
  };
}

export interface BoardIssue {
  level: 'error' | 'warning';
  message: string;
}

export function validateBoard(content: BoardContent): BoardIssue[] {
  const issues: BoardIssue[] = [];
  const standard = content.rounds.filter((r) => r.kind === 'standard');
  if (standard.length === 0) issues.push({ level: 'error', message: 'The board needs at least one round.' });
  if (content.rounds.filter((r) => r.kind === 'final').length > 1)
    issues.push({ level: 'error', message: 'Only one Final round is allowed.' });
  const ids = new Set<string>();
  content.rounds.forEach((r) => {
    if (r.categories.length === 0) issues.push({ level: 'error', message: `${r.name} has no categories.` });
    r.categories.forEach((c, ci) => {
      if (!c.name.trim()) issues.push({ level: 'warning', message: `${r.name}: category ${ci + 1} has no name.` });
      c.clues.forEach((q) => {
        if (ids.has(q.id)) issues.push({ level: 'error', message: `Duplicate clue id ${q.id}.` });
        ids.add(q.id);
        if (!q.question.trim() || !q.answer.trim())
          issues.push({ level: 'warning', message: `${r.name} / ${c.name || `Category ${ci + 1}`} / ${q.value}: missing question or answer.` });
      });
    });
  });
  return issues;
}

export function boardStats(content: BoardContent) {
  let clues = 0;
  let complete = 0;
  for (const r of content.rounds)
    for (const c of r.categories)
      for (const q of c.clues) {
        clues++;
        if (q.question.trim() && q.answer.trim()) complete++;
      }
  return { rounds: content.rounds.length, clues, complete };
}
