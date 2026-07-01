import { app, ipcMain } from "electron";
import { loadJson, saveJson } from "./persist";

/**
 * Session persistence (userData/session.json). Main is a dumb JSON store: it
 * writes whatever the renderer sends (debounced) and reads it back verbatim.
 * The renderer owns the layout schema and validates on load.
 */

const FILE = "session.json";
let pending: unknown = null;
let timer: NodeJS.Timeout | null = null;

function flush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending !== null) {
    saveJson(FILE, pending);
    pending = null;
  }
}

export function registerSession(): void {
  ipcMain.handle("session:load", () => loadJson<unknown>(FILE, null));

  ipcMain.on("session:save", (_e, data: unknown) => {
    pending = data;
    if (!timer) timer = setTimeout(flush, 500);
  });

  // make sure the last change survives a quit
  app.on("before-quit", flush);
}
