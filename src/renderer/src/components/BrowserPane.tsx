import { useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "../../../shared/ipc";
import type { LeafNode } from "../types";
import { useStore } from "../store";
import { PaneActions } from "./PaneActions";

const ibe = window.ibe;

function normalizeUrl(input: string): string {
  const v = input.trim();
  if (!v) return "about:blank";
  if (/^[a-z]+:\/\//i.test(v) || v.startsWith("about:")) return v;
  if (/^[\w-]+(\.[\w-]+)+/.test(v)) return `https://${v}`;
  return `https://www.google.com/search?q=${encodeURIComponent(v)}`;
}

export function BrowserPane({ node }: { node: LeafNode }) {
  const setUrl = useStore((s) => s.setUrl);
  const setOmnibox = useStore((s) => s.setOmnibox);
  const view = useStore((s) => s.viewState[node.id]);
  const bookmarked = useStore((s) => s.bookmarks.some((b) => b.url === node.url));
  const [draft, setDraft] = useState(node.url);
  const [suggestions, setSuggestions] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const loading = view?.loading ?? false;
  const canGoBack = view?.canGoBack ?? false;
  const canGoForward = view?.canGoForward ?? false;

  // keep the address bar in sync with navigation, unless the user is editing it
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(node.url);
  }, [node.url]);

  // the omnibox dropdown is open exactly when we have suggestions to show;
  // tell the store so this pane's native view is retracted underneath it
  const open = suggestions.length > 0;
  useEffect(() => {
    if (open) setOmnibox(node.id);
    return () => setOmnibox(null);
  }, [open, node.id, setOmnibox]);

  const closeSuggestions = () => {
    setSuggestions([]);
    setSelected(-1);
  };

  const onDraftChange = async (value: string) => {
    setDraft(value);
    setSelected(-1);
    const q = value.trim();
    if (!q) return closeSuggestions();
    const hits = await ibe.history.search(q, 7);
    // only apply if the field still has this value (avoid races)
    if (inputRef.current?.value.trim() === q) setSuggestions(hits);
  };

  const go = (url: string) => {
    setDraft(url); // reflect the chosen url immediately (input may still be focused)
    setUrl(node.id, url);
    ibe.navigate(node.id, url);
    closeSuggestions();
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      go(selected >= 0 ? suggestions[selected].url : normalizeUrl(draft));
    } else if (e.key === "Escape") {
      closeSuggestions();
      inputRef.current?.blur();
    }
  };

  const toggleBookmark = () => {
    if (bookmarked) ibe.bookmarks.remove(node.url);
    else
      ibe.bookmarks.add({
        url: node.url,
        title: view?.title || node.url,
        favicon: view?.favicon,
      });
  };

  return (
    <>
      <div className="toolbar" onMouseDown={(e) => e.stopPropagation()}>
        <button title="戻る" disabled={!canGoBack} onClick={() => ibe.goBack(node.id)}>
          ←
        </button>
        <button
          title="進む"
          disabled={!canGoForward}
          onClick={() => ibe.goForward(node.id)}
        >
          →
        </button>
        {loading ? (
          <button title="停止" onClick={() => ibe.stop(node.id)}>
            ✕
          </button>
        ) : (
          <button title="リロード" onClick={() => ibe.reload(node.id)}>
            ⟳
          </button>
        )}
        <span className="favicon" title={view?.title || ""}>
          {view?.favicon ? (
            <img src={view.favicon} alt="" width={18} height={18} />
          ) : (
            <span className="favicon-dot" />
          )}
        </span>
        <input
          ref={inputRef}
          className="addressbar"
          data-address-for={node.id}
          value={draft}
          spellCheck={false}
          placeholder="URL または検索"
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={(e) => e.target.select()}
          onBlur={closeSuggestions}
        />
        <button
          className={bookmarked ? "starred" : ""}
          title={bookmarked ? "ブックマーク解除" : "ブックマークに追加"}
          onClick={toggleBookmark}
        >
          {bookmarked ? "★" : "☆"}
        </button>
        <PaneActions id={node.id} toggleLabel="T" toggleTitle="ターミナルに切替" />
      </div>

      {open && (
        <div className="suggestions" onMouseDown={(e) => e.preventDefault()}>
          {suggestions.map((h, i) => (
            <div
              key={h.url}
              className={`suggestion${i === selected ? " selected" : ""}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => go(h.url)}
            >
              <span className="suggestion-title">{h.title || h.url}</span>
              <span className="suggestion-url">{h.url}</span>
            </div>
          ))}
        </div>
      )}

      {/* native WebContentsView is positioned over this box by syncBounds */}
      <div className="content browser-content" data-browser-id={node.id}>
        <span className="browser-hint">{loading ? "読み込み中…" : "web content"}</span>
      </div>
    </>
  );
}
