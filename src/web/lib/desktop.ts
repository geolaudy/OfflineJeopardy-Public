// Bridge to the Electron shell (exposed by src/electron/preload.cts). Absent in normal browsers.
export interface DesktopBridge {
  version: string;
  openBoardWindow(opts?: { displayId?: number; fullscreen?: boolean }): Promise<void>;
  closeBoardWindow(): Promise<void>;
  listDisplays(): Promise<{ id: number; label: string; primary: boolean; width: number; height: number }[]>;
  openExternal(url: string): Promise<void>;
  openDataFolder(): Promise<void>;
  relaunch(): Promise<void>;
  dataDir: string;
}

export function desktop(): DesktopBridge | null {
  return (window as unknown as { ojDesktop?: DesktopBridge }).ojDesktop ?? null;
}

export const isDesktopApp = () => !!desktop();
