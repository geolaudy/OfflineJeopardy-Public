// Normalisation limits, preview summaries, board building and validation.
import type { BoardContent, MediaRef } from '../../shared/game.js';
import { boardContentSchema } from '../../shared/boardIO.js';
import { uid, validateBoard } from '../../shared/boardUtils.js';
import type { MediaKind, NormalizedBoard, NormalizedCategory, NormalizedClue, NormalizedImport, NormalizedMedia, NormalizedRound } from './types.js';
import { ImportError } from './types.js';

// Mirrors boardContentSchema in src/shared/boardIO.ts.
export const LIMITS = { rounds: 10, categories: 20, clues: 20, media: 6, roundName: 60, categoryName: 100, subheading: 100, question: 2000, answer: 1000, notes: 2000, caption: 200, title: 120, value: 1_000_000 };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Clamp a normalised board to what the app accepts, recording every change as a warning. */
export function applyLimits(board: NormalizedBoard): NormalizedBoard {
  const w = board.warnings;
  let clipped = 0;
  const text = (s: string, n: number) => {
    if (s.length > n) clipped++;
    return clip(s, n);
  };
  const mediaList = (list: NormalizedMedia[], where: string) => {
    if (list.length > LIMITS.media) w.push(`${where}: only the first ${LIMITS.media} media files are kept.`);
    return list.slice(0, LIMITS.media).map((m) => ({ ...m, ...(m.caption ? { caption: text(m.caption, LIMITS.caption) } : {}) }));
  };
  const clue = (q: NormalizedClue, where: string): NormalizedClue => ({
    ...q,
    value: Math.max(0, Math.min(LIMITS.value, Math.round(Number.isFinite(q.value) ? q.value : 0))),
    question: text(q.question, LIMITS.question),
    answer: text(q.answer, LIMITS.answer),
    ...(q.notes ? { notes: text(q.notes, LIMITS.notes) } : {}),
    media: mediaList(q.media, where),
    answerMedia: mediaList(q.answerMedia, where),
  });
  const sub = (c: NormalizedCategory) => (c.subheading?.trim() ? { subheading: text(c.subheading.trim(), LIMITS.subheading) } : {});

  const standard: NormalizedRound[] = [];
  let final: NormalizedRound | null = null;
  for (const r of board.rounds) {
    const name = text(r.name, LIMITS.roundName);
    let cats = r.categories.filter((c) => c.clues.length > 0);
    if (r.kind === 'final') {
      if (final) {
        w.push('Only one Final round is allowed; extra Final rounds were dropped.');
        continue;
      }
      if (!cats.length) continue;
      if (cats.length > 1 || cats[0].clues.length > 1) w.push('The Final round keeps only its first clue.');
      const c = cats[0];
      final = { name, kind: 'final', categories: [{ name: text(c.name, LIMITS.categoryName), ...sub(c), clues: [clue({ ...c.clues[0], value: 0, dailyWager: undefined }, `${name} / ${c.name}`)] }] };
      continue;
    }
    if (!cats.length) continue;
    if (cats.length > LIMITS.categories) {
      w.push(`${name}: only the first ${LIMITS.categories} categories are kept.`);
      cats = cats.slice(0, LIMITS.categories);
    }
    standard.push({
      name,
      kind: 'standard',
      categories: cats.map((c) => {
        if (c.clues.length > LIMITS.clues) w.push(`${name} / ${c.name}: only the first ${LIMITS.clues} clues are kept.`);
        return { name: text(c.name, LIMITS.categoryName), ...sub(c), clues: c.clues.slice(0, LIMITS.clues).map((q) => clue(q, `${name} / ${c.name} / ${q.value}`)) };
      }),
    });
  }
  const maxStd = LIMITS.rounds - (final ? 1 : 0);
  if (standard.length > maxStd) w.push(`Only the first ${maxStd} rounds are kept.`);
  if (clipped) w.push(`${clipped} text field${clipped === 1 ? ' was' : 's were'} too long and shortened.`);
  return { ...board, title: clip(board.title.trim() || 'Imported board', LIMITS.title), rounds: [...standard.slice(0, maxStd), ...(final ? [final] : [])] };
}

export function applyLimitsAll(imp: NormalizedImport): NormalizedImport {
  const boards = imp.boards.map(applyLimits).filter((b) => b.rounds.some((r) => r.kind === 'standard' && r.categories.length));
  if (!boards.length) throw new ImportError('No playable clues were found in this source.');
  return { ...imp, boards };
}

