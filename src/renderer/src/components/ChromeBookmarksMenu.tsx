import { useState } from "react";
import type { ChromeBookmarkNode } from "../../../shared/ipc";

/**
 * Dropdown for the Chrome bookmark mirror: the folder tree as expandable rows.
 * Rendered as DOM over the workspace — the native browser views are retracted
 * while it's open (store.chromeMenuOpen), like the settings modal.
 */
export function ChromeBookmarksMenu({
  tree,
  onOpenUrl,
  onClose,
}: {
  tree: ChromeBookmarkNode[];
  onOpenUrl: (url: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="chrome-menu-overlay" onMouseDown={onClose}>
      <div className="chrome-menu" onMouseDown={(e) => e.stopPropagation()}>
        {tree.map((node, i) => (
          <MenuNode key={i} node={node} depth={0} onOpenUrl={onOpenUrl} />
        ))}
        {tree.length === 0 && (
          <div className="chrome-menu-empty">ブックマークがありません</div>
        )}
      </div>
    </div>
  );
}

function MenuNode({
  node,
  depth,
  onOpenUrl,
}: {
  node: ChromeBookmarkNode;
  depth: number;
  onOpenUrl: (url: string) => void;
}) {
  // top-level roots (ブックマークバー etc.) start open; deeper folders closed
  const [open, setOpen] = useState(depth === 0);

  if (node.url) {
    return (
      <div
        className="chrome-menu-row url"
        style={{ paddingLeft: depth * 14 + 10 }}
        title={node.url}
        onClick={() => onOpenUrl(node.url!)}
      >
        <span className="chrome-menu-name">{node.name || node.url}</span>
      </div>
    );
  }

  return (
    <>
      <div
        className="chrome-menu-row folder"
        style={{ paddingLeft: depth * 14 + 10 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="chrome-menu-arrow">{open ? "▾" : "▸"}</span>
        <span className="chrome-menu-name">{node.name}</span>
        <span className="chrome-menu-count">{node.children?.length ?? 0}</span>
      </div>
      {open &&
        node.children?.map((c, i) => (
          <MenuNode key={i} node={c} depth={depth + 1} onOpenUrl={onOpenUrl} />
        ))}
    </>
  );
}
