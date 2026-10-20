// R14-11: the start-up splash of the Windows app — shown as soon as Electron is ready, before the
// game server's code is even loaded: the stylised name, what is happening right now (the real
// start-up phases, reported by main.ts and the server) and an indeterminate loading bar (the phases
// take very different times on different PCs, so no invented percentage). It fades out once the
// main window has painted, shows an error instead of hanging when the start fails, and is a plain
// self-contained page (no network, no preload, no Node access).
import { BrowserWindow } from 'electron';
import { splashPage } from './splashPage.js';

export interface Splash {
  status(text: string, failed?: boolean): void;
  /** Fades out, then closes (safe to call more than once). */
  close(): void;
}

export function openSplash(version: string): Splash {
  const win = new BrowserWindow({
    width: 560,
    height: 340,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    center: true,
    show: false,
    title: 'OfflineJeopardy',
    backgroundColor: '#0a14b0',
    webPreferences: { sandbox: true, contextIsolation: true, javascript: true, devTools: false },
  });
  let latest: [string, boolean] = ['Initializing application…', false];
  let loaded = false;
  let closed = false;
  const apply = () => {
    if (!loaded || win.isDestroyed()) return;
    void win.webContents.executeJavaScript(`setStatus(${JSON.stringify(latest[0])}, ${latest[1]})`).catch(() => undefined);
  };
  win.webContents.once('did-finish-load', () => {
    loaded = true;
    apply();
  });
  win.once('ready-to-show', () => !closed && win.show());
  win.on('closed', () => (closed = true));
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashPage(version))}`);
  return {
    status(text, failed = false) {
      latest = [text, failed];
      apply();
    },
    close() {
      if (closed || win.isDestroyed()) return;
      closed = true;
      const done = () => !win.isDestroyed() && win.destroy();
      if (!loaded || !win.isVisible()) return done();
      void win.webContents.executeJavaScript('fadeOut()').catch(() => undefined);
      setTimeout(done, 260);
    },
  };
}
