// Standalone server entry (development, tests, headless hosting).
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './app.js';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const dataDir = args.get('data') ?? process.env.OJ_DATA_DIR ?? path.resolve('data');
const port = Number(args.get('port') ?? process.env.OJ_PORT ?? 3000);
const webDir = args.get('web') ?? path.resolve('dist/web');
if (args.has('fresh')) fs.rmSync(dataDir, { recursive: true, force: true }); // tests: start from an empty database

// --sfx=<folder>: the owner's Jeopardy!/Buzzinga sound files (e.g. new_sfx) for development (R4-1).
const soundPackDirs = args.get('sfx') ? [path.resolve(args.get('sfx')!)] : [];
// --dev-tools: developer diagnostics and the buzzer fairness test (R7-31).
const devTools = args.has('dev-tools') || process.env.OJ_DEV_TOOLS === '1';
const server = await startServer({ dataDir, port, webDir, logger: args.has('verbose'), soundPackDirs, devTools });
console.log(`OfflineJeopardy server on ${server.url} (data: ${dataDir})`);
console.log(`Host pairing code: ${server.pairingCode}`);
const stop = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
