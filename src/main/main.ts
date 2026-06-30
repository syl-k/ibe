import { app, BrowserWindow, WebContentsView, ipcMain } from "electron";
import * as path from "path";

/**
 * M0 prototype — main process.
 *
 * Validates the hardest M0 risk: overlaying multiple `WebContentsView`s on top
 * of the renderer DOM and keeping their bounds synced with DOM placeholders
 * (split layout + resize).
 *
 * Each browser pane in the renderer maps to one WebContentsView here, keyed by a
 * string id. The renderer owns the layout; it tells us where each view goes via
 * `browser:setBounds` (coordinates are CSS/DIP pixels relative to the window's
 * content area, which is exactly what `view.setBounds` expects).
 */

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const views = new Map<string, WebContentsView>();
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#1e1e2e",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  mainWindow.on("closed", () => {
    for (const view of views.values()) {
      view.webContents.close();
    }
    views.clear();
    mainWindow = null;
  });
}

function sendState(id: string): void {
  const view = views.get(id);
  if (!view || !mainWindow) return;
  mainWindow.webContents.send("browser:state", {
    id,
    url: view.webContents.getURL(),
    title: view.webContents.getTitle(),
    canGoBack: view.webContents.navigationHistory.canGoBack(),
    canGoForward: view.webContents.navigationHistory.canGoForward(),
  });
}

ipcMain.handle("browser:create", (_e, id: string, url: string) => {
  if (!mainWindow || views.has(id)) return;

  const view = new WebContentsView();
  views.set(id, view);
  mainWindow.contentView.addChildView(view);

  const wc = view.webContents;
  wc.on("did-navigate", () => sendState(id));
  wc.on("did-navigate-in-page", () => sendState(id));
  wc.on("page-title-updated", () => sendState(id));

  wc.loadURL(url).catch((err) => {
    console.error(`[browser:create] failed to load ${url}:`, err.message);
  });
});

ipcMain.handle("browser:setBounds", (_e, id: string, b: Bounds) => {
  const view = views.get(id);
  if (!view) return;
  view.setBounds({
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.round(b.width),
    height: Math.round(b.height),
  });
});

ipcMain.handle("browser:navigate", (_e, id: string, url: string) => {
  const view = views.get(id);
  if (!view) return;
  view.webContents.loadURL(url).catch((err) => {
    console.error(`[browser:navigate] failed to load ${url}:`, err.message);
  });
});

ipcMain.handle("browser:goBack", (_e, id: string) => {
  views.get(id)?.webContents.navigationHistory.goBack();
});

ipcMain.handle("browser:goForward", (_e, id: string) => {
  views.get(id)?.webContents.navigationHistory.goForward();
});

ipcMain.handle("browser:reload", (_e, id: string) => {
  views.get(id)?.webContents.reload();
});

ipcMain.handle("browser:destroy", (_e, id: string) => {
  const view = views.get(id);
  if (!view || !mainWindow) return;
  mainWindow.contentView.removeChildView(view);
  view.webContents.close();
  views.delete(id);
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
