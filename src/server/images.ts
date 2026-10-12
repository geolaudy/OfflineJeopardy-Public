// Safe image processing for profile pictures and clue media.
// Uploads are decoded by sharp (format sniffed from content, not the filename),
// EXIF-rotated, stripped of metadata, resized and re-encoded to WebP.
import sharp, { type Metadata } from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff']);

export class ImageError extends Error {}

export interface Crop {
  x: number; // 0..1 fractions of the source image
  y: number;
  w: number;
  h: number;
}

export async function processProfilePicture(buf: Buffer, dir: string, baseName: string, crop?: Crop): Promise<string> {
  if (buf.length === 0) throw new ImageError('Empty file');
  if (buf.length > MAX_UPLOAD_BYTES) throw new ImageError('Image is too large (max 10 MB)');
  let meta: Metadata;
  try {
    meta = await sharp(buf, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new ImageError('That file is not a supported image');
  }
  if (!meta.format || !ALLOWED.has(meta.format)) throw new ImageError('Use a JPEG, PNG or WebP image');
  let img = sharp(buf, { limitInputPixels: 50_000_000, animated: false }).rotate();
  if (crop) {
    const { width, height } = await img.clone().toBuffer({ resolveWithObject: true }).then((r) => r.info);
    const left = Math.max(0, Math.min(width - 1, Math.round(crop.x * width)));
    const top = Math.max(0, Math.min(height - 1, Math.round(crop.y * height)));
    const w = Math.max(1, Math.min(width - left, Math.round(crop.w * width)));
    const h = Math.max(1, Math.min(height - top, Math.round(crop.h * height)));
    img = sharp(await img.toBuffer()).extract({ left, top, width: w, height: h });
  }
  fs.mkdirSync(dir, { recursive: true });
  const name = `${safeName(baseName)}-${crypto.randomBytes(6).toString('hex')}.webp`;
  await img.resize(512, 512, { fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toFile(path.join(dir, name));
  return name;
}

export async function processClueImage(buf: Buffer, dir: string): Promise<{ file: string; mime: string }> {
  if (buf.length > MAX_UPLOAD_BYTES * 3) throw new ImageError('Image is too large (max 30 MB)');
  let meta: Metadata;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    throw new ImageError('That file is not a supported image');
  }
  if (!meta.format || !ALLOWED.has(meta.format)) throw new ImageError('Unsupported image format');
  fs.mkdirSync(dir, { recursive: true });
  if (meta.format === 'gif' && (meta.pages ?? 1) > 1) {
    // keep animated GIFs as-is (validated by decoding above)
    const file = `${crypto.randomUUID()}.gif`;
    fs.writeFileSync(path.join(dir, file), buf);
    return { file, mime: 'image/gif' };
  }
  const file = `${crypto.randomUUID()}.webp`;
  await sharp(buf).rotate().resize(1920, 1080, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(dir, file));
  return { file, mime: 'image/webp' };
}

/** Audio/video are stored as-is after a magic-byte check. */
export function sniffMedia(buf: Buffer): { kind: 'audio' | 'video'; ext: string; mime: string } | null {
  const ascii = buf.subarray(0, 16).toString('latin1');
  if (ascii.startsWith('ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { kind: 'audio', ext: 'mp3', mime: 'audio/mpeg' };
  if (ascii.startsWith('OggS')) return { kind: 'audio', ext: 'ogg', mime: 'audio/ogg' };
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') return { kind: 'audio', ext: 'wav', mime: 'audio/wav' };
  if (ascii.slice(4, 8) === 'ftyp') {
    const brand = ascii.slice(8, 12);
    if (brand.startsWith('M4A')) return { kind: 'audio', ext: 'm4a', mime: 'audio/mp4' };
    return { kind: 'video', ext: 'mp4', mime: 'video/mp4' };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: 'video', ext: 'webm', mime: 'video/webm' };
  return null;
}

export function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'file';
}

/** Resolve a file inside a directory, rejecting path traversal. */
export function safeJoin(dir: string, file: string): string | null {
  if (!/^[a-zA-Z0-9_.-]+$/.test(file) || file.includes('..')) return null;
  const full = path.resolve(dir, file);
  return full.startsWith(path.resolve(dir) + path.sep) ? full : null;
}
