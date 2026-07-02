import { useStore } from "../store";
import { openUrlInBrowserPane } from "../openUrl";
import { ChromeBookmarksMenu } from "./ChromeBookmarksMenu";

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

  const open = openUrlInBrowserPane;

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
