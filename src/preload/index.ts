import { contextBridge, ipcRenderer } from "electron";
import type {
  Bounds,
  BrowserState,
  IbeApi,
  OpenNewRequest,
  TerminalApi,
} from "../shared/ipc";

/**
 * Least-privilege bridge. Exposes only the narrow browser-pane and terminal
 * control surfaces; no raw Node / pty handle reaches the renderer.
 */
const term: TerminalApi = {
  create: (id, cols, rows) => ipcRenderer.send("term:create", id, cols, rows),
  attach: (id) => ipcRenderer.send("term:attach", id),
  detach: (id) => ipcRenderer.send("term:detach", id),
  input: (id, data) => ipcRenderer.send("term:input", id, data),
  resize: (id, cols, rows) => ipcRenderer.send("term:resize", id, cols, rows),
  destroy: (id) => ipcRenderer.send("term:destroy", id),
  onData: (id, cb) => {
    const listener = (_e: unknown, p: { id: string; data: string }) => {
      if (p.id === id) cb(p.data);
    };
    ipcRenderer.on("term:data", listener);
    return () => ipcRenderer.removeListener("term:data", listener);
  },
  onExit: (id, cb) => {
    const listener = (_e: unknown, p: { id: string; exitCode: number }) => {
      if (p.id === id) cb(p.exitCode);
    };
    ipcRenderer.on("term:exit", listener);
    return () => ipcRenderer.removeListener("term:exit", listener);
  },
};

const api: IbeApi = {
  createBrowser: (id, url) => ipcRenderer.send("browser:create", id, url),
  setBounds: (id, b: Bounds) => ipcRenderer.send("browser:setBounds", id, b),
  setVisible: (id, visible) => ipcRenderer.send("browser:setVisible", id, visible),
  navigate: (id, url) => ipcRenderer.send("browser:navigate", id, url),
  goBack: (id) => ipcRenderer.send("browser:goBack", id),
  goForward: (id) => ipcRenderer.send("browser:goForward", id),
  reload: (id) => ipcRenderer.send("browser:reload", id),
  stop: (id) => ipcRenderer.send("browser:stop", id),
  destroy: (id) => ipcRenderer.send("browser:destroy", id),
  onState: (cb) => {
    const listener = (_e: unknown, state: BrowserState) => cb(state);
    ipcRenderer.on("browser:state", listener);
    return () => ipcRenderer.removeListener("browser:state", listener);
  },
  onOpenNew: (cb) => {
    const listener = (_e: unknown, req: OpenNewRequest) => cb(req);
    ipcRenderer.on("browser:open-new", listener);
    return () => ipcRenderer.removeListener("browser:open-new", listener);
  },
  term,
};

contextBridge.exposeInMainWorld("ibe", api);
