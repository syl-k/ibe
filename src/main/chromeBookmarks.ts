import { app, ipcMain, type WebContents } from "electron";
import { promises as fs, watch, type FSWatcher } from "fs";
import { join } from "path";
import type { ChromeBookmarkNode, ChromeProfile } from "../shared/ipc";
import {
  convertChromeBookmarks,
  isSafeProfileId,
  parseProfileNames,
} from "./chromeParse";

/**
 * Read-only mirror of the local Chrome profile's bookmarks. Chrome's own
 * account sync keeps the profile's Bookmarks file current, so following that
 * file is effectively Google-account bookmark sync in the other-devices → ibe
 * direction. We never write anything under the Chrome directory.
 */

function chromeDir(): string {
  return join(app.getPath("appData"), "Google", "Chrome");
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return null; // missing profile / Chrome not installed / mid-write torn read
  }
}

async function loadTree(profileId: string): Promise<ChromeBookmarkNode[]> {
  if (!isSafeProfileId(profileId)) return [];
  const raw = await readJson(join(chromeDir(), profileId, "Bookmarks"));
  return raw ? convertChromeBookmarks(raw) : [];
}

// One watcher for the currently mirrored profile. Chrome rewrites Bookmarks
// via rename, which kills a file watcher — watch the profile directory and
// filter events instead. Debounced: a sync burst touches the file repeatedly.
let watcher: FSWatcher | null = null;
let watchedProfile = "";
let debounce: NodeJS.Timeout | null = null;

function armWatcher(profileId: string, getWc: () => WebContents | null): void {
  if (watchedProfile === profileId) return;
  watcher?.close();
  watcher = null;
  watchedProfile = profileId;
  if (!isSafeProfileId(profileId)) return;

  try {
    watcher = watch(join(chromeDir(), profileId), (_event, filename) => {
      if (filename !== "Bookmarks") return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void loadTree(profileId).then((tree) => {
          const wc = getWc();
          // an empty parse can be a torn read mid-rename — don't wipe the bar
          if (wc && !wc.isDestroyed() && tree.length > 0) {
            wc.send("chrome:bookmarks-change", tree);
          }
        });
      }, 500);
    });
  } catch {
    /* profile dir vanished — change events just won't fire */
  }
}

export function registerChromeBookmarks(
  getWebContents: () => WebContents | null
): void {
  ipcMain.handle("chrome:profiles", async (): Promise<ChromeProfile[]> => {
    const names = parseProfileNames(await readJson(join(chromeDir(), "Local State")));
    const out: ChromeProfile[] = [];
    for (const [id, name] of names) {
      if (!isSafeProfileId(id)) continue;
      try {
        await fs.access(join(chromeDir(), id, "Bookmarks"));
        out.push({ id, name });
      } catch {
        /* profile without bookmarks — skip */
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  });

  ipcMain.handle("chrome:get", async (_e, profileId: unknown) => {
    const id = typeof profileId === "string" ? profileId : "";
    armWatcher(id, getWebContents); // "" disarms
    return loadTree(id);
  });
}
