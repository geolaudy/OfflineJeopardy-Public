// R10-11: the visual editor's document ⇄ the board's stored text ([b] [i] [u] + line breaks).
// Existing boards open unchanged; edits produce the same stored format; nothing else gets in.
import { describe, expect, it } from 'vitest';
import { docToMarkup, markupToDoc, type DocNode } from '../../src/web/components/richDoc';
import { parseRich, plainText } from '../../src/shared/richText';

const round = (s: string) => docToMarkup(markupToDoc(s));
/** What a reader sees: each character with its styles, line by line. */
const looks = (s: string) => parseRich(s).map((runs) => runs.flatMap((r) => [...r.text].map((ch) => `${ch}${+r.b}${+r.i}${+r.u}`)).join(''));
const t = (text: string, ...marks: string[]): DocNode => ({ type: 'text', text, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const doc = (...paras: DocNode[][]): DocNode => ({ type: 'doc', content: paras.map((content) => ({ type: 'paragraph', content })) });

describe('rich text editor format (R10-11)', () => {
  it('bold, italic and underline become marks and back', () => {
    for (const s of ['[b]Person[/b]', '[i]Person[/i]', '[u]Person[/u]', 'A [b]bold[/b] word']) expect(round(s)).toBe(s);
    expect(markupToDoc('A [b]bold[/b] word').content![0].content).toEqual([t('A '), t('bold', 'bold'), t(' word')]);
  });

  it('several and nested styles', () => {
    expect(round('[b][i]both[/i][/b]')).toBe('[b][i]both[/i][/b]');
    expect(round('[b]one [i]two[/i] three[/b]')).toBe('[b]one [i]two[/i] three[/b]');
    expect(round('[u]x[/u][b]y[/b]')).toBe('[u]x[/u][b]y[/b]');
    // The same look always gives the same text (fixed order), whatever order the tags had.
    expect(round('[i][b]both[/b][/i]')).toBe('[b][i]both[/i][/b]');
    expect(looks(round('[i][b]both[/b][/i]'))).toEqual(looks('[i][b]both[/b][/i]'));
  });

  it('line breaks: hard breaks and pasted paragraphs', () => {
    expect(round('Rome\nItaly')).toBe('Rome\nItaly');
    expect(round('[b]Rome\nItaly[/b]')).toBe('[b]Rome\nItaly[/b]');
    expect(round('a\n\nb')).toBe('a\n\nb');
    expect(docToMarkup(doc([t('first')], [t('second', 'italic')]))).toBe('first\n[i]second[/i]');
    expect(markupToDoc('a\nb').content![0].content!.map((n) => n.type)).toEqual(['text', 'hardBreak', 'text']);
    // A style that ends at a line end closes before the break (the editor keeps it on the break).
    expect(docToMarkup(doc([t('Rome', 'bold'), { type: 'hardBreak', marks: [{ type: 'bold' }] }, t('Italy')]))).toBe('[b]Rome[/b]\nItaly');
    expect(round('trailing\n')).toBe('trailing\n');
  });

  it('existing boards: every saved form renders the same after a round trip', () => {
    for (const s of ['[B]Caps tags[/B]', '[b]unclosed', 'stray [/i] close', '[b]x[/b][b]y[/b]', 'Plain clue.']) {
      expect(looks(round(s))).toEqual(looks(s));
      expect(plainText(round(s))).toBe(plainText(s));
    }
    expect(round('Plain clue.')).toBe('Plain clue.');
  });

  it('special characters and brackets that are not tags stay text', () => {
    for (const s of ['M*A*S*H', '[sic] & <b>not html</b> "quotes" — 1/2 · ü ñ 漢字 🎵', 'a [x] b', 'tabs\tand  spaces']) expect(round(s)).toBe(s);
    expect(markupToDoc('<script>alert(1)</script>').content![0].content).toEqual([t('<script>alert(1)</script>')]);
  });

  it('empty fields and long clues', () => {
    expect(markupToDoc('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(round('')).toBe('');
    const long = `${'[b]Bold[/b] and plain words. '.repeat(60)}end`;
    expect(round(long)).toBe(long.replace(/\[\/b\]\[b\]/g, ''));
    expect(looks(round(long))).toEqual(looks(long));
  });

  it('marks the stored format does not know are dropped (only b / i / u)', () => {
    expect(docToMarkup(doc([t('code', 'code'), t(' link', 'link')]))).toBe('code link');
  });
});
