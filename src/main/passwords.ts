import { BrowserWindow, ipcMain, safeStorage, type WebContents } from "electron";
import { loadJson, saveJson } from "./persist";
import type { SavedCredential } from "../shared/ipc";

/**
 * Login credential storage for browser panes. Passwords are encrypted with the
 * OS keychain via Electron safeStorage and kept in userData/passwords.json; the
 * plaintext password only ever exists transiently in the main process and in
 * the browser-pane preload that fills it. The renderer's management UI sees
 * origins + usernames but never a secret.
 *
 * Capture/fill flow (all via the browser-pane preload, channels pw:*):
 *  - pw:submitted  preload → main : a login form was submitted; main asks the
 *                                    owning pane to show a save/update prompt
 *  - pw:save       preload → main : user confirmed; encrypt + persist
 *  - pw:never      preload → main : user declined; remember to not ask again
 *  - pw:query      preload → main : page loaded; return matching logins to fill
 *
 * Origin, not full URL, is the key — credentials saved on a login page fill the
 * whole site. An empty username is allowed (some sites are password-only).
 */

const FILE = "passwords.json";

interface StoredEntry {
  origin: string;
  username: string;
  /** base64 of safeStorage-encrypted password */
  secret: string;
  updatedAt: number;
}

interface StoredFile {
  version: number;
  entries: StoredEntry[];
  /** "origin username" pairs the user chose never to save */
  neverSave: string[];
}

const VERSION = 1;
const key = (origin: string, username: string) => `${origin} ${username}`;

let data: StoredFile = { version: VERSION, entries: [], neverSave: [] };

function load(): void {
  const raw = loadJson<StoredFile | null>(FILE, null);
  if (
    raw &&
    raw.version === VERSION &&
    Array.isArray(raw.entries) &&
    Array.isArray(raw.neverSave)
  ) {
    data = raw;
  }
}

function persist(): void {
  saveJson(FILE, data);
}

function publicList(): SavedCredential[] {
  return data.entries
    .map((e) => ({ origin: e.origin, username: e.username, updatedAt: e.updatedAt }))
    .sort((a, b) => a.origin.localeCompare(b.origin) || a.username.localeCompare(b.username));
}

function broadcast(): void {
  const list = publicList();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send("pw:change", list);
  }
}

/** Normalize any URL to its origin; returns null for non-web schemes. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Sender WebContents → the pane id we assigned it (for the save prompt). */
type PaneLookup = (wc: WebContents) => string | null;

export function registerPasswords(paneIdOf: PaneLookup): void {
  load();

  const encOk = () => safeStorage.isEncryptionAvailable();

  ipcMain.handle("pw:list", () => publicList());
  ipcMain.handle("pw:available", () => encOk());

  // page asks which logins to offer for its origin (fill)
  ipcMain.handle("pw:query", (e, rawUrl: string) => {
    const origin = originOf(rawUrl);
    if (!origin || !encOk()) return [];
    const out: Array<{ username: string; password: string; updatedAt: number }> = [];
    for (const entry of data.entries) {
      if (entry.origin !== origin) continue;
      try {
        out.push({
          username: entry.username,
          password: safeStorage.decryptString(Buffer.from(entry.secret, "base64")),
          updatedAt: entry.updatedAt,
        });
      } catch {
        /* corrupt/rekeyed entry — skip rather than fail the whole fill */
      }
    }
    // most-recently-updated first (the preload fills the first match)
    return out
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ username, password }) => ({ username, password }));
  });

  // a login form was submitted; decide whether to prompt the owning pane
  ipcMain.on(
    "pw:submitted",
    (e, payload: { url: string; username: string; password: string }) => {
      const origin = originOf(payload.url);
      const password = String(payload.password ?? "");
      const username = String(payload.username ?? "");
      if (!origin || !password || !encOk()) return;
      if (data.neverSave.includes(key(origin, username))) return;

      const existing = data.entries.find(
        (x) => x.origin === origin && x.username === username
      );
      // unchanged credential → nothing to offer
      if (existing) {
        try {
          if (safeStorage.decryptString(Buffer.from(existing.secret, "base64")) === password) {
            return;
          }
        } catch {
          /* fall through and offer to re-save */
        }
      }

      const paneId = paneIdOf(e.sender);
      if (!paneId) return;
      // ask the browser-pane preload to render the save/update banner
      e.sender.send("pw:prompt", { origin, username, update: !!existing });
    }
  );

  // user confirmed the save/update banner
  ipcMain.on(
    "pw:save",
    (_e, payload: { origin: string; username: string; password: string }) => {
      const origin = originOf(payload.origin) ?? payload.origin;
      const username = String(payload.username ?? "");
      const password = String(payload.password ?? "");
      if (!origin || !password || !encOk()) return;
      const secret = safeStorage.encryptString(password).toString("base64");
      const existing = data.entries.find(
        (x) => x.origin === origin && x.username === username
      );
      if (existing) {
        existing.secret = secret;
        existing.updatedAt = Date.now();
      } else {
        data.entries.push({ origin, username, secret, updatedAt: Date.now() });
      }
      persist();
      broadcast();
    }
  );

  // user chose "never for this site"
  ipcMain.on("pw:never", (_e, payload: { origin: string; username: string }) => {
    const origin = originOf(payload.origin) ?? payload.origin;
    const k = key(origin, String(payload.username ?? ""));
    if (!data.neverSave.includes(k)) {
      data.neverSave.push(k);
      persist();
    }
  });

  // management UI: forget a credential
  ipcMain.on("pw:remove", (_e, origin: string, username: string) => {
    const before = data.entries.length;
    data.entries = data.entries.filter(
      (x) => !(x.origin === origin && x.username === username)
    );
    if (data.entries.length !== before) {
      persist();
      broadcast();
    }
  });
}
