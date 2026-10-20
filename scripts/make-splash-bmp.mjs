// R14-11: the picture the portable exe's launcher shows while it unpacks the app (before Electron
// runs and can show its own splash). electron-builder's portable target needs a .bmp
// (package.json build.portable.splashImage); sharp cannot write BMP, so the pixels are rendered
// from an SVG by sharp and wrapped in a 24-bit BMP header here. Run: node scripts/make-splash-bmp.mjs
import sharp from 'sharp';
import fs from 'node:fs';

const W = 520;
const H = 300;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="75%">
      <stop offset="0" stop-color="#1a2bd8"/><stop offset="0.45" stop-color="#0a14b0"/><stop offset="1" stop-color="#030766"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g font-family="Impact, 'Arial Narrow Bold', 'Arial Black', sans-serif" text-anchor="middle">
    <text x="${W / 2 + 4}" y="104" font-size="28" letter-spacing="9" fill="#000">OFFLINE</text>
    <text x="${W / 2}" y="100" font-size="28" letter-spacing="9" fill="#fff">OFFLINE</text>
    <text x="${W / 2 + 4}" y="178" font-size="72" fill="#000">JEOPARDY!</text>
    <text x="${W / 2}" y="174" font-size="72" fill="#e9b24f">JEOPARDY!</text>
  </g>
  <text x="${W / 2}" y="232" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="600" fill="#e2e8ff" text-anchor="middle">Starting — unpacking the game…</text>
  <text x="${W / 2}" y="256" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#aab4f0" text-anchor="middle">The portable version does this each time it starts.</text>
</svg>`;

const { data, info } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const row = Math.ceil((info.width * 3) / 4) * 4;
const size = 54 + row * info.height;
const bmp = Buffer.alloc(size);
bmp.write('BM', 0);
bmp.writeUInt32LE(size, 2);
bmp.writeUInt32LE(54, 10);
bmp.writeUInt32LE(40, 14);
bmp.writeInt32LE(info.width, 18);
bmp.writeInt32LE(info.height, 22); // bottom-up rows
bmp.writeUInt16LE(1, 26);
bmp.writeUInt16LE(24, 28);
bmp.writeUInt32LE(row * info.height, 34);
for (let y = 0; y < info.height; y++)
  for (let x = 0; x < info.width; x++) {
    const s = (y * info.width + x) * 3;
    const d = 54 + (info.height - 1 - y) * row + x * 3;
    bmp[d] = data[s + 2];
    bmp[d + 1] = data[s + 1];
    bmp[d + 2] = data[s];
  }
fs.writeFileSync(new URL('../build/portable-splash.bmp', import.meta.url), bmp);
console.log(`build/portable-splash.bmp ${info.width}×${info.height}`);
