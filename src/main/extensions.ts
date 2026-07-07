import { app, session } from "electron";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Unpacked Chrome extensions, loaded from userData/extensions/<name>/ at
 * startup. Electron's extension support is a subset of Chrome's (no MV3
 * service workers, no toolbar UI), so this targets extensions whose UI page is
 * self-contained (e.g. LINE): the page is opened in a normal browser pane via
 * its chrome-extension:// URL. Use scripts/install-chrome-extension.mjs to
 * download + patch an extension into that folder (it strips the service
 * worker and injects a chrome.* API shim the page needs to boot).
 */

export interface LoadedExtension {
  id: string;
  name: string;
  /** URL of the page to open in a pane (action popup or index.html) */
  url: string;
}

const loaded: LoadedExtension[] = [];

export function loadedExtensions(): LoadedExtension[] {
  return loaded;
}

export async function loadExtensions(): Promise<void> {
  const root = join(app.getPath("userData"), "extensions");
  mkdirSync(root, { recursive: true });

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    if (!existsSync(join(dir, "manifest.json"))) continue;
    try {
      const ext = await session.defaultSession.loadExtension(dir);
      const manifest = ext.manifest as {
        action?: { default_popup?: string };
        browser_action?: { default_popup?: string };
      };
      const page =
        manifest.action?.default_popup ??
        manifest.browser_action?.default_popup ??
        "index.html";
      loaded.push({ id: ext.id, name: ext.name, url: ext.url + page });
      console.log(`[extensions] loaded ${ext.name} (${ext.id})`);
    } catch (err) {
      console.error(`[extensions] ${entry.name}:`, (err as Error).message);
    }
  }
}
