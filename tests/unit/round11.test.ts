// Round 11: Buzzinga picture clues bring their text in as the clue text (R11-2).
import { describe, expect, it } from 'vitest';
import { normalizeBuzzingaBoard, parseBuzzingaCsv } from '../../src/server/importers/sources/buzzinga';
import { applyLimits, buildContent, validateContent, type StoredMedia } from '../../src/server/importers/pipeline';

const IMG = 'https://uploads.example.test/r11.png';
const SND = 'https://uploads.example.test/r11.mp3';
type Bz = Record<string, unknown>;
const board = (...clues: Bz[]) => normalizeBuzzingaBoard({ name: 'R11', rounds: [[{ category: 'Pics', clues }]] } as never, undefined);
const first = (...clues: Bz[]) => board(...clues).rounds[0].categories[0].clues;
/** The board as it is saved (media "stored" at local URLs). */
function saved(...clues: Bz[]) {
  const b = applyLimits(board(...clues));
  const stored = new Map<string, StoredMedia>([
    [IMG, { url: '/media/clues/r11.webp', kind: 'image' }],
    [SND, { url: '/media/clues/r11.mp3', kind: 'audio' }],
  ]);
  const content = buildContent(b, stored);
  expect(validateContent(content)).toEqual([]);
  return content.rounds[0].categories[0].clues;
}

describe('Buzzinga picture clues: the text is the clue text (R11-2)', () => {
  it('picture only: no text, no caption', () => {
    const [q] = saved({ text: IMG, answer: 'Saturn', type: 'IMAGE' });
    expect(q.question).toBe('');
    expect(q.media).toEqual([{ kind: 'image', url: '/media/clues/r11.webp' }]);
  });

  it('text only: unchanged', () => {
    const [q] = saved({ text: 'The ringed planet', answer: 'Saturn', type: 'TEXT' });
    expect(q).toMatchObject({ question: 'The ringed planet', answer: 'Saturn' });
    expect(q.media).toBeUndefined();
  });

  it('picture with text below it (Buzzinga\'s usual place): clue text, never the caption', () => {
    const [q] = saved({ text: IMG, answer: 'Saturn', type: 'IMAGE', bottomCaption: 'Name this planet' });
    expect(q.question).toBe('Name this planet');
    expect(q.media).toEqual([{ kind: 'image', url: '/media/clues/r11.webp' }]);
    expect(q.media![0].caption).toBeUndefined();
  });

  it('picture with text above and below: both lines, in order', () => {
    const [q] = first({ text: IMG, answer: 'Saturn', type: 'IMAGE', topCaption: 'Look closely', bottomCaption: 'Name this planet' });
    expect(q.question).toBe('Look closely\nName this planet');
    expect(q.media[0].caption).toBeUndefined();
  });

  it('picture + clue text + answer text; answer picture with its text as the correct response', () => {
    const [q] = saved(
      { text: IMG, answer: 'Saturn', type: 'IMAGE', bottomCaption: 'Name this planet' },
      { text: 'The ringed planet', answer: IMG, type: 'TEXT', answerType: 'IMAGE', answerBottomCaption: 'Saturn' },
    );
    expect(q).toMatchObject({ question: 'Name this planet', answer: 'Saturn' });
    const [, a] = saved({ text: 'x', answer: 'y' }, { text: 'The ringed planet', answer: IMG, type: 'TEXT', answerType: 'IMAGE', answerBottomCaption: 'Saturn' });
    expect(a.answer).toBe('Saturn');
    expect(a.answerMedia).toEqual([{ kind: 'image', url: '/media/clues/r11.webp' }]); // not repeated as a caption
  });

  it('sound clue with text: the text is the clue', () => {
    const [q] = saved({ text: SND, answer: 'The Beatles', type: 'AUDIO', bottomCaption: 'Name the band' });
    expect(q.question).toBe('Name the band');
    expect(q.media).toEqual([{ kind: 'audio', url: '/media/clues/r11.mp3' }]);
  });

  it('the CSV export behaves the same', () => {
    const csv = [
      'round,col,cat,row,clueText,correctResponse,clueType,topCaption,bottomCaption,answerType',
      `1,1,Pics,1,${IMG},Saturn,IMAGE,,Name this planet,TEXT`,
      '1,1,Pics,2,Plain text clue,Mars,TEXT,,,TEXT',
    ].join('\n');
    const [pic, plain] = parseBuzzingaCsv(csv, 'R11.csv').rounds[0].categories[0].clues;
    expect(pic.question).toBe('Name this planet');
    expect(pic.media[0].caption).toBeUndefined();
    expect(plain.question).toBe('Plain text clue');
  });

  it('a picture whose download fails keeps its text as the clue (and says what was missing)', () => {
    const b = applyLimits(board({ text: IMG, answer: 'Saturn', type: 'IMAGE', bottomCaption: 'Name this planet' }));
    const [q] = buildContent(b, new Map()).rounds[0].categories[0].clues;
    expect(q.question).toBe('Name this planet');
    expect(q.notes).toContain(IMG);
  });
});
