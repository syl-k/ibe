import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { LeafNode } from "../types";
import { PaneActions } from "./PaneActions";

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

export function TerminalPane({ node }: { node: LeafNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const id = node.id;

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
    fit.fit();

    const pushResize = () => {
      try {
        fit.fit();
      } catch {
        /* host not laid out yet */
      }
      ibe.term.resize(id, term.cols, term.rows);
    };

    // subscribe BEFORE attach so the replayed backlog isn't missed
    const offData = ibe.term.onData(id, (data) => term.write(data));
    const offExit = ibe.term.onExit(id, (code) =>
      term.write(`\r\n\x1b[90m[process exited with code ${code}]\x1b[0m\r\n`)
    );
    term.onData((data) => ibe.term.input(id, data));

    pushResize();
    ibe.term.attach(id);
    term.focus();

    const ro = new ResizeObserver(() => pushResize());
    ro.observe(host);

    return () => {
      ro.disconnect();
      offData();
      offExit();
      ibe.term.detach(id);
      term.dispose();
    };
  }, [id]);

  return (
    <>
      <div className="toolbar" onMouseDown={(e) => e.stopPropagation()}>
        <span className="kind">⌘ terminal · {id}</span>
        <span className="spacer" />
        <PaneActions id={id} toggleLabel="B" toggleTitle="ブラウザに切替" />
      </div>
      <div
        className="content terminal-host"
        ref={hostRef}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </>
  );
}
