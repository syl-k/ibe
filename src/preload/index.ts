import { contextBridge, ipcRenderer } from "electron";
import type { Bounds, BrowserState, IbeApi } from "../shared/ipc";

/**
 * Least-privilege bridge. Only the browser-pane control surface is exposed; no
 * Node / pty access (that arrives in M2 behind its own narrow channel).
 */
const api: IbeApi = {
  createBrowser: (id, url) => ipcRenderer.send("browser:create", id, url),
  setBounds: (id, b: Bounds) => ipcRenderer.send("browser:setBounds", id, b),
  setVisible: (id, visible) => ipcRenderer.send("browser:setVisible", id, visible),
  navigate: (id, url) => ipcRenderer.send("browser:navigate", id, url),
  goBack: (id) => ipcRenderer.send("browser:goBack", id),
  goForward: (id) => ipcRenderer.send("browser:goForward", id),
  reload: (id) => ipcRenderer.send("browser:reload", id),
  destroy: (id) => ipcRenderer.send("browser:destroy", id),
  onState: (cb) => {
    const listener = (_e: unknown, state: BrowserState) => cb(state);
    ipcRenderer.on("browser:state", listener);
    return () => ipcRenderer.removeListener("browser:state", listener);
  },
};

contextBridge.exposeInMainWorld("ibe", api);
