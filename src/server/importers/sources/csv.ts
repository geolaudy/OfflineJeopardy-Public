// Generic spreadsheet (CSV) importer with media links (R2-21).
//
// Columns (header row, any order, case-insensitive):
//   round, category, value, question, answer, daily_wager, notes, image, answer_image, caption,
//   answer_caption, category_subheading
// `image` / `answer_image` hold http(s) links to a picture, sound or video file (several may be
// separated with "|"). The file type is decided after download by content, not by the column name.
// Local file names are reported as missing — use a board package (.zip) to bring local media.
import type { ImportInput, ImportSource, NormalizedBoard, NormalizedMedia, NormalizedRound } from '../types.js';
import { ImportError } from '../types.js';
import { csvHeader, isHttpUrl, parseCsv, parseMoney, truthy } from '../text.js';

const ALIASES: Record<string, string> = {
  media: 'image',
  picture: 'image',
  image_url: 'image',
  answer_media: 'answer_image',
  answer_picture: 'answer_image',
  image_caption: 'caption',
  dailywager: 'daily_wager',
  daily_double: 'daily_wager',
  subheading: 'category_subheading',
};

export const GENERIC_CSV_COLUMNS = ['round', 'category', 'value', 'question', 'answer', 'daily_wager', 'notes', 'image', 'answer_image', 'caption', 'answer_caption', 'category_subheading'];

function mediaCell(cell: string, caption: string): NormalizedMedia[] {
  return cell
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((ref, i) =>
      isHttpUrl(ref)
        ? { url: ref, ref, ...(caption && i === 0 ? { caption } : {}) }
        : { url: null, ref, unavailable: 'Local file names cannot be imported from a CSV. Add the file in the board editor, or import a board package (.zip).' },
    );
}

export function parseGenericCsv(text: string, fileName: string): NormalizedBoard {
  const rows = parseCsv(text);
  if (!rows.length) throw new ImportError('The file is empty.');
  const header = rows[0].map((h) => {
    const k = h.trim().toLowerCase().replace(/\s+/g, '_');
    return ALIASES[k] ?? k;
  });
  for (const req of ['category', 'question', 'answer'])
    if (!header.includes(req)) throw new ImportError(`Missing column "${req}". Expected columns: ${GENERIC_CSV_COLUMNS.join(', ')}`);
  const col = (n: string) => header.indexOf(n);
  const warnings: string[] = [];
  const rounds: NormalizedRound[] = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (n: string) => (col(n) >= 0 ? (r[col(n)] ?? '').trim() : '');
    const roundName = get('round') || 'Round 1';
    const isFinal = /^final/i.test(roundName);
    const catName = get('category');
    if (!catName) return void warnings.push(`Line ${line}: no category — row skipped.`);
    let value = parseMoney(get('value'));
    if (!Number.isFinite(value)) {
      if (!isFinal && get('value')) warnings.push(`Line ${line}: "${get('value')}" is not a number — set to 0.`);
      value = 0;
    }
    const name = isFinal ? 'Final Jeopardy!' : roundName;
    let round = rounds.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!round) {
      round = { name, kind: isFinal ? 'final' : 'standard', categories: [] };
      rounds.push(round);
    }
    let cat = round.categories.find((c) => c.name === catName);
    if (!cat) {
      if (isFinal && round.categories.length) return void warnings.push(`Line ${line}: the Final round has only one category — row skipped.`);
      cat = { name: catName, clues: [] };
      round.categories.push(cat);
    }
    const sub = get('category_subheading');
    if (sub && !cat.subheading) cat.subheading = sub;
    if (isFinal && cat.clues.length) return void warnings.push(`Line ${line}: the Final round has only one clue — row skipped.`);
    const notes = get('notes');
    cat.clues.push({
      value: isFinal ? 0 : value,
      question: get('question'),
      answer: get('answer'),
      ...(truthy(get('daily_wager')) ? { dailyWager: true } : {}),
      ...(notes ? { notes } : {}),
      media: mediaCell(get('image'), get('caption')),
      answerMedia: mediaCell(get('answer_image'), get('answer_caption')),
    });
  });
  rounds.sort((a, b) => Number(a.kind === 'final') - Number(b.kind === 'final'));
  for (const r of rounds) for (const c of r.categories) c.clues.sort((a, b) => a.value - b.value);
  const title = fileName.replace(/\.[a-z0-9]+$/i, '').trim() || 'Imported board';
  return { key: 'board', label: title, title, description: '', tags: ['imported'], rounds, warnings };
}

export const genericCsvSource: ImportSource = {
  id: 'csv',
  label: 'Spreadsheet (CSV)',
  detect(input: ImportInput) {
    if (input.kind !== 'file') return false;
    const h = csvHeader(input.text);
    return h.includes('category') && h.includes('question') && h.includes('answer');
  },
  async parse(input: ImportInput) {
    if (input.kind !== 'file') throw new ImportError('CSV files are imported from a file.');
    const board = parseGenericCsv(input.text, input.name);
    return { sourceId: 'csv', sourceLabel: 'Spreadsheet (CSV)', title: board.title, boards: [board], warnings: [] };
  },
};
