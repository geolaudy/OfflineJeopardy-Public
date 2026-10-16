// Electron main process: starts the local game server automatically, opens the
// desktop dashboard and the TV board window, and grants WebHID access to Joy-Cons.
import { app, BrowserWindow, dialog, ipcMain, safeStorage, screen, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, type RunningServer } from '../server/app.js';

const NINTENDO_VENDOR = 0x057e;
let server: RunningServer | null = null;
let mainWin: BrowserWindow | null = null;
let boardWin: BrowserWindow | null = null;
let logFile = '';

function log(...args: unknown[]) {
  const line = `[${new Date().toISOString()}] ${args.map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch {
    /* ignore */
  }
}

/** Saved secrets (the optional AI key) are encrypted for this Windows user with DPAPI. */
function secretCodec() {
  if (!safeStorage.isEncryptionAvailable()) return null;
  return { encrypt: (s: string) => safeStorage.encryptString(s), decrypt: (b: Buffer) => safeStorage.decryptString(b) };
}

/**
 * Jeopardy!/Buzzinga sound files (R4-1, R5-9): a personal build carries them in
 * resources/soundpacks; in development they come from new_sfx/. Public releases contain neither
 * (the recordings are not ours to redistribute; the folder is git-ignored, so the release
 * workflow never has it). Any build also picks up a "Sounds" (or "new_sfx") folder placed next to
 * OfflineJeopardy.exe — for the portable exe, next to the .exe file itself — and inside the data
 * folder, so the owner's files work without choosing them one by one.
 */
function soundPackDirs(dataDir: string): string[] {
  const names = ['Sounds', 'new_sfx', 'OfflineJeopardy Sounds'];
  const beside = [process.env.PORTABLE_EXECUTABLE_DIR, path.dirname(process.execPath), dataDir].filter((d): d is string => !!d);
  const found = beside.flatMap((d) => names.map((n) => path.join(d, n)));
  return app.isPackaged ? [path.join(process.resourcesPath, 'soundpacks', 'buzzinga'), ...found] : [path.join(app.getAppPath(), 'new_sfx'), ...found];
}

/** Data lives in %APPDATA%/OfflineJeopardy/data, or next to the portable .exe. */
function resolveDataDir(): string {
  const cfgFile = path.join(app.getPath('userData'), 'config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')) as { dataDir?: string };
    if (cfg.dataDir) return cfg.dataDir;
  } catch {
    /* no config */
  }
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) return path.join(portableDir, 'OfflineJeopardyData');
  return path.join(app.getPath('userData'), 'data');
}

async function boot() {
  const dataDir = resolveDataDir();
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });
  logFile = path.join(dataDir, 'logs', 'main.log');
  log('Starting OfflineJeopardy', app.getVersion(), 'data:', dataDir);

  const webDir = path.join(app.getAppPath(), 'dist', 'web');
  let lastErr: unknown;
  for (let port = 3000; port <= 3010; port++) {
    try {
      server = await startServer({ dataDir, port, host: '0.0.0.0', webDir, secretCodec: secretCodec(), soundPackDirs: soundPackDirs(dataDir) });
      break;
    } catch (e) {
      lastErr = e;
      if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') break;
    }
  }
  if (!server) {
    log('Server failed to start', lastErr);
    dialog.showErrorBox('OfflineJeopardy could not start', `The local game server failed to start.\n\n${String(lastErr)}\n\nLog: ${logFile}`);
    app.quit();
    return;
  }
  log('Server listening on port', server.port);

  // ---- WebHID permissions for Nintendo controllers (Joy-Con L/R, Pro Controller) ----
  const ses = session.defaultSession;
  const ourOrigin = `http://127.0.0.1:${server.port}`;
  ses.setPermissionCheckHandler((_wc, permission, origin) => {
    if (permission === 'hid') return origin.startsWith(ourOrigin);
    return true;
  });
  ses.setDevicePermissionHandler((details) => {
    if (details.deviceType !== 'hid') return false;
    const dev = details.device as unknown as { vendorId?: number };
    return details.origin.startsWith(ourOrigin) && dev.vendorId === NINTENDO_VENDOR;
  });
  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const dev = details.deviceList.find((d) => d.vendorId === NINTENDO_VENDOR);
    callback(dev?.deviceId);
  });

  createMainWindow();
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: 'OfflineJeopardy',
    backgroundColor: '#f4f6fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false, // keep reading controllers when the TV window has focus
      additionalArguments: [`--oj-data-dir=${resolveDataDir()}`, `--oj-version=${app.getVersion()}`],
    },
  });
  void mainWin.loadURL(`${server!.url}/desk`);
  lockNavigation(mainWin);
  mainWin.on('closed', () => {
    mainWin = null;
    app.quit();
  });
}

function lockNavigation(win: BrowserWindow) {
  // Only our local server may be shown; anything else opens in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(server!.url)) {
      if (url.includes('/board')) {
        openBoardWindow({});
        return { action: 'deny' };
      }
      return { action: 'allow' };
    }
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(server!.url)) e.preventDefault();
  });
}

