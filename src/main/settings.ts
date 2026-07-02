import { BrowserWindow, ipcMain } from "electron";
import { loadJson, saveJson } from "./persist";
import type { Settings } from "../shared/ipc";

/**
 * User preferences (userData/settings.json). Main owns them so the pty layer can
 * read the shell choice synchronously at spawn time; the renderer edits a full
 * Settings object and we validate, persist and broadcast it back.
 */

const FILE = "settings.json";

export const DEFAULT_SETTINGS: Settings = {
  theme: "mocha",
  terminalFontFamily: '"SF Mono", Menlo, monospace',
  terminalFontSize: 12,
  shell: "",
  notifyOnBell: true,
};

let current: Settings = DEFAULT_SETTINGS;

/** Coerce untrusted input (disk or IPC) into a valid Settings, field by field. */
function coerce(raw: unknown): Settings {
  const r = (raw ?? {}) as Partial<Settings>;
  const size = Number(r.terminalFontSize);
  return {
    theme: r.theme === "latte" ? "latte" : "mocha",
    terminalFontFamily:
      typeof r.terminalFontFamily === "string" && r.terminalFontFamily.trim()
        ? r.terminalFontFamily
        : DEFAULT_SETTINGS.terminalFontFamily,
    terminalFontSize:
      Number.isFinite(size) && size >= 6 && size <= 32
        ? Math.round(size)
        : DEFAULT_SETTINGS.terminalFontSize,
    shell: typeof r.shell === "string" ? r.shell : "",
    notifyOnBell:
      typeof r.notifyOnBell === "boolean"
        ? r.notifyOnBell
        : DEFAULT_SETTINGS.notifyOnBell,
  };
}

/** Current settings; read synchronously by the pty layer. */
export function getSettings(): Settings {
  return current;
}

export function registerSettings(): void {
  current = coerce(loadJson<unknown>(FILE, null));

  ipcMain.handle("settings:load", () => current);

  ipcMain.on("settings:save", (e, raw: unknown) => {
    current = coerce(raw);
    saveJson(FILE, current);
    // Notify OTHER windows only — echoing back to the sender would race the
    // controlled inputs it's editing and could drop in-flight keystrokes.
    for (const win of BrowserWindow.getAllWindows()) {
      const wc = win.webContents;
      if (wc !== e.sender && !wc.isDestroyed()) wc.send("settings:change", current);
    }
  });
}
