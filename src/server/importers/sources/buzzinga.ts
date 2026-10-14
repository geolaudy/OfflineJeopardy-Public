// Buzzinga.io importer (R2-20). All Buzzinga-specific knowledge lives in this file.
//
// Two legitimate inputs (see RESEARCH_NOTES.md "Board importing (R2-20/R2-21)"):
//  1. A public *share link* (https://play.buzzinga.io/share/<id>, or an /embed/<id> link). The
//     owner must have switched the board to "Shareable". We request the same public, unauthenticated
//     JSON document the share page itself loads (GET https://api.buzzinga.io/api/getSharedBoard/<id>)
//     — no credentials, no cookies, one request per import, no retries. Boards that are not
//     shareable return 404 and are reported as such; we never try anything else.
//  2. Buzzinga's official CSV export (Buzzinga Pro: board editor > gear > Download CSV).
//     Columns: round,col,cat,catDescription,row,customValue,clueText,correctResponse,isDailyDouble,
//     clueType,topCaption,bottomCaption,answerType,answerTopCaption,answerBottomCaption,
//     buzzerActivationMode,isAudioOnly,isAnswerAudioOnly. Image/audio clues carry a media URL in
//     clueText/correctResponse; videos are YouTube links (not downloadable — kept as a host note).
//
// The JSON shape was inferred from Buzzinga's public web client (not from documentation) and could
// change at any time; parsing is defensive and the CSV export remains the fallback.
import type { ImportInput, ImportSource, MediaKind, NormalizedBoard, NormalizedClue, NormalizedImport, NormalizedMedia, NormalizedRound, ParseContext } from '../types.js';
import { ImportError } from '../types.js';
import { csvHeader, isHttpUrl, looksLikeJson, parseCsv, parseMoney, str, truthy } from '../text.js';

export const BUZZINGA_API_BASE = 'https://api.buzzinga.io';
const HOSTS = new Set(['play.buzzinga.io', 'buzzinga.io', 'www.buzzinga.io']);
const LINK_RE = /^\/(share|embed)\/([A-Za-z0-9_-]{1,80})\/?$/;
const PRIVATE_LINK_RE = /^\/(edit|board|classic|practice|join|final)\b/;

// ---------- Buzzinga's own shapes (only the fields we use) ----------

interface BzClue {
  text?: unknown;
  answer?: unknown;
  type?: unknown;
  answerType?: unknown;
  value?: unknown;
  isDailyDouble?: unknown;
  topCaption?: unknown;
  bottomCaption?: unknown;
  answerTopCaption?: unknown;
  answerBottomCaption?: unknown;
}
interface BzCategory {
  category?: unknown;
  description?: unknown;
  clues?: unknown;
}
interface BzBoard {
  name?: unknown;
  title?: unknown;
  rounds?: unknown;
  finalRound?: { categoryName?: unknown; clue?: BzClue } | null;
}

export function parseShareLink(u: URL): string | null {
  if (!HOSTS.has(u.hostname.toLowerCase())) return null;
  return LINK_RE.exec(u.pathname)?.[2] ?? null;
}

const isBuzzingaHost = (u: URL) => HOSTS.has(u.hostname.toLowerCase());

function kindOf(t: unknown): MediaKind | null {
  const s = str(t).toUpperCase();
  return s === 'IMAGE' ? 'image' : s === 'AUDIO' ? 'audio' : s === 'VIDEO' ? 'video' : null;
}