function openBoardWindow(opts: { displayId?: number; fullscreen?: boolean }) {
  const displays = screen.getAllDisplays();
  const target = displays.find((d) => d.id === opts.displayId) ?? displays.find((d) => d.id !== screen.getPrimaryDisplay().id) ?? screen.getPrimaryDisplay();
  if (boardWin && !boardWin.isDestroyed()) {
    boardWin.setFullScreen(false);
    boardWin.setBounds(target.bounds);
    if (opts.fullscreen !== false) boardWin.setFullScreen(true);
    boardWin.focus();
    return;
  }
  boardWin = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    title: 'OfflineJeopardy — Game board',
    backgroundColor: '#060ce9',
    autoHideMenuBar: true,
    fullscreen: opts.fullscreen !== false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      // The host starts clue audio/video from the iPad; nobody clicks on the TV.
      autoplayPolicy: 'no-user-gesture-required',
      additionalArguments: [`--oj-data-dir=${resolveDataDir()}`, `--oj-version=${app.getVersion()}`],
    },
  });
  void boardWin.loadURL(`${server!.url}/board`);
  lockNavigation(boardWin);
  boardWin.on('closed', () => (boardWin = null));
}

ipcMain.handle('oj:openBoard', (_e, opts: { displayId?: number; fullscreen?: boolean }) => openBoardWindow(opts ?? {}));
ipcMain.handle('oj:closeBoard', () => boardWin?.close());
ipcMain.handle('oj:displays', () => {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `${d.label || `Screen ${i + 1}`} (${d.size.width}×${d.size.height})`,
    primary: d.id === primary,
    width: d.size.width,
    height: d.size.height,
  }));
});
ipcMain.handle('oj:openExternal', (_e, url: string) => (/^https?:\/\//.test(url) ? shell.openExternal(url) : undefined));
ipcMain.handle('oj:openDataFolder', () => shell.openPath(resolveDataDir()));
ipcMain.handle('oj:relaunch', () => {
  app.relaunch();
  app.quit();
});

/**
 * Packaged-build smoke test (`OfflineJeopardy.exe --smoke-test=<report.json>`): starts the embedded
 * server on a throwaway data folder, checks that the database, the native image library, the
 * bundled web app and the user guide are all found, writes a JSON report and exits. No windows.
 */
async function smokeTest(reportFile: string) {
  const report: Record<string, unknown> = { version: app.getVersion(), packaged: app.isPackaged, startedAt: new Date().toISOString() };
  let ok = false;
  const dataDir = fs.mkdtempSync(path.join(app.getPath('temp'), 'oj-smoke-'));
  try {
    const webDir = path.join(app.getAppPath(), 'dist', 'web');
    report.webIndex = fs.existsSync(path.join(webDir, 'index.html'));
    report.userGuide = fs.existsSync(path.join(process.resourcesPath, 'USER_GUIDE.md')) || !app.isPackaged;
    const s = await startServer({ dataDir, port: 0, host: '127.0.0.1', webDir, soundPackDirs: soundPackDirs(dataDir) });
    try {
      const info = (await (await fetch(`${s.url}/api/info`)).json()) as { version?: string };
      report.serverVersion = info.version ?? null;
      const page = await fetch(`${s.url}/board`);
      report.boardPage = page.ok && (await page.text()).includes('<div id="root"');
      const token = ((await (await fetch(`${s.url}/api/host/local-login`, { method: 'POST' })).json()) as { token: string }).token;
      const boards = (await (await fetch(`${s.url}/api/boards`, { headers: { authorization: `Bearer ${token}` } })).json()) as unknown[];
      report.sampleBoards = boards.length;
      // A tiny PNG through the clue-media pipeline proves sharp (native) loads from the package.
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      const fd = new FormData();
      fd.append('file', new Blob([png], { type: 'image/png' }), 'dot.png');
      const media = await fetch(`${s.url}/api/media?kind=image`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd });
      report.imagePipeline = media.ok;
      // R5-9: the sound cues this build serves (personal builds carry the owner's files), and one of them really plays.
      const files = ((await (await fetch(`${s.url}/api/settings/public`)).json()) as { packFiles?: Record<string, string> }).packFiles ?? {};
      report.soundCues = Object.keys(files).length;
      const first = Object.values(files)[0];
      report.soundServed = first ? (await fetch(`${s.url}${first}`)).ok : null;
    } finally {
      await s.close();
    }
    ok = report.serverVersion === app.getVersion() && report.webIndex === true && report.userGuide === true && report.boardPage === true && report.imagePipeline === true && Number(report.sampleBoards) > 0;
  } catch (e) {
    report.error = e instanceof Error ? e.stack : String(e);
  }
  report.ok = ok;
  try {
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  } catch {
    /* nowhere to report */
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
  app.exit(ok ? 0 : 1);
}

const smokeArg = process.argv.find((a) => a.startsWith('--smoke-test='));
if (smokeArg) {
  app.whenReady().then(() => smokeTest(smokeArg.slice('--smoke-test='.length)));
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
  });
  app.whenReady().then(boot);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    if (server) {
      const s = server;
      server = null;
      void s.close().catch((e) => log('close error', e));
    }
  });
  process.on('uncaughtException', (e) => log('uncaughtException', e));
  process.on('unhandledRejection', (e) => log('unhandledRejection', e));
}
