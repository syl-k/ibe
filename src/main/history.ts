import { ipcMain } from "electron";
import { loadJson, saveJson } from "./persist";
import type { HistoryEntry } from "../shared/ipc";

/** Visited-page history, owned by main (userData/history.json). */

const FILE = "history.json";
const CAP = 3000; // entries kept on disk
let history: HistoryEntry[] = [];
let saveTimer: NodeJS.Timeout | null = null;

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveJson(FILE, history);
  }, 1000);
}

/** Record a visit. Coalesces repeat visits to the same url and refreshes title. */
export function recordVisit(url: string, title: string): void {
  if (!url || url === "about:blank" || url.startsWith("devtools://")) return;
  const i = history.findIndex((h) => h.url === url);
  if (i !== -1) history.splice(i, 1); // move to front, keep newest position
  history.unshift({ url, title: title || url, ts: Date.now() });
  if (history.length > CAP) history.length = CAP;
  scheduleSave();
}

export function registerHistory(): void {
  history = loadJson<HistoryEntry[]>(FILE, []);

  ipcMain.handle("history:search", (_e, query: string, limit = 8) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: HistoryEntry[] = [];
    for (const h of history) {
      if (h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q)) {
        out.push(h);
        if (out.length >= limit) break;
      }
    }
    return out;
  });

  ipcMain.handle("history:recent", (_e, limit = 20) => history.slice(0, limit));
}
