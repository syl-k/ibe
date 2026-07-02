import { useEffect, useRef } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { ThemeName } from "../../../shared/ipc";
import { useSettings } from "../settings";

const ibe = window.ibe;

// Catppuccin palettes — the terminal tracks the app theme.
const THEMES: Record<ThemeName, ITheme> = {
  mocha: {
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
  },
  latte: {
    background: "#fafafa",
    foreground: "#4c4f69",
    cursor: "#dc8a78",
    selectionBackground: "#acb0be",
    black: "#5c5f77",
    red: "#d20f39",
    green: "#40a02b",
    yellow: "#df8e1d",
    blue: "#1e66f5",
    magenta: "#ea76cb",
    cyan: "#179299",
    white: "#acb0be",
  },
};

/**
 * One xterm view bound to one pty session. Mounted only while its session is the
 * active one in the pane; on (re)mount it attaches and the main process replays
 * the session's scrollback, so switching sessions/tabs preserves history.
 *
 * Keyed by `sessionId` at the call site so a session change remounts cleanly.
 * Font and theme come from user settings and are applied live to the live term.
 */
export function TerminalView({ sessionId }: { sessionId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const { terminalFontFamily, terminalFontSize, theme } =
      useSettings.getState().settings;

    const term = new Terminal({
      fontFamily: terminalFontFamily,
      fontSize: terminalFontSize,
      theme: THEMES[theme],
      cursorBlink: true,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;

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
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  // apply live font/theme changes to the mounted terminal
  useEffect(
    () =>
      useSettings.subscribe((state) => {
        const term = termRef.current;
        if (!term) return;
        const { terminalFontFamily, terminalFontSize, theme } = state.settings;
        term.options.fontFamily = terminalFontFamily;
        term.options.fontSize = terminalFontSize;
        term.options.theme = THEMES[theme];
        try {
          fitRef.current?.fit();
        } catch {
          /* host not laid out yet */
        }
        ibe.term.resize(sessionId, term.cols, term.rows);
      }),
    [sessionId]
  );

  return (
    <div
      className="content terminal-host"
      ref={hostRef}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}
