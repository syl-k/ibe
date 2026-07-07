import { app } from "electron";
import { join } from "path";
import { copyFileSync, readFileSync, renameSync, writeFileSync } from "fs";

/** Tiny JSON persistence under the app's userData dir. */

function path(file: string): string {
  return join(app.getPath("userData"), file);
}

export function loadJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path(file), "utf8")) as T;
  } catch {
    // missing/corrupt -> last known-good backup (see backupJson) -> fresh
    try {
      return JSON.parse(readFileSync(path(`${file}.bak`), "utf8")) as T;
    } catch {
      return fallback;
    }
  }
}

export function saveJson(file: string, data: unknown): void {
  try {
    // write-then-rename so a crash mid-write can't truncate the real file
    const tmp = path(`${file}.tmp`);
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, path(file));
  } catch (err) {
    console.error(`[persist] failed to save ${file}:`, (err as Error).message);
  }
}

/** Keep the previous run's final state as `<file>.bak` (call once per run). */
export function backupJson(file: string): void {
  try {
    copyFileSync(path(file), path(`${file}.bak`));
  } catch {
    /* nothing to back up yet */
  }
}
