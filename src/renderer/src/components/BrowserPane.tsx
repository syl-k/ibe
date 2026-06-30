import { useEffect, useRef, useState } from "react";
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
  const view = useStore((s) => s.viewState[node.id]);
  const bookmarked = useStore((s) => s.bookmarks.some((b) => b.url === node.url));
  const [draft, setDraft] = useState(node.url);
  const inputRef = useRef<HTMLInputElement>(null);

  const loading = view?.loading ?? false;
  const canGoBack = view?.canGoBack ?? false;
  const canGoForward = view?.canGoForward ?? false;

  const toggleBookmark = () => {
    if (bookmarked) ibe.bookmarks.remove(node.url);
    else
      ibe.bookmarks.add({
        url: node.url,
        title: view?.title || node.url,
        favicon: view?.favicon,
      });
  };

  // keep the address bar in sync with navigation, unless the user is editing it
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(node.url);
  }, [node.url]);

  const submit = () => {
    const url = normalizeUrl(draft);
    setUrl(node.id, url);
    ibe.navigate(node.id, url);
    inputRef.current?.blur();
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
            <img src={view.favicon} alt="" width={14} height={14} />
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
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          onFocus={(e) => e.target.select()}
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
      {/* native WebContentsView is positioned over this box by syncBounds */}
      <div className="content browser-content" data-browser-id={node.id}>
        <span className="browser-hint">{loading ? "読み込み中…" : "web content"}</span>
      </div>
    </>
  );
}
