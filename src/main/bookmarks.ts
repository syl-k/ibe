import { ipcMain, type WebContents } from "electron";
import { loadJson, saveJson } from "./persist";
import type { Bookmark } from "../shared/ipc";

/** Persisted bookmark list, owned by main (userData/bookmarks.json). */

const FILE = "bookmarks.json";
let bookmarks: Bookmark[] = [];

export function registerBookmarks(getWebContents: () => WebContents | null): void {
  bookmarks = loadJson<Bookmark[]>(FILE, []);

  const broadcast = () => {
    const wc = getWebContents();
    if (wc && !wc.isDestroyed()) wc.send("bookmarks:change", bookmarks);
  };

  ipcMain.handle("bookmarks:list", () => bookmarks);

  ipcMain.handle(
    "bookmarks:add",
    (_e, entry: { url: string; title: string; favicon?: string }) => {
      if (!entry.url || bookmarks.some((b) => b.url === entry.url)) return;
      bookmarks = [{ ...entry, ts: Date.now() }, ...bookmarks];
      saveJson(FILE, bookmarks);
      broadcast();
    }
  );

  ipcMain.handle("bookmarks:remove", (_e, url: string) => {
    bookmarks = bookmarks.filter((b) => b.url !== url);
    saveJson(FILE, bookmarks);
    broadcast();
  });
}
