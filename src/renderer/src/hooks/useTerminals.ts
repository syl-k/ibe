import { useLayoutEffect, useRef } from "react";
import type { Tab } from "../types";
import { collectLeaves } from "../tree";

const ibe = window.ibe;

/** Every pty session id across every tab (a terminal pane has ≥1 session). */
function terminalIds(tabs: Tab[]): Set<string> {
  const ids = new Set<string>();
  for (const t of tabs) {
    for (const l of collectLeaves(t.root)) {
      if (l.kind === "terminal") {
        for (const session of l.sessions ?? []) ids.add(session);
      }
    }
  }
  return ids;
}

/**
 * Owns the pty lifecycle for terminal panes across ALL tabs, independent of
 * mount: spawn when a terminal leaf first appears, kill when it's gone. The
 * xterm view (TerminalPane) only attaches/detaches I/O on mount/unmount, so the
 * pty survives tab switches. Mirrors useBrowserViews.
 */
export function useTerminals(tabs: Tab[]): void {
  const known = useRef(new Set<string>());
  const gcDone = useRef(false);

  useLayoutEffect(() => {
    const desired = terminalIds(tabs);

    for (const id of desired) {
      if (!known.current.has(id)) {
        // spawn at a sane default; the view resizes the pty once it fits.
        // For ids restored from a persisted session the pty may already be
        // alive in main — create is a no-op and attach replays its backlog.
        ibe.term.create(id, 80, 24);
        known.current.add(id);
      }
    }

    // once per renderer boot: reap ptys that no restored pane references
    if (!gcDone.current) {
      gcDone.current = true;
      ibe.term.gc([...desired]);
    }
    for (const id of [...known.current]) {
      if (!desired.has(id)) {
        ibe.term.destroy(id);
        known.current.delete(id);
      }
    }
  }, [tabs]);
}