const isYouTube = (s: string) => /^https?:\/\/([a-z0-9-]+\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(s.trim());

function mediaFrom(ref: string, kind: MediaKind, caption: string): NormalizedMedia {
  const r = ref.trim();
  const cap = caption || undefined;
  if (!r) return { url: null, ref: '(empty)', kindHint: kind, caption: cap, unavailable: 'The media link is empty.' };
  if (kind === 'video' || isYouTube(r))
    return { url: null, ref: r, kindHint: kind, caption: cap, unavailable: 'YouTube videos cannot be downloaded; the link is kept in the host notes.' };
  if (!isHttpUrl(r)) return { url: null, ref: r, kindHint: kind, caption: cap, unavailable: 'Not a downloadable web link.' };
  return { url: r, ref: r, kindHint: kind, caption: cap };
}

function joinCaps(...c: unknown[]) {
  return c
    .map((x) => str(x).trim())
    .filter(Boolean)
    .join(' — ');
}

function clueFrom(c: BzClue, value: number, categoryNote: string): NormalizedClue {
  const notes: string[] = [];
  if (categoryNote) notes.push(`Category note: ${categoryNote}`);
  const media: NormalizedMedia[] = [];
  const answerMedia: NormalizedMedia[] = [];
  let question = str(c.text).trim();
  let answer = str(c.answer).trim();
  const qKind = kindOf(c.type);
  if (qKind) {
    const m = mediaFrom(question, qKind, str(c.bottomCaption).trim());
    media.push(m);
    if (m.unavailable && m.ref !== '(empty)') notes.push(`Original ${qKind}: ${m.ref}`);
    question = str(c.topCaption).trim();
  }
  const aKind = kindOf(c.answerType);
  if (aKind) {
    const m = mediaFrom(answer, aKind, str(c.answerBottomCaption).trim());
    answerMedia.push(m);
    if (m.unavailable && m.ref !== '(empty)') notes.push(`Original answer ${aKind}: ${m.ref}`);
    answer = joinCaps(c.answerTopCaption, c.answerBottomCaption) || `(answer shown as ${aKind})`;
  }
  return {
    value,
    question,
    answer,
    ...(truthy(c.isDailyDouble) ? { dailyWager: true } : {}),
    ...(notes.length ? { notes: notes.join('\n') } : {}),
    media,
    answerMedia,
  };
}

/** Normalise Buzzinga's board document (from a share link or a saved JSON file). */
export function normalizeBuzzingaBoard(doc: BzBoard, origin: string | undefined): NormalizedBoard {
  const warnings: string[] = [];
  const rounds: NormalizedRound[] = [];
  const rawRounds = Array.isArray(doc.rounds) ? doc.rounds : [];
  rawRounds.slice(0, 3).forEach((cats, ri) => {
    if (!Array.isArray(cats)) return;
    const round: NormalizedRound = { name: `Round ${ri + 1}`, kind: 'standard', categories: [] };
    for (const cat of cats as BzCategory[]) {
      if (!cat || typeof cat !== 'object') continue;
      const clues = (Array.isArray(cat.clues) ? (cat.clues as BzClue[]) : []).map((c, row) => {
        const custom = parseMoney(c?.value);
        return clueFrom(c ?? {}, Number.isFinite(custom) && custom >= 0 ? custom : (row + 1) * 200 * (ri + 1), str(cat.description).trim());
      });
      // Skip padding: rows with neither text nor media.
      const used = clues.filter((q) => q.question || q.media.length || (q.answer && !q.answer.startsWith('(answer shown')));
      const name = str(cat.category).trim();
      if (!name && used.length === 0) continue;
      round.categories.push({ name, clues: used });
    }
    if (round.categories.some((c) => c.clues.length)) rounds.push(round);
  });
  if (rawRounds.length > 3) warnings.push('Only the first three rounds were imported.');
  const fr = doc.finalRound;
  if (fr && typeof fr === 'object' && fr.clue && (str(fr.clue.text).trim() || str(fr.clue.answer).trim())) {
    rounds.push({ name: 'Final Jeopardy!', kind: 'final', categories: [{ name: str(fr.categoryName).trim(), clues: [clueFrom(fr.clue, 0, '')] }] });
  }
  const title = (str(doc.name) || str(doc.title)).trim() || 'Buzzinga board';
  return {
    key: 'board',
    label: title,
    title,
    description: origin ? `Imported from a Buzzinga.io share link (${origin}). The content belongs to the board's creator.` : "Imported from a Buzzinga.io board export. The content belongs to the board's creator.",
    tags: ['imported', 'buzzinga'],
    rounds,
    warnings,
  };
}

// ---------- official CSV export ----------

const ALIASES: Record<string, string> = {
  round: 'round',
  col: 'col',
  cat: 'cat',
  category: 'cat',
  catdescription: 'catDescription',
  row: 'row',
  val: 'val',
  customvalue: 'customValue',
  cluetext: 'clueText',
  q: 'clueText',
  correctresponse: 'correctResponse',
  a: 'correctResponse',
  isdailydouble: 'isDailyDouble',
  dd: 'isDailyDouble',
  cluetype: 'clueType',
  type: 'clueType',
  topcaption: 'topCaption',
  bottomcaption: 'bottomCaption',
  answertype: 'answerType',
  answertopcaption: 'answerTopCaption',
  answerbottomcaption: 'answerBottomCaption',
};

export function isBuzzingaCsvHeader(header: string[]): boolean {
  const h = new Set(header);
  return (h.has('cluetext') && h.has('correctresponse')) || (h.has('cat') && h.has('col') && h.has('row') && (h.has('q') || h.has('cluetext')));
}

/** Rebuild a Buzzinga board document from its CSV export, then normalise it like a share link. */
export function parseBuzzingaCsv(text: string, fileName: string): NormalizedBoard {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((h) => ALIASES[h.trim().toLowerCase()] ?? h.trim());
  const idx = (k: string) => header.indexOf(k);
  const get = (r: string[], k: string) => (idx(k) >= 0 ? (r[idx(k)] ?? '').trim() : '');
  const rounds: (BzCategory & { clues: BzClue[] })[][] = [[], [], []];
  let finalRound: BzBoard['finalRound'] = null;
  const warnings: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const roundCell = get(r, 'round').toLowerCase();
    const clue: BzClue = {
      text: get(r, 'clueText'),
      answer: get(r, 'correctResponse'),
      type: get(r, 'clueType') || 'TEXT',
      answerType: get(r, 'answerType') || 'TEXT',
      isDailyDouble: get(r, 'isDailyDouble'),
      topCaption: get(r, 'topCaption'),
      bottomCaption: get(r, 'bottomCaption'),
      answerTopCaption: get(r, 'answerTopCaption'),
      answerBottomCaption: get(r, 'answerBottomCaption'),
    };
    if (roundCell === 'final') {
      finalRound = { categoryName: get(r, 'cat'), clue };
      return;
    }
    const rn = Number(roundCell || '1');
    if (!Number.isInteger(rn) || rn < 1 || rn > 3) {
      if (r.some((c) => c.trim())) warnings.push(`Line ${i + 2}: unknown round "${get(r, 'round')}" was skipped.`);
      return;
    }
    if (!get(r, 'cat') && !clue.text && !clue.answer) return; // separator row
    const col = Math.max(1, Math.min(20, Number(get(r, 'col')) || 1));
    const row = Math.max(1, Math.min(20, Number(get(r, 'row')) || 1));
    const cats = rounds[rn - 1];
    while (cats.length < col) cats.push({ category: '', description: '', clues: [] });
    const cat = cats[col - 1];
    if (!str(cat.category) && get(r, 'cat')) cat.category = get(r, 'cat');
    if (!str(cat.description) && get(r, 'catDescription')) cat.description = get(r, 'catDescription');
    const custom = parseMoney(get(r, 'customValue') || get(r, 'val'));
    clue.value = Number.isFinite(custom) ? custom : row * 200 * rn;
    while (cat.clues.length < row) cat.clues.push({});
    cat.clues[row - 1] = clue;
  });
  const board = normalizeBuzzingaBoard({ name: fileName.replace(/\.[a-z0-9]+$/i, ''), rounds, finalRound }, undefined);
  board.warnings.push(...warnings);
  return board;
}

