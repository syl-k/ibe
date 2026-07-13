import {
  app,
  BrowserWindow,
  Menu,
  WebContentsView,
  ipcMain,
  screen,
  shell,
  type WebContents,
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
import { attachBrowserContextMenu } from "./contextMenu";
import { registerWebPermissions } from "./permissions";
import { registerAdblock } from "./adblock";
import { loadExtensions, loadedExtensions } from "./extensions";
import { registerPasswords } from "./passwords";
import { buildAppMenu } from "./menu";

/**
 * Main process — owns one native WebContentsView per browser pane, keyed by the
 * renderer's pane id. The renderer owns the layout and tells us where each view
 * goes (setBounds) and whether it's on the active tab (setVisible).
 */

const views = new Map<string, WebContentsView>();
/** Views hidden via browser:setVisible (Electron 33 has no View.getVisible). */
const hiddenViews = new Set<string>();
let mainWindow: BrowserWindow | null = null;

/** The visible browser view under the mouse cursor (swipe-gesture target). */
function viewWebContentsAtCursor(): WebContents | null {
  if (!mainWindow) return null;
  const pt = screen.getCursorScreenPoint();
  const content = mainWindow.getContentBounds();
  const x = pt.x - content.x;
  const y = pt.y - content.y;
  for (const [id, view] of views) {
    if (hiddenViews.has(id)) continue;
    const b = view.getBounds();
    if (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height) {
      return view.webContents;
    }
  }
  return null;
}

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

  // Three-finger discrete swipe (macOS "swipe between pages" set to two/three
  // fingers). The default two-finger continuous swipe never fires this event —
  // it's detected as wheel overscroll by the gesture preload in each view.
  mainWindow.on("swipe", (_e, direction) => {
    const wc = viewWebContentsAtCursor();
    if (!wc) return;
    if (direction === "left") wc.navigationHistory.goBack();
    else if (direction === "right") wc.navigationHistory.goForward();
  });

  mainWindow.on("closed", () => {
    // Browser views die with their window, but ptys stay alive: reopening the
    // window (macOS dock/⌘N) restores the layout and reattaches to them.
    for (const view of views.values()) view.webContents.close();
    views.clear();
    hiddenViews.clear();
    mainWindow = null;
  });
}

const favicons = new Map<string, string>();
/** Per-pane zoom factor, reapplied after each navigation (Electron resets it
 *  on cross-origin loads). Kept here so the renderer needn't re-send on nav. */
const zoomFactors = new Map<string, number>();

const clampZoom = (z: number): number =>
  Number.isFinite(z) ? Math.min(3, Math.max(0.3, z)) : 1;

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

ipcMain.on("browser:create", (_e, id: string, url: string, zoom?: number) => {
  if (!mainWindow || views.has(id)) return;
  if (typeof zoom === "number" && zoom !== 1) zoomFactors.set(id, clampZoom(zoom));

  const view = new WebContentsView({
    webPreferences: {
      // Gesture detection only (two-finger swipe / mouse side buttons);
      // runs sandboxed in an isolated world, invisible to page scripts.
      preload: join(__dirname, "../preload/gesture.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  views.set(id, view);
  mainWindow.contentView.addChildView(view);

  const wc = view.webContents;
  // apply the restored/initial zoom once the first document commits, then keep
  // reapplying so cross-origin navigations don't silently reset it to 100%
  const applyZoom = () => {
    const z = zoomFactors.get(id);
    if (z !== undefined) wc.setZoomFactor(z);
  };
  wc.on("did-navigate", () => {
    applyZoom();
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
  attachBrowserContextMenu(wc, id, () => mainWindow?.webContents ?? null);

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
  if (visible) hiddenViews.delete(id);
  else hiddenViews.add(id);
});

ipcMain.on("browser:setZoom", (_e, id: string, factor: number) => {
  const z = clampZoom(factor);
  zoomFactors.set(id, z);
  views.get(id)?.webContents.setZoomFactor(z);
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
// Swipe / mouse-button navigation reported by the gesture preload. Only honor
// senders that are actually one of our browser views.
ipcMain.on("gesture:navigate", (e, dir: "back" | "forward") => {
  for (const view of views.values()) {
    if (view.webContents !== e.sender) continue;
    if (dir === "back") e.sender.navigationHistory.goBack();
    else e.sender.navigationHistory.goForward();
    return;
  }
});

ipcMain.on("browser:reload", (_e, id: string) =>
  views.get(id)?.webContents.reload()
);
ipcMain.on("browser:hardReload", (_e, id: string) =>
  views.get(id)?.webContents.reloadIgnoringCache()
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
  hiddenViews.delete(id);
  favicons.delete(id);
  zoomFactors.delete(id);
});

registerSettings();
registerEditor(() => mainWindow?.webContents ?? null);
registerChromeBookmarks(() => mainWindow?.webContents ?? null);
registerPtyHandlers(() => mainWindow?.webContents ?? null);
registerBookmarks(() => mainWindow?.webContents ?? null);
registerHistory();
registerSession();
// map a browser view's WebContents back to its pane id (for save prompts)
registerPasswords((wc) => {
  for (const [id, view] of views) if (view.webContents === wc) return id;
  return null;
});

app.whenReady().then(async () => {
  registerWebPermissions(); // allow-listed origins may show desktop notifications
  registerAdblock(); // async; guards its own failures (offline -> unblocked)
  await loadExtensions(); // before menu build so they appear in it
  Menu.setApplicationMenu(
    buildAppMenu(() => mainWindow?.webContents ?? null, loadedExtensions())
  );
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => killAllPtys());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
