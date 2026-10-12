// Preload: exposes a minimal, explicit bridge to the renderer (context isolated).
import { contextBridge, ipcRenderer } from 'electron';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';

contextBridge.exposeInMainWorld('ojDesktop', {
  version: arg('oj-version'),
  dataDir: arg('oj-data-dir'),
  openBoardWindow: (opts?: { displayId?: number; fullscreen?: boolean }) => ipcRenderer.invoke('oj:openBoard', opts ?? {}),
  closeBoardWindow: () => ipcRenderer.invoke('oj:closeBoard'),
  listDisplays: () => ipcRenderer.invoke('oj:displays'),
  openExternal: (url: string) => ipcRenderer.invoke('oj:openExternal', url),
  openDataFolder: () => ipcRenderer.invoke('oj:openDataFolder'),
  relaunch: () => ipcRenderer.invoke('oj:relaunch'),
});
