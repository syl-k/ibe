import { app, session } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import { ElectronBlocker } from "@ghostery/adblocker-electron";

/**
 * Session-wide ad/tracker blocking (uBlock-grade filter lists via Ghostery's
 * engine). Runs on the default session, so every browser pane is covered.
 * The compiled engine is cached in userData; when offline we fall back to the
 * cache, and if there is none we just browse unblocked rather than fail.
 */
export async function registerAdblock(): Promise<void> {
  try {
    const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: join(app.getPath("userData"), "adblock-engine.bin"),
      read: fs.readFile,
      write: fs.writeFile,
    });
    blocker.enableBlockingInSession(session.defaultSession);
    console.log("[adblock] enabled");
  } catch (err) {
    console.error("[adblock] disabled:", (err as Error).message);
  }
}
