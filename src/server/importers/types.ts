// Board importing (R2-20 / R2-21) — shared types.
//
// Pipeline stages, each in its own module:
//   1. source parsing      (sources/*.ts — one plugin per source, all site-specific logic lives there)
//   2. normalisation       (plugins emit a NormalizedImport; limits.ts clamps it to app limits)
//   3. media acquisition   (media.ts — downloads permitted media through net.ts, then the server's
//                           storeClueMedia re-validates every file by content)
//   4. validation          (build.ts — boardContentSchema + validateBoard)
//   5. board creation      (importRoutes.ts — saveBoard, with rollback of stored media on failure)

export type MediaKind = 'image' | 'audio' | 'video';

/** A media reference found in the source. `url` is an absolute http(s) URL we may download;
 *  when it is null the media cannot be imported and `unavailable` says why. */
export interface NormalizedMedia {
  url: string | null;
  /** What the source called it (URL, file name…) — shown in the missing-media report. */
  ref: string;
  kindHint?: MediaKind;
  caption?: string;
  unavailable?: string;
}

export interface NormalizedClue {
  value: number;
  question: string;
  answer: string;
  notes?: string;
  dailyWager?: boolean;
  media: NormalizedMedia[];
  answerMedia: NormalizedMedia[];
}

export interface NormalizedCategory {
  name: string;
  clues: NormalizedClue[];
}

export interface NormalizedRound {
  name: string;
  kind: 'standard' | 'final';
  categories: NormalizedCategory[];
}

export interface NormalizedBoard {
  /** Stable key inside one import (e.g. a show number for multi-show datasets). */
  key: string;
  /** Short label for pickers. */
  label: string;
  title: string;
  description?: string;
  tags?: string[];
  rounds: NormalizedRound[];
  warnings: string[];
}

export interface NormalizedImport {
  sourceId: string;
  sourceLabel: string;
  title: string;
  boards: NormalizedBoard[];
  warnings: string[];
  /** Human-readable credit for where the content came from; stored in the board description. */
  attribution?: string;
  /** The link the user gave us (URL imports only). */
  originUrl?: string;
}

export type ImportInput = { kind: 'url'; url: URL } | { kind: 'file'; name: string; text: string };

export interface FetchedText {
  text: string;
  contentType: string;
  finalUrl: string;
}

export interface ParseContext {
  /** Fetch a text document through the SSRF-protected client. Throws ImportError. */
  fetchText(url: string, opts?: { accept?: string; maxBytes?: number; timeoutMs?: number; describe?: (status: number) => string | null }): Promise<FetchedText>;
  /** Parse a file input with the file-based sources (used by plugins that download files). */
  parseFile(input: { name: string; text: string }): Promise<NormalizedImport>;
}

export interface ImportSource {
  id: string;
  label: string;
  /** Cheap check: does this plugin handle the input? The first matching plugin wins. */
  detect(input: ImportInput): boolean;
  parse(input: ImportInput, ctx: ParseContext): Promise<NormalizedImport>;
}

/** Errors meant for the user. `status` is the HTTP status the route should use. */
export class ImportError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code: string = 'invalid',
  ) {
    super(message);
  }
}
