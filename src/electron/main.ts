// Electron main process: starts the local game server automatically, opens the
// desktop dashboard and the TV board window, and grants WebHID access to Joy-Cons.
// R14-11: a splash screen shows the start-up phases from the moment Electron is ready; the game
// server's code (Fastify, SQLite, sharp, the AI SDK…) is loaded only after it is on screen.
import { app, BrowserWindow, dialog, ipcMain, safeStorage, screen, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { RunningServer } from '../server/app.js';
import { openSplash, type Splash } from './splash.js';
import { applyPendingMove, checkAvailable, hasGameData, readBootstrap, samePath, writeBootstrap } from '../server/dataLocation.js';

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

/**
 * R17-15: the bootstrap file (outside the data folder) with the chosen data folder and a pending
 * move — %APPDATA%\OfflineJeopardy\config.json for the installed and the portable app alike, so a
 * newer portable exe finds data the host moved.
 */
const bootstrapFile = () => path.join(app.getPath('userData'), 'config.json');
/** Data lives in %APPDATA%/OfflineJeopardy/data, or next to the portable .exe, unless the host chose a folder. */
function defaultDataDir(): string {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) return path.join(portableDir, 'OfflineJeopardyData');
  return path.join(app.getPath('userData'), 'data');
}
/** The data folder in use (decided at start-up). */
let dataDirInUse = '';

/**
 * R17-15: a chosen data folder that is missing (a USB drive not plugged in, a network share offline)
 * or holds no game data: ask — never start an empty database there (or anywhere) silently.
 */
async function confirmDataDir(dir: string): Promise<string | null> {
  const def = defaultDataDir();
  for (;;) {
    const av = checkAvailable(dir, samePath(dir, def));
    if (av.ok) return dir;
    const missing = av.reason === 'missing';
    const buttons = missing ? ['Try again', 'Choose another folder…', 'Use the default folder this time', 'Quit'] : ['Start with new game data there', 'Choose another folder…', 'Use the default folder this time', 'Quit'];
    const r = await dialog.showMessageBox({
      type: 'warning',
      title: 'OfflineJeopardy — game data folder',
      message: missing ? 'The game data folder is not available.' : 'There is no game data in the chosen folder.',
      detail: `${dir}\n\n${missing ? 'Is the drive plugged in, or the network folder reachable? Plug it in and try again, or choose what to do.' : 'Players, boards and history were not found there. Start with new, empty game data in this folder only if that is what you want.'}\n\nDefault folder: ${def}`,
      buttons,
      defaultId: 0,
      cancelId: 3,
      noLink: true,
    });
    log('Data folder not available', dir, av.reason, '→', buttons[r.response]);
    if (r.response === 0) {
      if (!missing) return dir;
      continue;
    }
    if (r.response === 1) {
      const pick = await dialog.showOpenDialog({ title: 'Choose the folder with your OfflineJeopardy game data', defaultPath: fs.existsSync(dir) ? dir : path.dirname(def), properties: ['openDirectory'] });
      const chosen = pick.filePaths[0];
      if (pick.canceled || !chosen) continue;
      const found = hasGameData(chosen) ? chosen : hasGameData(path.join(chosen, 'OfflineJeopardyData')) ? path.join(chosen, 'OfflineJeopardyData') : null;
      if (!found) {
        await dialog.showMessageBox({ type: 'info', message: 'No OfflineJeopardy game data in that folder.', detail: chosen, buttons: ['OK'] });
        continue;
      }
      const b = readBootstrap(bootstrapFile());
      writeBootstrap(bootstrapFile(), { ...b, dataDir: samePath(found, def) ? undefined : found });
      return found;
    }
    if (r.response === 2) return def; // this start only: the bootstrap file keeps the chosen folder
    return null;
  }
}

/** Restarts the app — for the portable exe the exe itself (its unpacked copy may be gone after exit). */
function relaunchApp() {
  const portable = process.env.PORTABLE_EXECUTABLE_FILE;
  app.relaunch(portable ? { execPath: portable, args: [] } : undefined);
  app.quit();
}

/** What the splash says for each phase the server reports (R14-11). */
const STAGE_TEXT = { data: 'Loading saved data…', services: 'Preparing game services…', network: 'Starting local server…' } as const;

