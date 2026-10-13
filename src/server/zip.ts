// Minimal, dependency-free ZIP writer/reader for board packages and full backups.
// Supports the two methods every ZIP tool produces (0 = stored, 8 = deflate), validates CRCs,
// and refuses anything unsafe: path traversal, absolute paths, encryption, ZIP64, too many
// entries or too much uncompressed data (zip bombs).
import zlib from 'node:zlib';

export interface ZipEntry {
  name: string;
  data: Buffer;
}

export class ZipError extends Error {}

// Already-compressed formats gain nothing from deflate.
const STORE_EXT = /\.(webp|png|jpe?g|gif|mp3|m4a|ogg|mp4|webm|zip)$/i;

function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export function createZip(entries: ZipEntry[], now = new Date()): Buffer {
  const { time, date } = dosDateTime(now);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(normalizeName(e.name), 'utf8');
    const crc = zlib.crc32(e.data) >>> 0;
    const deflate = !STORE_EXT.test(e.name) && e.data.length > 64;
    const body = deflate ? zlib.deflateRawSync(e.data) : e.data;
    const method = deflate && body.length < e.data.length ? 8 : 0;
    const payload = method === 8 ? body : e.data;
    if (payload.length >= 0xffffffff || e.data.length >= 0xffffffff || offset >= 0xffffffff) throw new ZipError('Archive too large');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0x0800, 6); // UTF-8 names
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, name, payload);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4); // version made by
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += lh.length + name.length + payload.length;
  }
  if (entries.length > 0xffff) throw new ZipError('Too many files');
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Normalises an entry name and rejects anything that could escape the extraction folder. */
export function normalizeName(name: string): string {
  const n = name.replace(/\\/g, '/');
  if (!n || n.startsWith('/') || /^[a-z]:/i.test(n) || n.split('/').some((p) => p === '..' || p === '') || n.includes('\0')) throw new ZipError(`Unsafe file name in archive: ${name.slice(0, 80)}`);
  return n;
}

export function isZip(buf: Buffer) {
  return buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50;
}

export function readZip(buf: Buffer, limits: { maxEntries: number; maxTotalBytes: number }): ZipEntry[] {
  // End-of-central-directory record: last 22 bytes + up to 64 KiB comment.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('Not a ZIP file');
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipError('ZIP64 archives are not supported');
  if (count > limits.maxEntries) throw new ZipError(`Too many files in the archive (max ${limits.maxEntries})`);
  if (cdOffset + cdSize > buf.length) throw new ZipError('Damaged ZIP file');
  const out: ZipEntry[] = [];
  let total = 0;
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError('Damaged ZIP file');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const rawName = buf.subarray(p + 46, p + 46 + nlen).toString(flags & 0x0800 ? 'utf8' : 'latin1');
    p += 46 + nlen + xlen + clen;
    if (rawName.endsWith('/')) continue; // directory entry
    const name = normalizeName(rawName);
    if (flags & 0x1) throw new ZipError('Encrypted archives are not supported');
    if (csize === 0xffffffff || usize === 0xffffffff) throw new ZipError('ZIP64 archives are not supported');
    total += usize;
    if (total > limits.maxTotalBytes) throw new ZipError('The archive is too large once unpacked');
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== 0x04034b50) throw new ZipError('Damaged ZIP file');
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const comp = buf.subarray(start, start + csize);
    if (comp.length !== csize) throw new ZipError('Damaged ZIP file');
    let data: Buffer;
    if (method === 0) data = Buffer.from(comp);
    else if (method === 8) data = zlib.inflateRawSync(comp, { maxOutputLength: Math.max(1, usize) });
    else throw new ZipError(`Unsupported compression in archive (method ${method})`);
    if (data.length !== usize || (zlib.crc32(data) >>> 0) !== crc) throw new ZipError(`Damaged file in archive: ${name}`);
    out.push({ name, data });
  }
  return out;
}
