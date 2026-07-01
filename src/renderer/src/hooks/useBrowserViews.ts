import { useCallback, useLayoutEffect, useRef } from "react";
import type { Tab } from "../types";
import { browserLeavesByTab } from "../store";

const ibe = window.ibe;

/**
 * Owns the native WebContentsView lifecycle for browser panes across ALL tabs:
 *  - create when a browser leaf first appears, destroy when it's gone
 *  - show only the active tab's views (inactive tabs stay alive but hidden)
 *  - syncBounds(): position each active, mounted view to its DOM placeholder rect
 *
 * Inactive-tab panes aren't in the DOM, so syncBounds only ever touches the
 * active tab — exactly the views that are visible.
 */
export function useBrowserViews(
  tabs: Tab[],
  activeTabId: string,
  omniboxPaneId: string | null,
  settingsOpen: boolean
) {
  const known = useRef(new Map<string, string>()); // id -> tabId
  const visible = useRef(new Map<string, boolean>());
  const lastBounds = useRef(new Map<string, string>());

  // create / destroy as browser leaves come and go
  useLayoutEffect(() => {
    const desired = browserLeavesByTab(tabs);
    const desiredIds = new Set(desired.map((d) => d.id));

    for (const d of desired) {
      if (!known.current.has(d.id)) {
        ibe.createBrowser(d.id, d.url);
        visible.current.set(d.id, false);
      }
      known.current.set(d.id, d.tabId);
    }
    for (const id of [...known.current.keys()]) {
      if (!desiredIds.has(id)) {
        ibe.destroy(id);
        known.current.delete(id);
        visible.current.delete(id);
        lastBounds.current.delete(id);
      }
    }
  }, [tabs]);

  // visibility follows the active tab; a pane with its omnibox open is retracted
  // so the suggestions dropdown (DOM) can show over its area, and every view is
  // retracted while the settings modal (DOM) is open so it isn't hidden behind
  // the native views.
  useLayoutEffect(() => {
    for (const [id, tabId] of known.current) {
      const shouldShow =
        tabId === activeTabId && id !== omniboxPaneId && !settingsOpen;
      if (visible.current.get(id) !== shouldShow) {
        ibe.setVisible(id, shouldShow);
        visible.current.set(id, shouldShow);
      }
    }
  }, [tabs, activeTabId, omniboxPaneId, settingsOpen]);

  const syncBounds = useCallback(() => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-browser-id]");
    for (const el of nodes) {
      const id = el.dataset.browserId!;
      const r = el.getBoundingClientRect();
      const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(
        r.width
      )},${Math.round(r.height)}`;
      if (lastBounds.current.get(id) === key) continue;
      lastBounds.current.set(id, key);
      ibe.setBounds(id, { x: r.left, y: r.top, width: r.width, height: r.height });
    }
  }, []);

  return syncBounds;
}
