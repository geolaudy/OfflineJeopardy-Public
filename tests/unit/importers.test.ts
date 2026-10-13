import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkUrl, isPrivateAddress } from '../../src/server/importers/net';
import { createRegistry, parseInput } from '../../src/server/importers/registry';
import { createBuzzingaSource, normalizeBuzzingaBoard, parseBuzzingaCsv, parseShareLink } from '../../src/server/importers/sources/buzzinga';
import { parseJeopardyDataset } from '../../src/server/importers/sources/jeopardyDataset';
import { parseGenericCsv } from '../../src/server/importers/sources/csv';
import { applyLimits, buildContent, previewBoard, validateContent } from '../../src/server/importers/pipeline';
import { stripHtml } from '../../src/server/importers/text';
import { ImportError, type NormalizedBoard } from '../../src/server/importers/types';

const fx = (name: string) => fs.readFileSync(path.join(__dirname, '../fixtures/import', name), 'utf8');
const noNet = { allowPrivateNetworks: false, fetchImpl: (() => Promise.reject(new Error('network used in a unit test'))) as unknown as typeof fetch };

function allMedia(b: NormalizedBoard) {
  const out: { url: string | null; ref: string; side: string }[] = [];
  for (const r of b.rounds)
    for (const c of r.categories)
      for (const q of c.clues) {
        for (const m of q.media) out.push({ url: m.url, ref: m.ref, side: 'clue' });
        for (const m of q.answerMedia) out.push({ url: m.url, ref: m.ref, side: 'answer' });
      }
  return out;
}

describe('text helpers', () => {
  it('strips tags and decodes entities', () => {
    expect(stripHtml('<a href="x">This</a> &amp; that&#39;s <i>it</i>')).toBe("This & that's it");
  });
});

describe('SSRF protection', () => {
  it('classifies private and public addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:192.168.0.1', '224.0.0.1'])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('rejects non-http, credentialed, local and private URLs', () => {
    for (const u of ['file:///etc/passwd', 'ftp://example.com/x', 'javascript:alert(1)', 'http://user:pw@example.com/', 'http://localhost:3000/', 'http://127.0.0.1/', 'http://[::1]/', 'http://10.0.0.5/', 'http://192.168.1.2:8080/x', 'http://printer.local/', 'http://intranet/', 'http://2130706433/'])
      expect(() => checkUrl(u), u).toThrow(ImportError);
    expect(checkUrl('https://play.buzzinga.io/share/abc').hostname).toBe('play.buzzinga.io');
    // Tests may opt in to local targets.
    expect(checkUrl('http://127.0.0.1:1234/x', { allowPrivateNetworks: true }).port).toBe('1234');
  });
});

