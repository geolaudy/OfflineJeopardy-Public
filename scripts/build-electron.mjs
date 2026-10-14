// Bundles the Electron main process (with the embedded server) and the preload script.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const common = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  sourcemap: true,
  packages: 'external', // node_modules are shipped by electron-builder (sharp is native)
  logLevel: 'info',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
};

await build({ ...common, entryPoints: ['src/electron/main.ts'], outfile: 'dist/electron/main.cjs', external: ['electron'] });
await build({ ...common, entryPoints: ['src/electron/preload.cts'], outfile: 'dist/electron/preload.cjs', external: ['electron'] });

// Personal sound pack (R4-1): copy the owner's audio from new_sfx/ (git-ignored) into
// build/private-sfx/, which electron-builder ships as resources/soundpacks/buzzinga. The folder is
// always created, so a checkout without new_sfx (the public release build) packages it empty.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
const sfxOut = new URL('../build/private-sfx/', import.meta.url);
rmSync(sfxOut, { recursive: true, force: true });
mkdirSync(sfxOut, { recursive: true });
const sfxIn = new URL('../new_sfx/', import.meta.url);
const audio = existsSync(sfxIn) ? readdirSync(sfxIn).filter((f) => /\.(mp3|wav|ogg|m4a)$/i.test(f)) : [];
for (const f of audio) copyFileSync(new URL(encodeURIComponent(f), sfxIn), new URL(encodeURIComponent(f), sfxOut));
console.log(audio.length ? `Personal sound pack: ${audio.length} files from new_sfx (local build — personal use only)` : 'Personal sound pack: none (public build)');