// ---------- preview ----------

export interface MissingMedia {
  where: string;
  side: 'clue' | 'answer';
  ref: string;
  reason: string;
}

export interface BoardPreview {
  key: string;
  label: string;
  title: string;
  summary: { rounds: number; categories: number; clues: number; mediaFound: number };
  categories: { round: string; name: string; clues: number }[];
  missingMedia: MissingMedia[];
  warnings: string[];
}

export function forEachMedia(board: NormalizedBoard, fn: (m: NormalizedMedia, where: string, side: 'clue' | 'answer') => void) {
  for (const r of board.rounds)
    for (const c of r.categories)
      for (const q of c.clues) {
        const where = r.kind === 'final' ? `${r.name} / ${c.name}` : `${r.name} / ${c.name} / ${q.value}`;
        for (const m of q.media) fn(m, where, 'clue');
        for (const m of q.answerMedia) fn(m, where, 'answer');
      }
}

export function previewBoard(board: NormalizedBoard): BoardPreview {
  const urls = new Set<string>();
  const missing: MissingMedia[] = [];
  forEachMedia(board, (m, where, side) => {
    if (m.url) urls.add(m.url);
    else missing.push({ where, side, ref: m.ref, reason: m.unavailable ?? 'Not available.' });
  });
  return {
    key: board.key,
    label: board.label,
    title: board.title,
    summary: {
      rounds: board.rounds.length,
      categories: board.rounds.reduce((a, r) => a + r.categories.length, 0),
      clues: board.rounds.reduce((a, r) => a + r.categories.reduce((b, c) => b + c.clues.length, 0), 0),
      mediaFound: urls.size,
    },
    categories: board.rounds.flatMap((r) => r.categories.map((c) => ({ round: r.name, name: c.name, clues: c.clues.length }))),
    missingMedia: missing,
    warnings: board.warnings,
  };
}

// ---------- build + validate ----------

export interface StoredMedia {
  url: string;
  kind: MediaKind;
}

/** Turn a normalised board into BoardContent, keeping only media that were stored locally. */
export function buildContent(board: NormalizedBoard, stored: Map<string, StoredMedia>): BoardContent {
  const refs = (list: NormalizedMedia[]): MediaRef[] =>
    list.flatMap((m) => {
      const s = m.url ? stored.get(m.url) : undefined;
      return s ? [{ kind: s.kind, url: s.url, ...(m.caption ? { caption: m.caption } : {}) }] : [];
    });
  return {
    rounds: board.rounds.map((r) => ({
      id: uid('r'),
      name: r.name,
      kind: r.kind,
      categories: r.categories.map((c) => ({
        id: uid('c'),
        name: c.name,
        ...(c.subheading ? { subheading: c.subheading } : {}),
        clues: c.clues.map((q) => {
          const media = refs(q.media);
          const answerMedia = refs(q.answerMedia);
          // R7-30.1: a picture / sound clue whose media could not be imported says so on the
          // board (never a blank clue) and keeps the original reference in the host notes.
          const lost = q.media.length > 0 && media.length === 0;
          const lostNote = lost ? `Media not imported: ${q.media.map((m) => m.ref).join(', ')}` : '';
          const notes = [q.notes, lost && !q.notes?.includes(q.media[0].ref) ? lostNote : ''].filter(Boolean).join('\n');
          return {
            id: uid('q'),
            value: q.value,
            question: q.question || (lost ? `(The ${q.media[0].kindHint ?? 'media'} for this clue could not be imported — see the host notes.)` : ''),
            answer: q.answer,
            ...(notes ? { notes } : {}),
            ...(q.dailyWager && r.kind === 'standard' ? { dailyWager: true } : {}),
            ...(media.length ? { media } : {}),
            ...(answerMedia.length ? { answerMedia } : {}),
          };
        }),
      })),
    })),
  };
}

/** Schema + board-rule validation. Returns error messages (empty = valid). */
export function validateContent(content: BoardContent): string[] {
  const parsed = boardContentSchema.safeParse(content);
  if (!parsed.success) return parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.') || 'board'}: ${i.message}`);
  return validateBoard(content)
    .filter((i) => i.level === 'error')
    .map((i) => i.message);
}
