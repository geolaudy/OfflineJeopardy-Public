// Standalone server entry (development, tests, headless hosting).
import path from 'node:path';
import { startServer } from './app.js';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const dataDir = args.get('data') ?? process.env.OJ_DATA_DIR ?? path.resolve('data');
const port = Number(args.get('port') ?? process.env.OJ_PORT ?? 3000);
const webDir = args.get('web') ?? path.resolve('dist/web');

const server = await startServer({ dataDir, port, webDir, logger: args.has('verbose') });
console.log(`OfflineJeopardy server on ${server.url} (data: ${dataDir})`);
console.log(`Host pairing code: ${server.pairingCode}`);
const stop = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
