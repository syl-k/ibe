import { BrowserWindow, Notification, shell, type WebContents } from "electron";
import { execFile } from "child_process";
import { getSettings } from "./settings";

/**
 * Terminal "attention" notifications, cmux-style: when a pty rings the bell —
 * Claude Code and many shells ring it when a turn finishes or input is awaited —
 * and the window isn't focused, pop an OS notification. Clicking it focuses the
 * window and reveals that session's tab/pane.
 *
 * Detection runs in main on the raw pty stream (not in xterm) so it also covers
 * terminals on background tabs, whose renderer views are unmounted.
 */

export interface BellSignal {
  /** a standalone BEL was seen (attention ring) */
  bell: boolean;
  /** payload of an OSC 9 desktop-notification sequence, if any */
  osc9?: string;
}

const ESC = 0x1b;
const BEL = 0x07;
const OSC_CAP = 4096;

/**
 * Stateful scanner over raw pty output. Counts only *standalone* BELs: a BEL
 * that merely terminates an OSC string (title updates OSC 0/1/2, cwd OSC 7,
 * prompt marks OSC 133, …) is ignored, so routine redraws don't spam. State
 * persists across calls because a control sequence can straddle two chunks.
 */
export function createBellDetector(): (chunk: string) => BellSignal {
  let inOsc = false; // inside `ESC ]` … up to BEL or ST
  let esc = false; // previous byte was a lone ESC
  let osc = ""; // accumulated OSC payload (capped)

  return (chunk: string): BellSignal => {
    let bell = false;
    let osc9: string | undefined;

    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);

      if (inOsc) {
        // OSC terminates on BEL or ST (ESC \)
        if (c === BEL || (esc && chunk[i] === "\\")) {
          if (osc.startsWith("9;")) {
            const body = osc.slice(2);
            // skip OSC 9;4 progress reports (ConEmu/Windows)
            if (!/^\d/.test(body)) osc9 = body;
          }
          inOsc = false;
          esc = false;
          osc = "";
          continue;
        }
        if (c === ESC) {
          esc = true;
          continue;
        }
        esc = false;
        if (osc.length < OSC_CAP) osc += chunk[i];
        continue;
      }

      if (esc) {
        esc = false;
        if (chunk[i] === "]") {
          inOsc = true; // OSC introducer `ESC ]`
          osc = "";
        }
        // other escapes (CSI `ESC [`, etc.) carry no lone BEL — ignore
        continue;
      }
      if (c === ESC) {
        esc = true;
        continue;
      }
      if (c === BEL) bell = true;
    }

    return { bell, osc9 };
  };
}

const DEBOUNCE_MS = 4000;
const lastNotified = new Map<string, number>();

/**
 * Terminal sessions the user can currently see: the active tab's terminal panes,
 * each showing its active session. The renderer keeps this in sync so we only
 * suppress notifications for a session the user is actually looking at.
 */
let visibleSessions = new Set<string>();

export function setVisibleSessions(ids: string[]): void {
  visibleSessions = new Set(ids);
}

/**
 * Show a notification for terminal `id`, unless disabled in settings or the user
 * is actively looking at that session (window focused AND the session is on the
 * active tab as its pane's shown session). Debounced per session so a burst of
 * bells produces one ping.
 */
export function notifyTerminalActivity(
  id: string,
  osc9: string | undefined,
  wc: WebContents
): void {
  if (!getSettings().notifyOnBell) return;
  if (!Notification.isSupported()) return;

  const win = BrowserWindow.fromWebContents(wc);
  // only skip when the user can actually see this session right now
  if (win?.isFocused() && visibleSessions.has(id)) return;

  const now = Date.now();
  if (now - (lastNotified.get(id) ?? 0) < DEBOUNCE_MS) return;
  lastNotified.set(id, now);

  // Play the sound ourselves rather than via the Notification: unsigned dev
  // builds aren't registered with macOS notification settings, so a
  // notification-attached sound may never play. afplay needs no permission.
  playAttentionSound();

  const n = new Notification({
    title: "ibe — ターミナル",
    body: osc9 || "処理が完了、または入力待ちです",
  });
  n.on("click", () => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
    if (!wc.isDestroyed()) wc.send("notify:activate", id);
  });
  n.show();
}

/**
 * Audible cue independent of the notification system (which unsigned dev
 * builds can't reliably use on macOS). macOS: play a system sound via afplay;
 * elsewhere: the system beep.
 */
function playAttentionSound(): void {
  if (process.platform === "darwin") {
    execFile("afplay", ["/System/Library/Sounds/Glass.aiff"], () => {
      /* sound is best-effort; ignore a missing afplay/file */
    });
  } else {
    shell.beep();
  }
}

/** Forget debounce state for a destroyed pty. */
export function forgetTerminalNotify(id: string): void {
  lastNotified.delete(id);
}
