import { useStore } from "./store";
import { collectLeaves, findLeaf } from "./tree";

/**
 * Open `url` in the focused browser pane, or the first browser pane of the
 * active tab. Shared by the bookmarks bar, the Chrome menu and the library.
 */
export function openUrlInBrowserPane(url: string): void {
  const st = useStore.getState();
  const tab = st.tabs.find((t) => t.id === st.activeTabId);
  if (!tab) return;
  const focused = st.focusedPaneId ? findLeaf(tab.root, st.focusedPaneId) : null;
  const target =
    focused && focused.kind === "browser"
      ? focused
      : collectLeaves(tab.root).find((l) => l.kind === "browser") ?? null;
  if (!target) return; // no browser pane on this tab; ignore
  window.ibe.navigate(target.id, url);
  st.setUrl(target.id, url);
}
