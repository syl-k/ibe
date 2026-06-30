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
  const [draft, setDraft] = useState(node.url);
  const inputRef = useRef<HTMLInputElement>(null);

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
        <button title="戻る" onClick={() => ibe.goBack(node.id)}>
          ←
        </button>
        <button title="進む" onClick={() => ibe.goForward(node.id)}>
          →
        </button>
        <button title="リロード" onClick={() => ibe.reload(node.id)}>
          ⟳
        </button>
        <input
          ref={inputRef}
          className="addressbar"
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          onFocus={(e) => e.target.select()}
        />
        <PaneActions id={node.id} toggleLabel="T" toggleTitle="ターミナルに切替" />
      </div>
      {/* native WebContentsView is positioned over this box by syncBounds */}
      <div className="content browser-content" data-browser-id={node.id}>
        <span className="browser-hint">web content (native overlay)</span>
      </div>
    </>
  );
}