describe('Buzzinga plugin', () => {
  it('recognises share and embed links only', () => {
    expect(parseShareLink(new URL('https://play.buzzinga.io/share/AbC_12-x'))).toBe('AbC_12-x');
    expect(parseShareLink(new URL('https://play.buzzinga.io/embed/xyz?round=2'))).toBe('xyz');
    expect(parseShareLink(new URL('https://play.buzzinga.io/edit/xyz'))).toBeNull();
    expect(parseShareLink(new URL('https://example.com/share/xyz'))).toBeNull();
  });

  it('explains private editor links instead of fetching them', async () => {
    const reg = createRegistry();
    await expect(parseInput({ kind: 'url', url: new URL('https://play.buzzinga.io/edit/abc') }, reg, noNet)).rejects.toThrow(/not a share link/);
  });

  it('normalises a shared board document', () => {
    const b = normalizeBuzzingaBoard(JSON.parse(fx('buzzinga-board.json')), 'https://play.buzzinga.io/share/x');
    expect(b.title).toBe('Science Night');
    expect(b.rounds.map((r) => [r.name, r.kind])).toEqual([
      ['Round 1', 'standard'],
      ['Round 2', 'standard'],
      ['Final Wager', 'final'],
    ]);
    const space = b.rounds[0].categories[0];
    expect(space.name).toBe('Space');
    expect(space.clues).toHaveLength(4); // the empty padding row is dropped
    expect(space.clues.map((q) => q.value)).toEqual([200, 400, 600, 750]);
    expect(space.clues[0].notes).toContain('Everything above the clouds');
    const pic = space.clues[1];
    expect(pic.dailyWager).toBe(true);
    expect(pic.question).toBe('Name this planet');
    expect(pic.media[0]).toMatchObject({ url: 'https://uploads.example.test/pic.png', kindHint: 'image', caption: 'Photo: NASA' });
    const video = space.clues[2];
    expect(video.media[0].url).toBeNull();
    expect(video.media[0].unavailable).toMatch(/YouTube/);
    expect(video.notes).toContain('youtube.com/watch?v=abc123');
    expect(space.clues[3].answer).toBe('The Sun');
    expect(space.clues[3].answerMedia[0].unavailable).toMatch(/Not a downloadable/);
    expect(b.rounds[1].categories[0].clues[0].value).toBe(400); // round 2 doubles
    expect(b.rounds[2].categories[0]).toMatchObject({ name: 'Famous Scientists' });
    const media = allMedia(b);
    expect(media.filter((m) => m.url).map((m) => m.url)).toEqual(['https://uploads.example.test/pic.png', 'https://uploads.example.test/sound.mp3']);
  });

  it('parses the official CSV export', () => {
    const b = parseBuzzingaCsv(fx('buzzinga-export.csv'), 'Geography.csv');
    expect(b.title).toBe('Geography');
    const [r1, r2, fin] = b.rounds;
    expect(r1.categories.map((c) => c.name)).toEqual(['Rivers', 'Mountains']);
    expect(r1.categories[0].clues).toHaveLength(3);
    expect(r1.categories[0].clues[2]).toMatchObject({ value: 600, dailyWager: true, question: 'Name this river' });
    expect(r1.categories[0].clues[2].media[0].url).toBe('https://uploads.example.test/river.png');
    expect(r1.categories[1].clues[0].value).toBe(150); // customValue
    expect(r2.categories[0].clues[0]).toMatchObject({ value: 400, answer: 'What is the Pacific?' });
    expect(fin).toMatchObject({ kind: 'final' });
    expect(fin.categories[0].clues[0].question).toBe('Capital of Australia');
  });

  it('is detected for a CSV export file and a saved board document', async () => {
    const src = createBuzzingaSource();
    expect(src.detect({ kind: 'file', name: 'x.csv', text: fx('buzzinga-export.csv') })).toBe(true);
    expect(src.detect({ kind: 'file', name: 'x.json', text: fx('buzzinga-board.json') })).toBe(true);
    expect(src.detect({ kind: 'file', name: 'x.csv', text: fx('generic.csv') })).toBe(false);
    const r = await parseInput({ kind: 'file', name: 'x.csv', text: fx('buzzinga-export.csv') }, createRegistry(), noNet);
    expect(r.sourceId).toBe('buzzinga');
  });
});

describe('clue dataset plugin', () => {
  it('groups by show, rebuilds values and marks wagers', () => {
    const r = parseJeopardyDataset(fx('jeopardy-dataset.json'), 'clues.json');
    expect(r.boards.map((b) => b.key)).toEqual(['2900', '4680']);
    const show = r.boards.find((b) => b.key === '4680')!;
    expect(show.title).toBe('Show 4680 (2004-12-31)');
    expect(show.rounds.map((x) => x.kind)).toEqual(['standard', 'standard', 'final']);
    const history = show.rounds[0].categories.find((c) => c.name === 'HISTORY')!;
    expect(history.clues.map((q) => q.value)).toEqual([200, 400, 600]);
    const dd = history.clues[2];
    expect(dd.dailyWager).toBe(true);
    expect(dd.question).toBe('This landmark was finished in 1889'); // html stripped, quotes removed
    expect(history.clues[1].question).toContain('towns & ports'); // entities decoded
    expect(dd.media).toEqual([]); // links are never followed
    expect(show.warnings.join(' ')).toMatch(/tie-breaker/);
    expect(show.warnings.join(' ')).toMatch(/pictures or video on another website/);
    expect(show.rounds[1].categories[0].clues.map((q) => q.value)).toEqual([400, 2000]);
    expect(show.rounds[2].categories[0]).toMatchObject({ name: 'THE SOLAR SYSTEM' });
    const old = r.boards.find((b) => b.key === '2900')!;
    expect(old.rounds[0].categories[0].clues.map((q) => q.value)).toEqual([100, 300]); // 1990s ladder
  });

  it('rejects files that are not clue lists', () => {
    expect(() => parseJeopardyDataset('{"a":1}', 'x.json')).toThrow(/list of clues/);
    expect(() => parseJeopardyDataset('nope', 'x.json')).toThrow(/valid JSON/);
  });
});

