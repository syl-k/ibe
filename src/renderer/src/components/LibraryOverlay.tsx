import { useEffect, useMemo, useRef, useState } from "react";
import type { HistoryEntry } from "../../../shared/ipc";
import { useStore } from "../store";
import { openUrlInBrowserPane } from "../openUrl";
import { flattenChromeTree } from "../chromeFlat";

const ibe = window.ibe;

type LibraryTab = "history" | "bookmarks" | "chrome";

const TABS: Array<{ id: LibraryTab; label: string }> = [
  { id: "history", label: "履歴" },
  { id: "bookmarks", label: "ブックマーク" },
  { id: "chrome", label: "Chrome" },
];

/** 今日 / 昨日 / YYYY/MM/DD group label for a history timestamp. */
function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.floor(
    (startOf(today).getTime() - startOf(d).getTime()) / 86_400_000
  );
  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "昨日";
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
}

/**
 * The library (⌘Y): searchable history / ibe bookmarks / Chrome mirror in one
 * overlay. DOM over the workspace, so native views are retracted while open
 * (store.libraryOpen feeds the shared overlayOpen flag). History is read-only.
 */
export function LibraryOverlay() {
  const close = useStore((s) => s.setLibraryOpen);
  const bookmarks = useStore((s) => s.bookmarks);
  const chromeTree = useStore((s) => s.chromeBookmarks);

  const [tab, setTab] = useState<LibraryTab>("history");
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // Escape closes (same approach as the settings modal)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // history: recent when browsing, search when typing
  useEffect(() => {
    if (tab !== "history") return;
    const q = query.trim();
    let cancelled = false;
    (q ? ibe.history.search(q, 100) : ibe.history.recent(200)).then((r) => {
      if (!cancelled) setHistory(r);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, query]);

  const chromeFlat = useMemo(() => flattenChromeTree(chromeTree), [chromeTree]);

  const q = query.trim().toLowerCase();
  const match = (...fields: string[]) =>
    !q || fields.some((f) => f.toLowerCase().includes(q));

  const open = (url: string) => {
    openUrlInBrowserPane(url);
    close(false);
  };

  const filteredBookmarks = bookmarks.filter((b) => match(b.title, b.url));
  const filteredChrome = chromeFlat.filter((c) => match(c.title, c.url, c.path));

  // history rows with date group headers
  const historyRows: Array<
    { type: "header"; label: string } | { type: "entry"; entry: HistoryEntry }
  > = [];
  {
    let last = "";
    for (const h of history) {
      const label = dayLabel(h.ts);
      if (label !== last) {
        historyRows.push({ type: "header", label });
        last = label;
      }
      historyRows.push({ type: "entry", entry: h });
    }
  }

  return (
    <div className="library-overlay" onMouseDown={() => close(false)}>
      <div className="library-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="library-top">
          <input
            ref={inputRef}
            className="library-search"
            type="text"
            placeholder="検索…"
            value={query}
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="settings-close" onClick={() => close(false)}>
            ✕
          </button>
        </div>
        <div className="library-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === "bookmarks" && ` (${bookmarks.length})`}
              {t.id === "chrome" && chromeFlat.length > 0 && ` (${chromeFlat.length})`}
            </button>
          ))}
        </div>

        <div className="library-list">
          {tab === "history" &&
            historyRows.map((row, i) =>
              row.type === "header" ? (
                <div key={`h${i}`} className="library-day">
                  {row.label}
                </div>
              ) : (
                <div
                  key={`${row.entry.url}-${i}`}
                  className="library-row"
                  title={row.entry.url}
                  onClick={() => open(row.entry.url)}
                >
                  <span className="library-title">
                    {row.entry.title || row.entry.url}
                  </span>
                  <span className="library-url">{row.entry.url}</span>
                </div>
              )
            )}
          {tab === "history" && historyRows.length === 0 && (
            <div className="library-empty">履歴がありません</div>
          )}

          {tab === "bookmarks" &&
            filteredBookmarks.map((b) => (
              <div
                key={b.url}
                className="library-row"
                title={b.url}
                onClick={() => open(b.url)}
              >
                <span className="library-title">{b.title || b.url}</span>
                <span className="library-url">{b.url}</span>
              </div>
            ))}
          {tab === "bookmarks" && filteredBookmarks.length === 0 && (
            <div className="library-empty">ブックマークがありません</div>
          )}

          {tab === "chrome" &&
            filteredChrome.map((c, i) => (
              <div
                key={`${c.url}-${i}`}
                className="library-row"
                title={c.url}
                onClick={() => open(c.url)}
              >
                <span className="library-title">{c.title}</span>
                <span className="library-path">{c.path}</span>
                <span className="library-url">{c.url}</span>
              </div>
            ))}
          {tab === "chrome" && filteredChrome.length === 0 && (
            <div className="library-empty">
              {chromeFlat.length === 0
                ? "設定で Chrome プロファイルを選択すると表示されます"
                : "一致するブックマークがありません"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
