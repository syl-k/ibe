import { create } from "zustand";
import type { Bookmark, BrowserState, ChromeBookmarkNode } from "../../shared/ipc";
import type { LayoutNode, Tab } from "./types";
import {
  collectLeaves,
  findLeaf,
  leaf,
  makeId,
  removeLeaf,
  reseedCounter,
  setSplitRatio,
  split,
  transformLeaf,
} from "./tree";

function defaultTab(title: string): Tab {
  // The spec's 4-pane example: left = 2 browsers, right = 2 terminals.
  const root: LayoutNode = {
    type: "split",
    id: makeId("split"),
    dir: "row",
    ratio: 0.5,
    children: [
      {
        type: "split",
        id: makeId("split"),
        dir: "col",
        ratio: 0.5,
        children: [
          leaf("browser", "https://www.google.com"),
          leaf("browser", "https://www.google.com"),
        ],
      },
      {
        type: "split",
        id: makeId("split"),
        dir: "col",
        ratio: 0.5,
        children: [leaf("terminal"), leaf("terminal")],
      },
    ],
  };
  return { id: makeId("tab"), title, root };
}

function blankTab(title: string): Tab {
  return { id: makeId("tab"), title, root: leaf("browser", "https://www.google.com") };
}

/** Live browser chrome state for one pane (not part of the layout tree). */
export interface BrowserViewState {
  title: string;
  loading: boolean;
  favicon?: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

interface State {
  tabs: Tab[];
  activeTabId: string;
  focusedPaneId: string | null;
  /** per-pane live browser state, keyed by pane id */
  viewState: Record<string, BrowserViewState>;
  /** persisted bookmarks (mirrored from main) */
  bookmarks: Bookmark[];
  /** pane whose omnibox dropdown is open; its native view is retracted */
  omniboxPaneId: string | null;
  /** settings modal open; all native browser views are retracted while true */
  settingsOpen: boolean;
  /** read-only mirror of the configured Chrome profile's bookmark tree */
  chromeBookmarks: ChromeBookmarkNode[];
  /** Chrome bookmarks dropdown open; native views retracted while true */
  chromeMenuOpen: boolean;

