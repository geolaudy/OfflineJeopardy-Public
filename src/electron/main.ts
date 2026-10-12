// Electron main process: starts the local game server automatically, opens the
// desktop dashboard and the TV board window, and grants WebHID access to Joy-Cons.
import { app, BrowserWindow, dialog, ipcMain, screen, session, shell } from 'electron';
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
      server = await startServer({ dataDir, port, host: '0.0.0.0', webDir });
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

if (!app.requestSingleInstanceLock()) {
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
