import { BrowserWindow, dialog, ipcMain, type WebContents } from "electron";
import { promises as fs, watch, type FSWatcher, statSync } from "fs";
import { resolve } from "path";
import type { DirEntry, ReadFileResult, WriteFileResult } from "../shared/ipc";
import { isUnderRoots, looksBinary } from "./pathGuard";

/**
 * Filesystem surface for editor panes. Everything runs here in main (the
 * renderer is sandboxed) and is restricted to "allowed roots": folders the user
 * explicitly opened via the OS dialog (or re-registered from a restored
 * session). Reads are guarded against huge/binary files so the editor can't be
 * fed content it can't render.
 */

const MAX_FILE_BYTES = 2 * 1024 * 1024; // refuse to open files larger than this

const allowedRoots = new Set<string>();

function allowed(path: unknown): path is string {
  return typeof path === "string" && isUnderRoots(allowedRoots, path);
}

// ---- external-change watching (refcounted per path) ----

const watchers = new Map<string, { watcher: FSWatcher; count: number }>();

function watchPath(path: string, getWc: () => WebContents | null): void {
  const existing = watchers.get(path);
  if (existing) {
    existing.count += 1;
    return;
  }
  let watcher: FSWatcher;
  try {
    watcher = watch(path, () => {
      const wc = getWc();
      if (wc && !wc.isDestroyed()) wc.send("editor:file-changed", path);
    });
  } catch {
    return; // file vanished between open and watch — change events just won't fire
  }
  watchers.set(path, { watcher, count: 1 });
}

function unwatchPath(path: string): void {
  const entry = watchers.get(path);
  if (!entry) return;
  entry.count -= 1;
  if (entry.count <= 0) {
    entry.watcher.close();
    watchers.delete(path);
  }
}

export function registerEditor(getWebContents: () => WebContents | null): void {
  ipcMain.handle("editor:openFolderDialog", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const folder = result.filePaths[0];
    allowedRoots.add(resolve(folder));
    return folder;
  });

  // Restored sessions re-register their folders; only real directories qualify.
  ipcMain.handle("editor:registerRoot", (_e, path: unknown) => {
    if (typeof path !== "string") return false;
    try {
      if (!statSync(path).isDirectory()) return false;
    } catch {
      return false;
    }
    allowedRoots.add(resolve(path));
    return true;
  });

  ipcMain.handle("editor:readDir", async (_e, path: unknown): Promise<DirEntry[]> => {
    if (!allowed(path)) return [];
    try {
      const entries = await fs.readdir(path, { withFileTypes: true });
      return entries
        .filter((d) => d.isDirectory() || d.isFile())
        .map<DirEntry>((d) => ({ name: d.name, kind: d.isDirectory() ? "dir" : "file" }))
        .sort((a, b) =>
          a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name)
        );
    } catch {
      return [];
    }
  });

  ipcMain.handle("editor:readFile", async (_e, path: unknown): Promise<ReadFileResult> => {
    if (!allowed(path)) return { ok: false, error: "アクセスが許可されていないパスです" };
    try {
      const stat = await fs.stat(path);
      if (stat.size > MAX_FILE_BYTES) {
        return { ok: false, error: "ファイルが大きすぎます (2MB 超)" };
      }
      const buf = await fs.readFile(path);
      if (looksBinary(buf.subarray(0, 8192))) {
        return { ok: false, error: "バイナリファイルは表示できません" };
      }
      return { ok: true, content: buf.toString("utf8") };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(
    "editor:writeFile",
    async (_e, path: unknown, content: unknown): Promise<WriteFileResult> => {
      if (!allowed(path)) return { ok: false, error: "アクセスが許可されていないパスです" };
      if (typeof content !== "string") return { ok: false, error: "不正な内容です" };
      try {
        await fs.writeFile(path, content, "utf8");
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }
  );

  ipcMain.on("editor:watchStart", (_e, path: unknown) => {
    if (allowed(path)) watchPath(path, getWebContents);
  });
  ipcMain.on("editor:watchStop", (_e, path: unknown) => {
    if (typeof path === "string") unwatchPath(path);
  });
}
