// Rich clue text (R8-7, R8-8): clue and answer text stays a plain string, with line breaks
// (Shift+Enter in the editor) and three tags the editor inserts — [b]bold[/b], [i]italics[/i],
// [u]underline[/u]. Brackets with other letters are ordinary text, so trivia like "M*A*S*H" or
// "[sic]" is never misread. One parser for every screen (it never produces HTML), and plainText()
// for everything that compares or sends text (bots, AI, search).

export interface RichRun {
  text: string;
  b: boolean;
  i: boolean;
  u: boolean;
}

const TAG = /\[(\/?)([biu])\]|\r?\n/gi;

/** Lines of styled runs. Tags nest; an unmatched closing tag is ignored, an unclosed one runs to the end. */
export function parseRich(src: string): RichRun[][] {
  const lines: RichRun[][] = [[]];
  const on = { b: 0, i: 0, u: 0 };
  const push = (text: string) => {
    if (text) lines[lines.length - 1].push({ text, b: on.b > 0, i: on.i > 0, u: on.u > 0 });
  };
  let last = 0;
  TAG.lastIndex = 0;
  for (let m = TAG.exec(src); m; m = TAG.exec(src)) {
    push(src.slice(last, m.index));
    last = TAG.lastIndex;
    if (!m[2]) {
      lines.push([]);
      continue;
    }
    const k = m[2].toLowerCase() as 'b' | 'i' | 'u';
    on[k] = m[1] ? Math.max(0, on[k] - 1) : on[k] + 1;
  }
  push(src.slice(last));
  return lines;
}

/** Without tags, line breaks as spaces — for comparing answers, AI prompts and one-line previews. */
export function plainText(src: string): string {
  return src
    .replace(/\[\/?[biu]\]/gi, '')
    .replace(/[ \t]*\r?\n[ \t]*/g, ' ')
    .trim();
}

/** True when the text uses formatting or line breaks. */
export const isRich = (src: string) => /\[\/?[biu]\]|\n/i.test(src);

/** Wraps the selection [start, end) in a tag pair (or removes the pair when it is exactly wrapped). */
export function toggleTag(src: string, start: number, end: number, tag: 'b' | 'i' | 'u'): { text: string; start: number; end: number } {
  const open = `[${tag}]`;
  const close = `[/${tag}]`;
  const before = src.slice(0, start);
  const sel = src.slice(start, end);
  const after = src.slice(end);
  if (before.toLowerCase().endsWith(open) && after.toLowerCase().startsWith(close))
    return { text: before.slice(0, -open.length) + sel + after.slice(close.length), start: start - open.length, end: end - open.length };
  if (sel.toLowerCase().startsWith(open) && sel.toLowerCase().endsWith(close) && sel.length >= open.length + close.length)
    return { text: before + sel.slice(open.length, sel.length - close.length) + after, start, end: end - open.length - close.length };
  return { text: before + open + sel + close + after, start: start + open.length, end: end + open.length };
}
