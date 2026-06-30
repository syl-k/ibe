import { app } from "electron";
import { join } from "path";
import { readFileSync, writeFileSync } from "fs";

/** Tiny JSON persistence under the app's userData dir. */

function path(file: string): string {
  return join(app.getPath("userData"), file);
}

export function loadJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path(file), "utf8")) as T;
  } catch {
    return fallback; // missing/corrupt -> start fresh
  }
}

export function saveJson(file: string, data: unknown): void {
  try {
    writeFileSync(path(file), JSON.stringify(data));
  } catch (err) {
    console.error(`[persist] failed to save ${file}:`, (err as Error).message);
  }
}