// ---------- plugin ----------

export function createBuzzingaSource(opts: { apiBase?: string } = {}): ImportSource {
  const apiBase = (opts.apiBase ?? BUZZINGA_API_BASE).replace(/\/$/, '');
  const wrap = (board: NormalizedBoard, originUrl?: string): NormalizedImport => ({
    sourceId: 'buzzinga',
    sourceLabel: originUrl ? 'Buzzinga.io share link' : 'Buzzinga.io export',
    title: board.title,
    boards: [board],
    warnings: [],
    attribution: originUrl ? `Board shared publicly on Buzzinga.io (${originUrl}). Content belongs to its creator.` : 'Board exported from Buzzinga.io. Content belongs to its creator.',
    ...(originUrl ? { originUrl } : {}),
  });
  return {
    id: 'buzzinga',
    label: 'Buzzinga.io',
    detect(input: ImportInput) {
      if (input.kind === 'url') return isBuzzingaHost(input.url);
      if (looksLikeJson(input.text) === '{') return /"finalRound"\s*:/.test(input.text.slice(0, 200_000)) || /"rounds"\s*:\s*\[\s*\[/.test(input.text.slice(0, 200_000));
      return isBuzzingaCsvHeader(csvHeader(input.text));
    },
    async parse(input: ImportInput, ctx: ParseContext) {
      if (input.kind === 'file') {
        if (looksLikeJson(input.text) === '{') {
          let doc: BzBoard;
          try {
            doc = JSON.parse(input.text) as BzBoard;
          } catch {
            throw new ImportError('The file is not valid JSON.');
          }
          return wrap(normalizeBuzzingaBoard(doc, undefined));
        }
        return wrap(parseBuzzingaCsv(input.text, input.name));
      }
      const id = parseShareLink(input.url);
      if (!id) {
        if (PRIVATE_LINK_RE.test(input.url.pathname))
          throw new ImportError('This is not a share link. In Buzzinga, open the board\'s Share menu, switch on "Shareable" and use "Copy share link" (it looks like https://play.buzzinga.io/share/…).', 400, 'not-share-link');
        throw new ImportError('Paste a Buzzinga share link (it looks like https://play.buzzinga.io/share/…).', 400, 'not-share-link');
      }
      const origin = `https://play.buzzinga.io/share/${id}`;
      const res = await ctx.fetchText(`${apiBase}/api/getSharedBoard/${encodeURIComponent(id)}`, {
        accept: 'application/json',
        maxBytes: 5 * 1024 * 1024,
        timeoutMs: 20_000,
        describe: (status) =>
          status === 404
            ? 'This Buzzinga board is not shareable or does not exist. Ask its owner to switch on "Shareable", or to export it as CSV (gear icon > Download CSV) and import that file.'
            : status === 401 || status === 403
              ? 'This Buzzinga board needs a sign-in to view. OfflineJeopardy only imports public share links — export the board as CSV instead.'
              : status === 429
                ? 'Buzzinga is limiting requests right now. Please wait a few minutes and try again.'
                : null,
      });
      let doc: BzBoard;
      try {
        doc = JSON.parse(res.text) as BzBoard;
      } catch {
        throw new ImportError('Buzzinga returned something unexpected for this link. Export the board as CSV in Buzzinga and import that file instead.', 502, 'unexpected');
      }
      if (!doc || typeof doc !== 'object' || !Array.isArray(doc.rounds))
        throw new ImportError('Buzzinga returned a board format OfflineJeopardy does not recognise. Export the board as CSV in Buzzinga and import that file instead.', 502, 'unexpected');
      return wrap(normalizeBuzzingaBoard(doc, origin), origin);
    },
  };
}
