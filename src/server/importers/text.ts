// Small text helpers shared by the source plugins.
import { parseCsv } from '../../shared/boardIO.js';

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[ent.toLowerCase()] ?? m;
  });
}

/** Strip HTML tags (keeping their text), decode entities and collapse whitespace. */
export function stripHtml(s: string): string {
  return decodeEntities(
    s
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the text contains a link (e.g. archive clues that pointed at a picture). */
export function hasHtmlLink(s: string): boolean {
  return /<a\s[^>]*href=/i.test(s);
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

/** "$1,200" / "1200" / 1200 → 1200; anything else → NaN. */
export function parseMoney(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : NaN;
  const t = str(v).replace(/[$€£,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  return Math.round(Number(t));
}

export function isHttpUrl(s: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(s.trim());
}

export function truthy(v: unknown): boolean {
  return v === true || /^(y|yes|true|1|x)$/i.test(str(v).trim());
}

/** First line of a CSV file, lower-cased and trimmed (cheap detection without parsing the whole file). */
export function csvHeader(text: string): string[] {
  const t = text.replace(/^﻿/, '');
  const nl = t.search(/\r?\n/);
  const first = nl >= 0 ? t.slice(0, nl) : t;
  return (parseCsv(first)[0] ?? []).map((h) => h.trim().toLowerCase());
}

export function looksLikeJson(text: string): '[' | '{' | null {
  const m = /^\s*([[{])/.exec(text.replace(/^﻿/, ''));
  return (m?.[1] as '[' | '{' | undefined) ?? null;
}

export function fileExt(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
}

export { parseCsv };
