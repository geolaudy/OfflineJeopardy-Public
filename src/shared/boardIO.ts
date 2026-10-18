// Board import/export (CSV + JSON) with validation and error reporting.
import { z } from 'zod';
import type { BoardContent, Round } from './game.js';
import { uid } from './boardUtils.js';

export const CSV_HEADER = ['round', 'category', 'value', 'question', 'answer', 'daily_wager', 'notes'];

const mediaListSchema = z
  .array(z.object({ kind: z.enum(['image', 'audio', 'video']), url: z.string().max(300).regex(/^\/media\/[a-zA-Z0-9_./-]+$/), caption: z.string().max(200).optional() }))
  .max(6)
  .optional();

const clueSchema = z.object({
  id: z.string().min(1).max(64),
  value: z.number().int().min(0).max(1_000_000),
  question: z.string().max(2000),
  answer: z.string().max(1000),
  notes: z.string().max(2000).optional(),
  dailyWager: z.boolean().optional(),
  media: mediaListSchema,
  answerMedia: mediaListSchema,
  layout: z.enum(['auto', 'media', 'balanced', 'text']).optional(),
  unlock: z.enum(['default', 'immediate', 'host', 'mediaStart', 'mediaEnd']).optional(),
});
export const boardContentSchema = z.object({
  rounds: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().max(60),
        kind: z.enum(['standard', 'final']),
        categories: z.array(z.object({ id: z.string().min(1).max(64), name: z.string().max(100), subheading: z.string().max(100).optional(), clues: z.array(clueSchema).max(20) })).max(20),
      }),
    )
    .min(1)
    .max(10),
});

export const boardFileSchema = z.object({
  format: z.literal('offline-jeopardy-board'),
  version: z.number().int(),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  content: boardContentSchema,
});
export type BoardFile = z.infer<typeof boardFileSchema>;

export function exportBoardJson(b: { title: string; description?: string; tags?: string[]; content: BoardContent }): string {
  const file: BoardFile = { format: 'offline-jeopardy-board', version: 1, title: b.title, description: b.description, tags: b.tags, content: b.content };
  return JSON.stringify(file, null, 2);
}

// ---------- CSV ----------

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function exportBoardCsv(content: BoardContent): string {
  const lines = [CSV_HEADER.join(',')];
  for (const r of content.rounds)
    for (const c of r.categories)
      for (const q of c.clues)
        lines.push(
          [r.kind === 'final' ? 'Final' : r.name, c.name, String(q.value), q.question, q.answer, q.dailyWager ? 'yes' : '', q.notes ?? ''].map(csvCell).join(','),
        );
  return lines.join('\r\n') + '\r\n';
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export interface ImportResult {
  content: BoardContent | null;
  errors: string[];
  warnings: string[];
  summary: { rounds: number; categories: number; clues: number };
}

export function importBoardCsv(text: string): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows = parseCsv(text);
  if (rows.length === 0) return { content: null, errors: ['The file is empty.'], warnings, summary: { rounds: 0, categories: 0, clues: 0 } };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  for (const req of ['category', 'value', 'question', 'answer'])
    if (col(req) < 0) errors.push(`Missing required column "${req}". Expected columns: ${CSV_HEADER.join(', ')}`);
  if (errors.length) return { content: null, errors, warnings, summary: { rounds: 0, categories: 0, clues: 0 } };

  const rounds: Round[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (n: string) => (col(n) >= 0 ? (r[col(n)] ?? '').trim() : '');
    const roundName = get('round') || 'Round 1';
    const isFinal = /^final/i.test(roundName);
    const catName = get('category');
    const value = Number(get('value').replace(/[$,\s]/g, '') || (isFinal ? '0' : 'NaN'));
    if (!catName) return errors.push(`Line ${line}: category is empty.`);
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return errors.push(`Line ${line}: "${get('value')}" is not a valid point value.`);
    const question = get('question');
    const answer = get('answer');
    if (!question || !answer) warnings.push(`Line ${line}: missing question or answer.`);
    const dupKey = `${roundName}|${catName}|${question}`.toLowerCase();
    if (question && seen.has(dupKey)) warnings.push(`Line ${line}: duplicate clue "${question.slice(0, 40)}".`);
    seen.add(dupKey);
    let round = rounds.find((x) => x.name.toLowerCase() === (isFinal ? 'final jeopardy!' : roundName.toLowerCase()));
    if (!round) {
      round = { id: uid('r'), name: isFinal ? 'Final Jeopardy!' : roundName, kind: isFinal ? 'final' : 'standard', categories: [] };
      rounds.push(round);
    }
    let cat = round.categories.find((c) => c.name === catName);
    if (!cat) {
      if (isFinal && round.categories.length) return errors.push(`Line ${line}: the Final round can only have one category.`);
      cat = { id: uid('c'), name: catName, clues: [] };
      round.categories.push(cat);
    }
    if (isFinal && cat.clues.length) return errors.push(`Line ${line}: the Final round can only have one clue.`);
    const dw = /^(y|yes|true|1|x)$/i.test(get('daily_wager'));
    const notes = get('notes');
    cat.clues.push({ id: uid('q'), value, question, answer, ...(dw ? { dailyWager: true } : {}), ...(notes ? { notes } : {}) });
  });
  // Final round last
  rounds.sort((a, b) => Number(a.kind === 'final') - Number(b.kind === 'final'));
  for (const r of rounds) for (const c of r.categories) c.clues.sort((a, b) => a.value - b.value);
  if (!rounds.some((r) => r.kind === 'standard')) errors.push('The file has no regular rounds.');
  const summary = {
    rounds: rounds.length,
    categories: rounds.reduce((a, r) => a + r.categories.length, 0),
    clues: rounds.reduce((a, r) => a + r.categories.reduce((b, c) => b + c.clues.length, 0), 0),
  };
  return { content: errors.length ? null : { rounds }, errors, warnings, summary };
}

export function importBoardJson(text: string): ImportResult & { title?: string; description?: string; tags?: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { content: null, errors: ['The file is not valid JSON.'], warnings: [], summary: { rounds: 0, categories: 0, clues: 0 } };
  }
  const parsed = boardFileSchema.safeParse(data);
  if (!parsed.success) {
    const errs = parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.') || 'file'}: ${i.message}`);
    return { content: null, errors: errs, warnings: [], summary: { rounds: 0, categories: 0, clues: 0 } };
  }
  const c = parsed.data.content;
  return {
    content: c,
    title: parsed.data.title,
    description: parsed.data.description,
    tags: parsed.data.tags,
    errors: [],
    warnings: [],
    summary: {
      rounds: c.rounds.length,
      categories: c.rounds.reduce((a, r) => a + r.categories.length, 0),
      clues: c.rounds.reduce((a, r) => a + r.categories.reduce((b, x) => b + x.clues.length, 0), 0),
    },
  };
}
