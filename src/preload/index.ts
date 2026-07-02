import { contextBridge, ipcRenderer } from "electron";
import type {
  Bookmark,
  BookmarksApi,
  Bounds,
  BrowserState,
  HistoryApi,
  IbeApi,
  OpenNewRequest,
  SessionApi,
  Settings,
  SettingsApi,
  ShortcutAction,
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
  setVisibleSessions: (ids) => ipcRenderer.send("term:visible", ids),
};

const bookmarks: BookmarksApi = {
  list: () => ipcRenderer.invoke("bookmarks:list"),
  add: (entry) => ipcRenderer.invoke("bookmarks:add", entry),
  remove: (url) => ipcRenderer.invoke("bookmarks:remove", url),
  onChange: (cb) => {
    const listener = (_e: unknown, list: Bookmark[]) => cb(list);
    ipcRenderer.on("bookmarks:change", listener);
    return () => ipcRenderer.removeListener("bookmarks:change", listener);
  },
};

const history: HistoryApi = {
  search: (query, limit) => ipcRenderer.invoke("history:search", query, limit),
  recent: (limit) => ipcRenderer.invoke("history:recent", limit),
};

const session: SessionApi = {
  load: () => ipcRenderer.invoke("session:load"),
  save: (data) => ipcRenderer.send("session:save", data),
};

const settings: SettingsApi = {
  load: () => ipcRenderer.invoke("settings:load"),
  save: (s) => ipcRenderer.send("settings:save", s),
  onChange: (cb) => {
    const listener = (_e: unknown, s: Settings) => cb(s);
    ipcRenderer.on("settings:change", listener);
    return () => ipcRenderer.removeListener("settings:change", listener);
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
  onShortcut: (cb) => {
    const listener = (_e: unknown, action: ShortcutAction) => cb(action);
    ipcRenderer.on("shortcut", listener);
    return () => ipcRenderer.removeListener("shortcut", listener);
  },
  onFocusPane: (cb) => {
    const listener = (_e: unknown, paneId: string) => cb(paneId);
    ipcRenderer.on("browser:focus-pane", listener);
    return () => ipcRenderer.removeListener("browser:focus-pane", listener);
  },
  onNotifyActivate: (cb) => {
    const listener = (_e: unknown, sessionId: string) => cb(sessionId);
    ipcRenderer.on("notify:activate", listener);
    return () => ipcRenderer.removeListener("notify:activate", listener);
  },
  term,
  bookmarks,
  history,
  session,
  settings,
};

contextBridge.exposeInMainWorld("ibe", api);
