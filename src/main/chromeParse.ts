import type { ChromeBookmarkNode } from "../shared/ipc";

/**
 * Pure converters for Chrome's on-disk JSON formats (no electron/fs imports so
 * they can be unit-tested in plain node against real profile data).
 */

/** True when `id` is a plain profile directory name ("Default", "Profile 3"). */
export function isSafeProfileId(id: unknown): id is string {
  return typeof id === "string" && /^(Default|Profile \d+)$/.test(id);
}

interface RawNode {
  type?: unknown;
  name?: unknown;
  url?: unknown;
  children?: unknown;
}

function convertNode(raw: RawNode): ChromeBookmarkNode | null {
  const name = typeof raw.name === "string" ? raw.name : "";
  if (raw.type === "url") {
    return typeof raw.url === "string" ? { name, url: raw.url } : null;
  }
  if (raw.type === "folder") {
    const children = Array.isArray(raw.children)
      ? raw.children
          .map((c) => convertNode(c as RawNode))
          .filter((c): c is ChromeBookmarkNode => c !== null)
      : [];
    return { name, children };
  }
  return null; // unknown node type — skip
}

/**
 * Convert a parsed Chrome Bookmarks JSON into our tree: the bookmark-bar and
 * "other" roots become two top-level folders (synced/mobile roots are usually
 * empty on desktop and are included only when non-empty).
 */
export function convertChromeBookmarks(raw: unknown): ChromeBookmarkNode[] {
  const roots = (raw as { roots?: Record<string, unknown> } | null)?.roots;
  if (!roots || typeof roots !== "object") return [];

  const out: ChromeBookmarkNode[] = [];
  const wanted: Array<[key: string, label: string]> = [
    ["bookmark_bar", "ブックマークバー"],
    ["other", "その他のブックマーク"],
    ["synced", "モバイルのブックマーク"],
  ];
  for (const [key, label] of wanted) {
    const node = convertNode((roots[key] ?? {}) as RawNode);
    if (node?.children && (key !== "synced" || node.children.length > 0)) {
      out.push({ ...node, name: label });
    }
  }
  return out;
}

/** Extract `{ id, name }` per profile from Chrome's Local State JSON. */
export function parseProfileNames(raw: unknown): Map<string, string> {
  const cache = (
    raw as { profile?: { info_cache?: Record<string, { name?: unknown }> } } | null
  )?.profile?.info_cache;
  const out = new Map<string, string>();
  if (!cache || typeof cache !== "object") return out;
  for (const [id, info] of Object.entries(cache)) {
    out.set(id, typeof info?.name === "string" && info.name ? info.name : id);
  }
  return out;
}