async function boot() {
  const t0 = Date.now();
  const splash = openSplash(app.getVersion());
  logFile = path.join(app.getPath('userData'), 'startup.log');
  // R17-15: a move the host asked for happens now, before anything opens the database.
  const moved = await applyPendingMove(bootstrapFile(), defaultDataDir(), log, (s) => splash.status(s));
  const dataDir = await confirmDataDir(moved);
  if (!dataDir) {
    splash.close();
    app.quit();
    return;
  }
  dataDirInUse = dataDir;
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });
  logFile = path.join(dataDir, 'logs', 'main.log');
  log('Starting OfflineJeopardy', app.getVersion(), 'data:', dataDir);

  const webDir = path.join(app.getAppPath(), 'dist', 'web');
  let lastErr: unknown;
  try {
    splash.status('Loading the game…');
    const { startServer } = await import('../server/app.js');
    log('Server code loaded in', Date.now() - t0, 'ms');
    for (let port = 3000; port <= 3010; port++) {
      try {
        // Developer tools (R7-31) only when not packaged, or on request (OJ_DEV_TOOLS=1).
        server = await startServer({
          dataDir,
          port,
          host: '0.0.0.0',
          webDir,
          secretCodec: secretCodec(),
          soundPackDirs: soundPackDirs(dataDir),
          devTools: !app.isPackaged || process.env.OJ_DEV_TOOLS === '1',
          onStage: (s) => splash.status(STAGE_TEXT[s]),
          storage: {
            bootstrapFile: bootstrapFile(),
            defaultDir: defaultDataDir(),
            portable: !!process.env.PORTABLE_EXECUTABLE_DIR,
            pickFolder: async (start) => {
              const opts = { title: 'Choose where OfflineJeopardy keeps its game data', defaultPath: start, properties: ['openDirectory', 'createDirectory', 'promptToCreate'] as ('openDirectory' | 'createDirectory' | 'promptToCreate')[] };
              const win = mainWin && !mainWin.isDestroyed() ? mainWin : null;
              win?.show();
              win?.focus();
              const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
              return r.canceled ? null : (r.filePaths[0] ?? null);
            },
            openFolder: async (dir) => {
              await shell.openPath(dir);
            },
            relaunch: relaunchApp,
          },
        });
        break;
      } catch (e) {
        lastErr = e;
        if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') break;
      }
    }
  } catch (e) {
    lastErr = e;
  }
  if (!server) {
    log('Server failed to start', lastErr);
    // The splash says so instead of loading forever; the dialog has the details.
    splash.status('OfflineJeopardy could not start.', true);
    dialog.showErrorBox('OfflineJeopardy could not start', `The local game server failed to start.\n\n${String(lastErr)}\n\nLog: ${logFile}`);
    splash.close();
    app.quit();
    return;
  }
  log('Server listening on port', server.port, 'after', Date.now() - t0, 'ms');

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

  splash.status('Opening the host interface…');
  createMainWindow(splash, t0);
}

function createMainWindow(splash?: Splash, t0 = Date.now()) {
  mainWin = new BrowserWindow({
    // R14-11: shown once it has painted (the splash covers the wait), never left hidden.
    show: !splash,
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
      additionalArguments: [`--oj-data-dir=${dataDirInUse || defaultDataDir()}`, `--oj-version=${app.getVersion()}`],
    },
  });
  void mainWin.loadURL(`${server!.url}/desk`);
  lockNavigation(mainWin);
  if (splash) {
    const win = mainWin;
    let shown = false;
    const reveal = (why: string) => {
      if (shown || win.isDestroyed()) return;
      shown = true;
      win.show();
      splash.close();
      log('Main window shown (' + why + ') after', Date.now() - t0, 'ms');
    };
    win.once('ready-to-show', () => reveal('ready'));
    setTimeout(() => reveal('timeout'), 20_000);
  }
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
      additionalArguments: [`--oj-data-dir=${dataDirInUse || defaultDataDir()}`, `--oj-version=${app.getVersion()}`],
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
ipcMain.handle('oj:openDataFolder', () => shell.openPath(dataDirInUse || defaultDataDir()));
ipcMain.handle('oj:relaunch', () => relaunchApp());

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
    const { startServer } = await import('../server/app.js');
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

// Side-by-side runs (tests, development next to an installed copy): a separate profile, and with it
// a separate single-instance lock.
if (process.env.OJ_USER_DATA) app.setPath('userData', process.env.OJ_USER_DATA);

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
  // R17-15: quitting waits for the server to close the database (a restart that moves the data folder
  // then starts from a cleanly closed database), then quits for real.
  app.on('before-quit', (e) => {
    if (!server) return;
    e.preventDefault();
    const s = server;
    server = null;
    void s
      .close()
      .catch((err) => log('close error', err))
      .finally(() => app.quit());
  });
  process.on('uncaughtException', (e) => log('uncaughtException', e));
  process.on('unhandledRejection', (e) => log('unhandledRejection', e));
}
