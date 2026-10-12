// Builds build/icon.ico (PNG-compressed entries) from build/icon.png using sharp.
import sharp from 'sharp';
import fs from 'node:fs';

const sizes = [256, 128, 64, 48, 32, 24, 16];
const pngs = await Promise.all(sizes.map((s) => sharp('build/icon.png').resize(s, s).png().toBuffer()));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0);
  e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
fs.writeFileSync('build/icon.ico', Buffer.concat([header, ...dir, ...pngs]));
console.log('build/icon.ico written');