describe('generic CSV plugin', () => {
  it('reads media links and reports local file names as missing', () => {
    const b = parseGenericCsv(fx('generic.csv'), 'Animals and music.csv');
    expect(b.title).toBe('Animals and music');
    const animals = b.rounds[0].categories[0];
    expect(animals.clues[0].media[0]).toMatchObject({ url: 'https://uploads.example.test/elephant.png', caption: 'An elephant' });
    expect(animals.clues[1]).toMatchObject({ dailyWager: true, notes: 'Accept emperor penguin' });
    expect(animals.clues[1].answerMedia[0].url).toBe('https://uploads.example.test/penguin.png');
    const music = b.rounds[0].categories[1];
    expect(music.clues[0].media[0]).toMatchObject({ url: null, ref: 'trumpet.mp3' });
    expect(music.clues[1].value).toBe(400);
    expect(b.rounds[1].kind).toBe('final');
    const pv = previewBoard(b);
    expect(pv.summary).toMatchObject({ rounds: 2, categories: 3, clues: 5, mediaFound: 2 });
    expect(pv.missingMedia).toHaveLength(1);
  });

  it('requires category, question and answer columns', () => {
    expect(() => parseGenericCsv('a,b\n1,2', 'x.csv')).toThrow(/Missing column "category"/);
  });

  it('unknown files get a helpful error', async () => {
    await expect(parseInput({ kind: 'file', name: 'x.txt', text: 'hello world' }, createRegistry(), noNet)).rejects.toThrow(/not recognised/);
  });
});

describe('limits, build and validation', () => {
  it('clamps oversized boards with warnings and builds valid content', () => {
    const big: NormalizedBoard = {
      key: 'b',
      label: 'b',
      title: 'x'.repeat(200),
      warnings: [],
      rounds: [
        {
          name: 'Round 1',
          kind: 'standard',
          categories: Array.from({ length: 25 }, (_, i) => ({
            name: `C${i}`,
            clues: Array.from({ length: 22 }, (_, j) => ({ value: (j + 1) * 100, question: 'q'.repeat(2500), answer: 'a', media: [], answerMedia: [] })),
          })),
        },
        { name: 'Final Wager', kind: 'final', categories: [{ name: 'F', clues: [{ value: 9, question: 'fq', answer: 'fa', dailyWager: true, media: [], answerMedia: [] }, { value: 0, question: 'extra', answer: 'x', media: [], answerMedia: [] }] }] },
      ],
    };
    const b = applyLimits(big);
    expect(b.title.length).toBeLessThanOrEqual(120);
    expect(b.rounds[0].categories).toHaveLength(20);
    expect(b.rounds[0].categories[0].clues).toHaveLength(20);
    expect(b.rounds[1].categories[0].clues).toHaveLength(1);
    expect(b.warnings.join(' ')).toMatch(/first 20 categories/);
    expect(b.warnings.join(' ')).toMatch(/Final round keeps only its first clue/);
    const content = buildContent(b, new Map());
    expect(validateContent(content)).toEqual([]);
    expect(content.rounds[1].categories[0].clues[0].dailyWager).toBeUndefined();
  });

  it('keeps only stored media, with the kind decided by the server', () => {
    const b = applyLimits(parseGenericCsv(fx('generic.csv'), 'g.csv'));
    const content = buildContent(b, new Map([['https://uploads.example.test/elephant.png', { url: '/media/clues/abc.webp', kind: 'image' as const }]]));
    const animals = content.rounds[0].categories[0];
    expect(animals.clues[0].media).toEqual([{ kind: 'image', url: '/media/clues/abc.webp', caption: 'An elephant' }]);
    expect(animals.clues[1].answerMedia).toBeUndefined(); // penguin.png was not stored
    expect(validateContent(content)).toEqual([]);
  });
});