  setActiveTab: (id: string) => void;
  setBookmarks: (b: Bookmark[]) => void;
  setOmnibox: (id: string | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setChromeBookmarks: (tree: ChromeBookmarkNode[]) => void;
  setChromeMenuOpen: (open: boolean) => void;
  addTab: () => void;
  closeTab: (id: string) => void;
  nextTab: (delta: number) => void;

  focusPane: (id: string) => void;
  splitPane: (id: string, dir: "row" | "col") => void;
  closePane: (id: string) => void;
  toggleKind: (id: string) => void;
  setRatio: (splitId: string, ratio: number) => void;
  setUrl: (paneId: string, url: string) => void;
  /** apply a BrowserState update from main (url + live chrome state) */
  applyBrowserState: (s: BrowserState) => void;
  /** open `url` in a new browser pane split off from `fromId` */
  openInNewPane: (fromId: string, url: string) => void;
  /** open `url` as the sole browser pane of a new workspace tab */
  openInNewTab: (url: string) => void;

  addSession: (paneId: string) => void;
  closeSession: (paneId: string, sessionId: string) => void;
  setActiveSession: (paneId: string, sessionId: string) => void;
  /** switch to the tab/pane owning `sessionId` and make it the active session */
  revealSession: (sessionId: string) => void;

  /** editor pane: set the opened folder (resets open file tabs) */
  setEditorFolder: (paneId: string, folder: string) => void;
  /** editor pane: open a file tab (or focus it if already open) */
  openEditorFile: (paneId: string, path: string) => void;
  /** editor pane: close a file tab; pane stays open even when empty */
  closeEditorFile: (paneId: string, path: string) => void;
  setActiveEditorFile: (paneId: string, path: string) => void;

  /** replace the layout from a persisted session (validated) */
  hydrate: (raw: unknown) => void;
}

const SESSION_VERSION = 1;

export interface PersistedSession {
  version: number;
  activeTabId: string;
  tabs: Tab[];
}

/** Drop live pty session ids before persisting (they don't survive a restart). */
function stripSessions(node: LayoutNode): LayoutNode {
  if (node.type === "leaf") {
    if (node.kind !== "terminal") return node;
    return { type: "leaf", id: node.id, kind: "terminal", url: node.url };
  }
  return {
    ...node,
    children: [stripSessions(node.children[0]), stripSessions(node.children[1])],
  };
}

/** Give every terminal leaf one fresh session (a new shell) after restore. */
function freshSessions(node: LayoutNode): LayoutNode {
  if (node.type === "leaf") {
    if (node.kind !== "terminal") return node;
    const session = makeId("sess");
    return { ...node, sessions: [session], activeSessionId: session };
  }
  return {
    ...node,
    children: [freshSessions(node.children[0]), freshSessions(node.children[1])],
  };
}

/** Serialize the persistable slice of the store (layout + active tab). */
export function serializeSession(s: State): PersistedSession {
  return {
    version: SESSION_VERSION,
    activeTabId: s.activeTabId,
    tabs: s.tabs.map((t) => ({ ...t, root: stripSessions(t.root) })),
  };
}

function isLayoutNode(n: unknown): n is LayoutNode {
  if (!n || typeof n !== "object") return false;
  const node = n as { type?: unknown };
  if (node.type === "leaf") {
    const l = n as { id?: unknown; kind?: unknown };
    return (
      typeof l.id === "string" &&
      (l.kind === "browser" || l.kind === "terminal" || l.kind === "editor")
    );
  }
  if (node.type === "split") {
    const sp = n as { id?: unknown; children?: unknown };
    return (
      typeof sp.id === "string" &&
      Array.isArray(sp.children) &&
      sp.children.length === 2 &&
      isLayoutNode(sp.children[0]) &&
      isLayoutNode(sp.children[1])
    );
  }
  return false;
}

/** Sessions shown on-screen for a tree: each terminal pane's active session. */
export function visibleTerminalSessions(node: LayoutNode): string[] {
  if (node.type === "leaf") {
    if (node.kind !== "terminal") return [];
    const sid = node.activeSessionId ?? node.sessions?.[0];
    return sid ? [sid] : [];
  }
  return [
    ...visibleTerminalSessions(node.children[0]),
    ...visibleTerminalSessions(node.children[1]),
  ];
}

/** Pane id of the terminal leaf that owns `sessionId`, across a whole tree. */
function findSessionPane(node: LayoutNode, sessionId: string): string | null {
  if (node.type === "leaf") {
    return node.kind === "terminal" && node.sessions?.includes(sessionId)
      ? node.id
      : null;
  }
  return (
    findSessionPane(node.children[0], sessionId) ??
    findSessionPane(node.children[1], sessionId)
  );
}

function collectIds(node: LayoutNode, out: string[]): void {
  out.push(node.id);
  if (node.type === "split") {
    collectIds(node.children[0], out);
    collectIds(node.children[1], out);
  }
}

/** Apply `fn` to the active tab's root, producing a new tabs array. */
function withActiveRoot(
  state: State,
  fn: (root: LayoutNode) => LayoutNode | null
): Partial<State> {
  const tabs = state.tabs.map((t) => {
    if (t.id !== state.activeTabId) return t;
    const root = fn(t.root);
    return root ? { ...t, root } : t;
  });
  return { tabs };
}

const first = defaultTab("Workspace 1");

export const useStore = create<State>((set, get) => ({
  tabs: [first],
  activeTabId: first.id,
  focusedPaneId: null,
  viewState: {},
  bookmarks: [],
  omniboxPaneId: null,
  settingsOpen: false,
  chromeBookmarks: [],
  chromeMenuOpen: false,

  setActiveTab: (id) => set({ activeTabId: id }),
  setBookmarks: (b) => set({ bookmarks: b }),
  setOmnibox: (id) => set({ omniboxPaneId: id }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setChromeBookmarks: (tree) => set({ chromeBookmarks: tree }),
  setChromeMenuOpen: (open) => set({ chromeMenuOpen: open }),

  addTab: () => {
    const tab = blankTab(`Workspace ${get().tabs.length + 1}`);
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  closeTab: (id) =>
    set((s) => {
      if (s.tabs.length === 1) return s; // keep at least one tab
      const idx = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeTabId =
        s.activeTabId === id
          ? tabs[Math.min(idx, tabs.length - 1)].id
          : s.activeTabId;
      return { tabs, activeTabId };
    }),

  nextTab: (delta) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === s.activeTabId);
      const next = (idx + delta + s.tabs.length) % s.tabs.length;
      return { activeTabId: s.tabs[next].id };
    }),

  focusPane: (id) => set({ focusedPaneId: id }),

  splitPane: (id, dir) =>
    set((s) =>
      withActiveRoot(s, (root) =>
        transformLeaf(root, id, (l) => split(l, dir))
      )
    ),

  closePane: (id) =>
    set((s) => {
      const patch = withActiveRoot(s, (root) => removeLeaf(root, id));
      return {
        ...patch,
        focusedPaneId: s.focusedPaneId === id ? null : s.focusedPaneId,
      };
    }),

  toggleKind: (id) =>
    set((s) =>
      withActiveRoot(s, (root) =>
        // fresh leaf -> clean view/pty lifecycle and correct per-kind fields
        transformLeaf(root, id, (l) =>
          leaf(
            l.kind === "browser"
              ? "terminal"
              : l.kind === "terminal"
                ? "editor"
                : "browser",
            l.url
          )
        )
      )
    ),

  addSession: (paneId) =>
    set((s) =>
      withActiveRoot(s, (root) =>
        transformLeaf(root, paneId, (l) => {
          if (l.kind !== "terminal") return l;
          const session = makeId("sess");
          return {
            ...l,
            sessions: [...(l.sessions ?? []), session],
            activeSessionId: session,
          };
        })
      )
    ),

  closeSession: (paneId, sessionId) =>
    set((s) => {
      const leafNode = findLeaf(
        s.tabs.find((t) => t.id === s.activeTabId)!.root,
        paneId
      );
      const remaining = (leafNode?.sessions ?? []).filter((x) => x !== sessionId);
      // closing the last session closes the whole pane
      if (remaining.length === 0) {
        return withActiveRoot(s, (root) => removeLeaf(root, paneId));
      }
      return withActiveRoot(s, (root) =>
        transformLeaf(root, paneId, (l) => ({
          ...l,
          sessions: remaining,
          activeSessionId:
            l.activeSessionId === sessionId ? remaining[0] : l.activeSessionId,
        }))
      );
    }),

  setActiveSession: (paneId, sessionId) =>
    set((s) =>
      withActiveRoot(s, (root) =>
        transformLeaf(root, paneId, (l) => ({ ...l, activeSessionId: sessionId }))
      )
    ),

  setEditorFolder: (paneId, folder) =>
    set((s) =>
      withActiveRoot(s, (root) =>
        transformLeaf(root, paneId, (l) => ({
          ...l,
          folder,
          files: [],
          activeFile: undefined,
        }))
      )
    ),

  openEditorFile: (paneId, path) =>
    set((s) =>
      withActiveRoot(s, (root) =>
        transformLeaf(root, paneId, (l) => {
          const files = l.files ?? [];
          return {
            ...l,
            files: files.includes(path) ? files : [...files, path],
            activeFile: path,
          };
        })
      )
    ),

  closeEditorFile: (paneId, path) =>
    set((s) =>
      withActiveRoot(s, (root) =>
        transformLeaf(root, paneId, (l) => {
          const files = (l.files ?? []).filter((f) => f !== path);
          return {
            ...l,
            files,
            activeFile:
              l.activeFile === path ? files[files.length - 1] : l.activeFile,
          };
        })
      )
    ),

  setActiveEditorFile: (paneId, path) =>
    set((s) =>
      withActiveRoot(s, (root) =>
        transformLeaf(root, paneId, (l) => ({ ...l, activeFile: path }))
      )
    ),

  revealSession: (sessionId) =>
    set((s) => {
      for (const t of s.tabs) {
        const paneId = findSessionPane(t.root, sessionId);
        if (!paneId) continue;
        // switch to that tab, focus the pane, and show the right session
        return {
          activeTabId: t.id,
          focusedPaneId: paneId,
          tabs: s.tabs.map((tab) =>
            tab.id === t.id
              ? {
                  ...tab,
                  root: transformLeaf(tab.root, paneId, (l) => ({
                    ...l,
                    activeSessionId: sessionId,
                  })),
                }
              : tab
          ),
        };
      }
      return s; // session no longer exists (pane closed) — do nothing
    }),

  hydrate: (raw) => {
    const data = raw as Partial<PersistedSession> | null;
    if (
      !data ||
      data.version !== SESSION_VERSION ||
      !Array.isArray(data.tabs) ||
      data.tabs.length === 0 ||
      typeof data.activeTabId !== "string"
    ) {
      return; // missing / unknown schema -> keep the default layout
    }

    // validate each tab; bail entirely on anything malformed
    const raws = data.tabs as unknown[];
    const valid: Tab[] = [];
    for (const t of raws) {
      const tab = t as { id?: unknown; title?: unknown; root?: unknown };
      if (typeof tab.id !== "string" || !isLayoutNode(tab.root)) return;
      valid.push({
        id: tab.id,
        title: typeof tab.title === "string" ? tab.title : "Workspace",
        root: tab.root,
      });
    }

    // reseed the id counter past restored ids, then mint fresh terminal sessions
    const ids: string[] = [];
    for (const t of valid) {
      ids.push(t.id);
      collectIds(t.root, ids);
    }
    reseedCounter(ids);

    const tabs = valid.map((t) => ({ ...t, root: freshSessions(t.root) }));
    const activeTabId = tabs.some((t) => t.id === data.activeTabId)
      ? data.activeTabId
      : tabs[0].id;

    set({ tabs, activeTabId, focusedPaneId: null, viewState: {}, omniboxPaneId: null });
  },

  setRatio: (splitId, ratio) =>
    set((s) => withActiveRoot(s, (root) => setSplitRatio(root, splitId, ratio))),

  setUrl: (paneId, url) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (!findLeaf(t.root, paneId)) return t;
        return {
          ...t,
          root: transformLeaf(t.root, paneId, (l) => ({ ...l, url })),
        };
      }),
    })),

  applyBrowserState: (bs) =>
    set((s) => ({
      viewState: {
        ...s.viewState,
        [bs.id]: {
          title: bs.title,
          loading: bs.loading,
          favicon: bs.favicon || undefined,
          canGoBack: bs.canGoBack,
          canGoForward: bs.canGoForward,
        },
      },
      // keep the layout's url in sync (address bar + future persistence)
      tabs: s.tabs.map((t) =>
        findLeaf(t.root, bs.id)
          ? { ...t, root: transformLeaf(t.root, bs.id, (l) => ({ ...l, url: bs.url })) }
          : t
      ),
    })),

  openInNewTab: (url) =>
    set((s) => {
      const tab: Tab = {
        id: makeId("tab"),
        title: `Workspace ${s.tabs.length + 1}`,
        root: leaf("browser", url),
      };
      return { tabs: [...s.tabs, tab], activeTabId: tab.id };
    }),

  openInNewPane: (fromId, url) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        findLeaf(t.root, fromId)
          ? {
              ...t,
              root: transformLeaf(t.root, fromId, (l) => ({
                type: "split",
                id: makeId("split"),
                dir: "row",
                ratio: 0.5,
                children: [l, leaf("browser", url)],
              })),
            }
          : t
      ),
    })),
}));

/** All browser leaves across every tab, with the tab they belong to. */
export function browserLeavesByTab(
  tabs: Tab[]
): Array<{ id: string; url: string; tabId: string }> {
  const out: Array<{ id: string; url: string; tabId: string }> = [];
  for (const t of tabs) {
    for (const l of collectLeaves(t.root)) {
      if (l.kind === "browser") out.push({ id: l.id, url: l.url, tabId: t.id });
    }
  }
  return out;
}
