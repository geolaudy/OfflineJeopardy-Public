// Jeopardy!/Buzzinga sound pack (R4-1). The recordings belong to the owner and are never part of
// the repository or public releases. They come from:
//   1. "installed": files the host added in Settings → stored in <data>/media/soundpacks/buzzinga;
//   2. "bundled": folders found automatically — shipped with a personal build, used in development
//      (new_sfx/), or a "Sounds"/"new_sfx" folder placed next to the app (R5-9). Every existing
//      folder is used; for a cue found in several, the first folder listed wins.
// Each file is matched to a cue by its name (shared/tvFx.ts PACK_FILE_RULES); installed files win.
import fs from 'node:fs';
import path from 'node:path';
import { cueForFileName, type PackFiles, type SoundCue } from '../shared/tvFx.js';

export const PACK_ID = 'buzzinga';
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a']);
export type PackSource = 'installed' | 'bundled';

export interface PackFile {
  name: string;
  cue: SoundCue | null;
  source: PackSource;
  url: string | null;
  bytes: number;
}

export class SoundPacks {
  constructor(
    readonly installedDir: string,
    private bundledDirs: string[],
  ) {
    fs.mkdirSync(installedDir, { recursive: true });
  }

  private dirsFor(source: PackSource): string[] {
    const dirs = source === 'installed' ? [this.installedDir] : this.bundledDirs;
    return [...new Set(dirs.map((d) => path.resolve(d)))].filter((d) => {
      try {
        return fs.statSync(d).isDirectory();
      } catch {
        return false;
      }
    });
  }

  /** Folders searched for bundled files (for the Settings panel). */
  bundledFolders(): string[] {
    return this.dirsFor('bundled');
  }

  private list(source: PackSource): PackFile[] {
    const out: PackFile[] = [];
    const seen = new Set<string>();
    for (const dir of this.dirsFor(source)) {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (!e.isFile() || !AUDIO_EXT.has(path.extname(e.name).toLowerCase()) || seen.has(e.name.toLowerCase())) continue;
        seen.add(e.name.toLowerCase());
        const cue = cueForFileName(e.name);
        out.push({ name: e.name, cue, source, url: cue ? `/media/pack/${source}/${encodeURIComponent(e.name)}` : null, bytes: fs.statSync(path.join(dir, e.name)).size });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every audio file found, with the cue it plays (null = name not recognised). */
  files(): PackFile[] {
    return [...this.list('installed'), ...this.list('bundled')];
  }

  /** cue → URL for the TV. Installed files override bundled ones; within a source the first
   *  file (by folder, then name) for a cue wins. */
  cueUrls(): PackFiles {
    const out: PackFiles = {};
    for (const source of ['installed', 'bundled'] as const) for (const f of this.list(source)) if (f.cue && f.url && !out[f.cue]) out[f.cue] = f.url;
    return out;
  }

  /** Absolute path of a served file, or null (path traversal and unknown names refused). */
  resolve(source: string, name: string): string | null {
    if (source !== 'installed' && source !== 'bundled') return null;
    if (!/^[\w .()!'&,-]{1,140}$/.test(name) || name.includes('..') || !AUDIO_EXT.has(path.extname(name).toLowerCase())) return null;
    for (const dir of this.dirsFor(source)) {
      const full = path.resolve(dir, name);
      if (path.dirname(full) === dir && fs.existsSync(full)) return full;
    }
    return null;
  }

  /** Stores an uploaded file under a safe version of its own name (the name decides the cue). */
  install(originalName: string, ext: string, buf: Buffer): PackFile {
    const cue = cueForFileName(originalName);
    if (!cue) throw new Error(`"${originalName}" does not match a sound cue — rename it like board_fill.mp3, buzzed_in.mp3 or final_jeopardy_think.mp3`);
    const stem = path.basename(originalName, path.extname(originalName)).replace(/[^\w .()!'&,-]+/g, '_').slice(0, 100).trim() || cue;
    const name = `${stem}.${ext}`;
    // One file per cue: replace whatever played that cue before.
    for (const f of this.list('installed')) if (f.cue === cue) fs.rmSync(path.join(this.installedDir, f.name), { force: true });
    fs.writeFileSync(path.join(this.installedDir, name), buf);
    return { name, cue, source: 'installed', url: `/media/pack/installed/${encodeURIComponent(name)}`, bytes: buf.length };
  }

  remove(name: string) {
    const full = this.resolve('installed', name);
    if (full) fs.rmSync(full, { force: true });
  }

  removeAll() {
    for (const f of this.list('installed')) fs.rmSync(path.join(this.installedDir, f.name), { force: true });
  }
}
