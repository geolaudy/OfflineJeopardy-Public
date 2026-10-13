// A direct link to a board file (.csv / .json) the user is entitled to use — e.g. a file they put
// in cloud storage. The downloaded text is handed to the file-based plugins. Web pages are refused:
// this is not a scraper.
import type { ImportInput, ImportSource, ParseContext } from '../types.js';
import { ImportError } from '../types.js';

const MAX_FILE_BYTES = 64 * 1024 * 1024;

export const remoteFileSource: ImportSource = {
  id: 'remote-file',
  label: 'Link to a .csv or .json file',
  detect: (input: ImportInput) => input.kind === 'url',
  async parse(input: ImportInput, ctx: ParseContext) {
    if (input.kind !== 'url') throw new ImportError('Expected a link.');
    const res = await ctx.fetchText(input.url.toString(), { accept: 'text/csv, application/json, text/plain;q=0.9, */*;q=0.1', maxBytes: MAX_FILE_BYTES, timeoutMs: 60_000 });
    if (/text\/html|application\/xhtml/.test(res.contentType) || /^\s*<(!doctype|html)/i.test(res.text.slice(0, 200)))
      throw new ImportError('This link opens a web page, not a board file. Supported links: Buzzinga share links, or direct links to a .csv or .json file.', 400, 'html');
    const name = decodeURIComponent(new URL(res.finalUrl).pathname.split('/').pop() || 'board');
    const result = await ctx.parseFile({ name, text: res.text });
    const origin = input.url.toString();
    return {
      ...result,
      originUrl: origin,
      attribution: result.attribution ? `${result.attribution} Downloaded from ${origin}.` : `Downloaded from ${origin}.`,
    };
  },
};
