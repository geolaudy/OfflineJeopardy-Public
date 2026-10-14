/**
 * Clue media formats the server actually accepts (see server/images.ts: images are decoded by
 * sharp and re-encoded; audio/video are sniffed by magic bytes and stored as-is).
 *
 * File pickers list explicit extensions as well as MIME types: with only `audio/*` Chromium on
 * Windows builds its filter from the registry, which often has no audio entries, so the dialog
 * opened on "Image files" and audio could only be chosen via "All files".
 */
export type MediaKind = 'image' | 'audio' | 'video';

export const MEDIA_FORMATS: Record<MediaKind, { label: string; exts: string[]; mimes: string[] }> = {
  image: { label: 'Image', exts: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tif', '.tiff'], mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/tiff'] },
  audio: { label: 'Audio', exts: ['.mp3', '.m4a', '.wav', '.ogg', '.oga'], mimes: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/ogg'] },
  video: { label: 'Video', exts: ['.mp4', '.m4v', '.webm'], mimes: ['video/mp4', 'video/webm'] },
};

/** Value for an `<input type="file" accept>`; several kinds = all of them in one filter. */
export function acceptFor(...kinds: MediaKind[]): string {
  const ks = kinds.length ? kinds : (Object.keys(MEDIA_FORMATS) as MediaKind[]);
  return ks.flatMap((k) => [...MEDIA_FORMATS[k].exts, ...MEDIA_FORMATS[k].mimes]).join(',');
}

/** Human-readable list of extensions, e.g. "MP3, M4A, WAV, OGG". */
export function formatList(kind: MediaKind): string {
  return [...new Set(MEDIA_FORMATS[kind].exts.map((e) => e.slice(1).toUpperCase()).filter((e) => !['JPEG', 'TIF', 'OGA', 'M4V'].includes(e)))].join(', ');
}

export function isMediaKind(v: unknown): v is MediaKind {
  return v === 'image' || v === 'audio' || v === 'video';
}
