import { ipcMain, type WebContents } from "electron";
import { homedir } from "os";
import * as pty from "node-pty";
import { getSettings } from "./settings";
import {
  createBellDetector,
  notifyTerminalActivity,
  forgetTerminalNotify,
  setVisibleSessions,
  type BellSignal,
} from "./termNotify";

/**
 * Owns one login-shell pty per terminal pane, keyed by the renderer's pane id.
 *
 * A pty outlives renderer mounts: it is spawned on `term:create`, killed only on
 * `term:destroy` (when the pane leaves the layout). Tab switches unmount the
 * xterm view but keep the pty; we keep a capped scrollback buffer so the
 * re-mounting view can `term:attach` and replay what it missed.
 */

const SCROLLBACK_LIMIT = 256 * 1024; // bytes of backlog kept per pty

interface Session {
  proc: pty.IPty;
  buffer: string;
  attached: boolean;
  /** OSC-aware bell scanner for attention notifications */
  detect: (chunk: string) => BellSignal;
}

const sessions = new Map<string, Session>();

function loginShell(): string {
  // an explicit setting wins; otherwise fall back to the user's login shell
  return getSettings().shell.trim() || process.env["SHELL"] || "/bin/zsh";
}

function send(wc: WebContents, channel: string, payload: unknown): void {
  if (!wc.isDestroyed()) wc.send(channel, payload);
}

export function registerPtyHandlers(getWebContents: () => WebContents | null): void {
  ipcMain.on("term:create", (_e, id: string, cols: number, rows: number) => {
    if (sessions.has(id)) return;

    // Identify as our own terminal: the inherited env carries the launching
    // terminal's TERM_PROGRAM (iTerm2/VSCode/…), which makes CLIs like Claude
    // Code pick that terminal's notification protocol instead of the bell we
    // detect for M7 notifications.
    const env = {
      ...process.env,
      TERM: "xterm-256color",
      TERM_PROGRAM: "ibe",
    } as Record<string, string>;
    delete env["TERM_PROGRAM_VERSION"];

    const proc = pty.spawn(loginShell(), ["-l"], {
      name: "xterm-256color",
      cols: Math.max(cols, 1),
      rows: Math.max(rows, 1),
      cwd: homedir(),
      env,
    });

    const session: Session = {
      proc,
      buffer: "",
      attached: false,
      detect: createBellDetector(),
    };
    sessions.set(id, session);

    proc.onData((data) => {
      session.buffer += data;
      if (session.buffer.length > SCROLLBACK_LIMIT) {
        session.buffer = session.buffer.slice(-SCROLLBACK_LIMIT);
      }
      const wc = getWebContents();
      // attention notification (works whether or not a view is attached)
      const { bell, osc9 } = session.detect(data);
      if ((bell || osc9) && wc) notifyTerminalActivity(id, osc9, wc);
      if (session.attached && wc) send(wc, "term:data", { id, data });
    });

    proc.onExit(({ exitCode }) => {
      const wc = getWebContents();
      if (wc) send(wc, "term:exit", { id, exitCode });
      sessions.delete(id);
      forgetTerminalNotify(id);
    });
  });

  // Replay backlog, then stream live. Only after this does live data flow, so
  // nothing is lost or duplicated across mount/unmount.
  ipcMain.on("term:attach", (_e, id: string) => {
    const session = sessions.get(id);
    if (!session) return;
    session.attached = true;
    const wc = getWebContents();
    if (wc && session.buffer) send(wc, "term:data", { id, data: session.buffer });
  });

  ipcMain.on("term:detach", (_e, id: string) => {
    const session = sessions.get(id);
    if (session) session.attached = false;
  });

  ipcMain.on("term:input", (_e, id: string, data: string) => {
    sessions.get(id)?.proc.write(data);
  });

  ipcMain.on("term:resize", (_e, id: string, cols: number, rows: number) => {
    try {
      sessions.get(id)?.proc.resize(Math.max(cols, 1), Math.max(rows, 1));
    } catch {
      /* pty may have exited between resize observer and here */
    }
  });

  // renderer reports which terminal sessions are on-screen (active tab, each
  // pane's shown session) so we don't notify for what the user is looking at
  ipcMain.on("term:visible", (_e, ids: string[]) => {
    setVisibleSessions(Array.isArray(ids) ? ids : []);
  });

  ipcMain.on("term:destroy", (_e, id: string) => {
    const session = sessions.get(id);
    if (!session) return;
    session.proc.kill();
    sessions.delete(id);
    forgetTerminalNotify(id);
  });
}

/** Kill every pty (window close / app quit). */
export function killAllPtys(): void {
  for (const { proc } of sessions.values()) {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }
  sessions.clear();
}
