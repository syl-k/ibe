import {
  app,
  BrowserWindow,
  Menu,
  WebContentsView,
  ipcMain,
  shell,
} from "electron";
import { join } from "path";
import type { Bounds } from "../shared/ipc";
import { registerPtyHandlers, killAllPtys } from "./pty";
import { registerBookmarks } from "./bookmarks";
import { registerHistory, recordVisit } from "./history";
import { registerSession } from "./session";
import { registerSettings } from "./settings";
import { registerEditor } from "./editor";
import { registerChromeBookmarks } from "./chromeBookmarks";
import { registerWebPermissions } from "./permissions";
import { buildAppMenu } from "./menu";

/**
 * Main process — owns one native WebContentsView per browser pane, keyed by the
 * renderer's pane id. The renderer owns the layout and tells us where each view
 * goes (setBounds) and whether it's on the active tab (setVisible).
 */

const views = new Map<string, WebContentsView>();
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    backgroundColor: "#1e1e2e",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open target=_blank etc. in the system browser rather than a popup window
  // (pane-aware new-tab handling comes later).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    for (const view of views.values()) view.webContents.close();
    views.clear();
    killAllPtys();
    mainWindow = null;
  });
}

const favicons = new Map<string, string>();

function sendState(id: string): void {
  const view = views.get(id);
  if (!view || !mainWindow) return;
  const wc = view.webContents;
  mainWindow.webContents.send("browser:state", {
    id,
    url: wc.getURL(),
    title: wc.getTitle(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward(),
    loading: wc.isLoading(),
    favicon: favicons.get(id),
  });
}

ipcMain.on("browser:create", (_e, id: string, url: string) => {
  if (!mainWindow || views.has(id)) return;

  const view = new WebContentsView();
  views.set(id, view);
  mainWindow.contentView.addChildView(view);

  const wc = view.webContents;
  wc.on("did-navigate", () => {
    sendState(id);
    recordVisit(wc.getURL(), wc.getTitle());
  });
  wc.on("did-navigate-in-page", () => sendState(id));
  wc.on("page-title-updated", () => {
    sendState(id);
    recordVisit(wc.getURL(), wc.getTitle());
  });
  wc.on("did-start-loading", () => sendState(id));
  wc.on("did-stop-loading", () => sendState(id));
  wc.on("page-favicon-updated", (_e, icons) => {
    favicons.set(id, icons[0] ?? "");
    sendState(id);
  });
  // clicking into a web page should make it the focused pane, so pane-relative
  // shortcuts (reload / focus-address / split) act on the pane in use
  wc.on("focus", () => mainWindow?.webContents.send("browser:focus-pane", id));
  // Link/popup wanting a new window → ask the renderer to open it in a new pane.
  wc.setWindowOpenHandler(({ url: target }) => {
    mainWindow?.webContents.send("browser:open-new", { fromId: id, url: target });
    return { action: "deny" };
  });

  wc.loadURL(url).catch((err) =>
    console.error(`[browser:create] ${url}:`, err.message)
  );
});

ipcMain.on("browser:setBounds", (_e, id: string, b: Bounds) => {
  views.get(id)?.setBounds({
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.round(b.width),
    height: Math.round(b.height),
  });
});

ipcMain.on("browser:setVisible", (_e, id: string, visible: boolean) => {
  views.get(id)?.setVisible(visible);
});

ipcMain.on("browser:navigate", (_e, id: string, url: string) => {
  views
    .get(id)
    ?.webContents.loadURL(url)
    .catch((err) => console.error(`[browser:navigate] ${url}:`, err.message));
});

ipcMain.on("browser:goBack", (_e, id: string) =>
  views.get(id)?.webContents.navigationHistory.goBack()
);
ipcMain.on("browser:goForward", (_e, id: string) =>
  views.get(id)?.webContents.navigationHistory.goForward()
);
ipcMain.on("browser:reload", (_e, id: string) =>
  views.get(id)?.webContents.reload()
);
ipcMain.on("browser:stop", (_e, id: string) =>
  views.get(id)?.webContents.stop()
);

ipcMain.on("browser:destroy", (_e, id: string) => {
  const view = views.get(id);
  if (!view || !mainWindow) return;
  mainWindow.contentView.removeChildView(view);
  view.webContents.close();
  views.delete(id);
  favicons.delete(id);
});

registerSettings();
registerEditor(() => mainWindow?.webContents ?? null);
registerChromeBookmarks(() => mainWindow?.webContents ?? null);
registerPtyHandlers(() => mainWindow?.webContents ?? null);
registerBookmarks(() => mainWindow?.webContents ?? null);
registerHistory();
registerSession();

app.whenReady().then(() => {
  registerWebPermissions(); // allow-listed origins may show desktop notifications
  Menu.setApplicationMenu(buildAppMenu(() => mainWindow?.webContents ?? null));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
