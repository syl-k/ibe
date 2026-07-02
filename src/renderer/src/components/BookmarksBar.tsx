import { useStore } from "../store";
import { collectLeaves, findLeaf } from "../tree";
import type { LeafNode } from "../types";
import { ChromeBookmarksMenu } from "./ChromeBookmarksMenu";

const ibe = window.ibe;

/**
 * Bookmarks bar shown under the tab bar (chrome area, so it never collides with
 * the native WebContentsViews that overlay the workspace). Clicking a bookmark
 * navigates the focused browser pane, or the first browser pane in the tab.
 * When a Chrome profile is configured, a "Chrome" dropdown mirrors its bookmark
 * tree (read-only, kept current by Chrome's own account sync).
 */
export function BookmarksBar() {
  const bookmarks = useStore((s) => s.bookmarks);
  const chromeTree = useStore((s) => s.chromeBookmarks);
  const chromeMenuOpen = useStore((s) => s.chromeMenuOpen);
  const setChromeMenuOpen = useStore((s) => s.setChromeMenuOpen);

  if (bookmarks.length === 0 && chromeTree.length === 0) return null;

  const open = (url: string) => {
    const st = useStore.getState();
    const tab = st.tabs.find((t) => t.id === st.activeTabId)!;
    const focused =
      st.focusedPaneId && findLeaf(tab.root, st.focusedPaneId);
    const target: LeafNode | null =
      focused && focused.kind === "browser"
        ? focused
        : collectLeaves(tab.root).find((l) => l.kind === "browser") ?? null;
    if (!target) return; // no browser pane to navigate; ignore for now
    ibe.navigate(target.id, url);
    st.setUrl(target.id, url);
  };

  return (
    <div className="bookmarks-bar">
      {chromeTree.length > 0 && (
        <button
          className={`bookmark chrome-toggle${chromeMenuOpen ? " active" : ""}`}
          title="Chrome のブックマーク(読み取り専用ミラー)"
          onClick={() => setChromeMenuOpen(!chromeMenuOpen)}
        >
          <span className="bookmark-title">Chrome ▾</span>
        </button>
      )}
      {bookmarks.map((b) => (
        <button
          key={b.url}
          className="bookmark"
          title={`${b.title}\n${b.url}`}
          onClick={() => open(b.url)}
        >
          {b.favicon ? (
            <img src={b.favicon} alt="" width={13} height={13} />
          ) : (
            <span className="favicon-dot" />
          )}
          <span className="bookmark-title">{b.title || b.url}</span>
        </button>
      ))}
      {chromeMenuOpen && (
        <ChromeBookmarksMenu
          tree={chromeTree}
          onOpenUrl={(url) => {
            open(url);
            setChromeMenuOpen(false);
          }}
          onClose={() => setChromeMenuOpen(false)}
        />
      )}
    </div>
  );
}
