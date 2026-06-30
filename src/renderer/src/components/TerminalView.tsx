import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const ibe = window.ibe;

// Catppuccin Mocha — matches the app chrome.
const THEME = {
  background: "#11111b",
  foreground: "#cdd6f4",
  cursor: "#f5e0dc",
  selectionBackground: "#585b70",
  black: "#45475a",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#f5c2e7",
  cyan: "#94e2d5",
  white: "#bac2de",
};

/**
 * One xterm view bound to one pty session. Mounted only while its session is the
 * active one in the pane; on (re)mount it attaches and the main process replays
 * the session's scrollback, so switching sessions/tabs preserves history.
 *
 * Keyed by `sessionId` at the call site so a session change remounts cleanly.
 */
export function TerminalView({ sessionId }: { sessionId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: '"SF Mono", Menlo, monospace',
      fontSize: 12,
      theme: THEME,
      cursorBlink: true,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);

    const pushResize = () => {
      try {
        fit.fit();
      } catch {
        /* host not laid out yet */
      }
      ibe.term.resize(sessionId, term.cols, term.rows);
    };

    // subscribe BEFORE attach so the replayed backlog isn't missed
    const offData = ibe.term.onData(sessionId, (data) => term.write(data));
    const offExit = ibe.term.onExit(sessionId, (code) =>
      term.write(`\r\n\x1b[90m[process exited with code ${code}]\x1b[0m\r\n`)
    );
    term.onData((data) => ibe.term.input(sessionId, data));

    pushResize();
    ibe.term.attach(sessionId);
    term.focus();

    const ro = new ResizeObserver(() => pushResize());
    ro.observe(host);

    return () => {
      ro.disconnect();
      offData();
      offExit();
      ibe.term.detach(sessionId);
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div
      className="content terminal-host"
      ref={hostRef}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}
