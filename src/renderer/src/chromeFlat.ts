import type { ChromeBookmarkNode } from "../../shared/ipc";

/** A Chrome bookmark flattened out of its folder tree. */
export interface FlatChromeBookmark {
  title: string;
  url: string;
  /** folder path, e.g. "ブックマークバー / 開発" */
  path: string;
}

/** Flatten the mirrored Chrome tree for list display and search. */
export function flattenChromeTree(
  tree: ChromeBookmarkNode[]
): FlatChromeBookmark[] {
  const out: FlatChromeBookmark[] = [];
  const walk = (node: ChromeBookmarkNode, path: string) => {
    if (node.url) {
      out.push({ title: node.name || node.url, url: node.url, path });
      return;
    }
    const next = path ? `${path} / ${node.name}` : node.name;
    for (const c of node.children ?? []) walk(c, next);
  };
  for (const root of tree) walk(root, "");
  return out;
}
