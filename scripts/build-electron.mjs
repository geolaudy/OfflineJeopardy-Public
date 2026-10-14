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
