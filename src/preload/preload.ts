import { contextBridge, ipcRenderer } from "electron";

/**
 * M0 prototype — preload.
 *
 * Exposes a minimal, least-privilege bridge (`window.ibe`) to the renderer.
 * No Node / pty access is surfaced here yet; this is the browser-overlay slice.
 */

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BrowserState {
  id: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

const api = {
  createBrowser: (id: string, url: string): Promise<void> =>
    ipcRenderer.invoke("browser:create", id, url),
  setBounds: (id: string, b: Bounds): Promise<void> =>
    ipcRenderer.invoke("browser:setBounds", id, b),
  navigate: (id: string, url: string): Promise<void> =>
    ipcRenderer.invoke("browser:navigate", id, url),
  goBack: (id: string): Promise<void> => ipcRenderer.invoke("browser:goBack", id),
  goForward: (id: string): Promise<void> =>
    ipcRenderer.invoke("browser:goForward", id),
  reload: (id: string): Promise<void> => ipcRenderer.invoke("browser:reload", id),
  destroy: (id: string): Promise<void> =>
    ipcRenderer.invoke("browser:destroy", id),
  onState: (cb: (state: BrowserState) => void): void => {
    ipcRenderer.on("browser:state", (_e, state: BrowserState) => cb(state));
  },
};

contextBridge.exposeInMainWorld("ibe", api);
