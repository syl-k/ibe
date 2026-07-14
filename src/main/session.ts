import { app, ipcMain } from "electron";
import { backupJson, loadJson, saveJson } from "./persist";

/**
 * Session persistence (userData/session.json). Main is a dumb JSON store: it
 * writes whatever the renderer sends (debounced) and reads it back verbatim.
 * The renderer owns the layout schema and validates on load.
 *
 * Loss guards: the first write of a run snapshots the previous run's file to
 * session.json.bak (loadJson falls back to it if the primary is corrupt), and
 * a payload the renderer failed to restore is quarantined to
 * session.rejected.json instead of being silently overwritten by defaults.
 */

const FILE = "session.json";
let pending: unknown = null;
let timer: NodeJS.Timeout | null = null;
let backedUp = false;

function flush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending !== null) {
    if (!backedUp) {
      backedUp = true;
      backupJson(FILE); // preserve the previous run's final state
    }
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

  // the renderer loaded this payload but couldn't restore it — keep it for
  // inspection/recovery rather than letting the default layout clobber it
  ipcMain.on("session:quarantine", (_e, data: unknown) => {
    console.error("[session] restore rejected — saved to session.rejected.json");
    saveJson("session.rejected.json", data);
  });

  // make sure the last change survives a quit
  app.on("before-quit", flush);
}
