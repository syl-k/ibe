import { useLayoutEffect, useRef } from "react";
import type { Tab } from "../types";
import { collectLeaves } from "../tree";

const ibe = window.ibe;

/** Terminal leaf ids across every tab. */
function terminalIds(tabs: Tab[]): Set<string> {
  const ids = new Set<string>();
  for (const t of tabs) {
    for (const l of collectLeaves(t.root)) {
      if (l.kind === "terminal") ids.add(l.id);
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

  useLayoutEffect(() => {
    const desired = terminalIds(tabs);

    for (const id of desired) {
      if (!known.current.has(id)) {
        // spawn at a sane default; the view resizes the pty once it fits.
        ibe.term.create(id, 80, 24);
        known.current.add(id);
      }
    }
    for (const id of [...known.current]) {
      if (!desired.has(id)) {
        ibe.term.destroy(id);
        known.current.delete(id);
      }
    }
  }, [tabs]);
}
