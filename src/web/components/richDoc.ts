// R10-11: the board's rich text ([b] [i] [u] tags and line breaks, shared/richText.ts) ⇄ the visual
// editor's document (TipTap / ProseMirror JSON: paragraphs of text with bold / italic / underline
// marks and hard breaks). The stored format does not change — the editor only shows it visually.
import { parseRich } from '../../shared/richText';

export interface DocNode {
  type: string;
  text?: string;
  marks?: { type: string }[];
  content?: DocNode[];
}

const MARK_OF = { b: 'bold', i: 'italic', u: 'underline' } as const;
const TAG_OF: Record<string, 'b' | 'i' | 'u'> = { bold: 'b', italic: 'i', underline: 'u' };
const ORDER = ['b', 'i', 'u'] as const;

/** Stored text → one paragraph whose lines are separated by hard breaks. */
export function markupToDoc(src: string): DocNode {
  const content: DocNode[] = [];
  parseRich(src).forEach((runs, li) => {
    if (li > 0) content.push({ type: 'hardBreak' });
    for (const r of runs) {
      const marks = ORDER.filter((k) => r[k]).map((k) => ({ type: MARK_OF[k] }));
      content.push({ type: 'text', text: r.text, ...(marks.length ? { marks } : {}) });
    }
  });
  return { type: 'doc', content: [{ type: 'paragraph', ...(content.length ? { content } : {}) }] };
}

/**
 * Editor document → stored text. Paragraphs (e.g. pasted ones) and hard breaks become line breaks;
 * formatting becomes tags, opened in a fixed order and closed as soon as it ends, so the same
 * document always gives the same text.
 */
export function docToMarkup(doc: DocNode): string {
  let out = '';
  // Line breaks wait for the next text, so a style that ends at a line end closes before it
  // ("[b]Rome[/b]\nItaly", not "[b]Rome\n[/b]Italy").
  let breaks = '';
  const open: ('b' | 'i' | 'u')[] = [];
  const closeFrom = (k: number) => {
    while (open.length > k) out += `[/${open.pop()}]`;
  };
  (doc.content ?? []).forEach((para, pi) => {
    if (pi > 0) breaks += '\n';
    for (const n of para.content ?? []) {
      if (n.type === 'hardBreak') {
        breaks += '\n';
        continue;
      }
      if (n.type !== 'text' || !n.text) continue;
      const want = new Set((n.marks ?? []).map((m) => TAG_OF[m.type]).filter(Boolean));
      const stale = open.findIndex((t) => !want.has(t));
      if (stale >= 0) closeFrom(stale);
      out += breaks;
      breaks = '';
      for (const t of ORDER) if (want.has(t) && !open.includes(t)) (open.push(t), (out += `[${t}]`));
      out += n.text;
    }
  });
  closeFrom(0);
  return out + breaks;
}
