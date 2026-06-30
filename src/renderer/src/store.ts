import { create } from "zustand";
import type { LayoutNode, Tab } from "./types";
import {
  collectLeaves,
  findLeaf,
  leaf,
  makeId,
  removeLeaf,
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
          leaf("browser", "https://example.com"),
          leaf("browser", "https://www.wikipedia.org"),
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
  return { id: makeId("tab"), title, root: leaf("browser", "https://example.com") };
}

interface State {
  tabs: Tab[];
  activeTabId: string;
  focusedPaneId: string | null;

  setActiveTab: (id: string) => void;
  addTab: () => void;
  closeTab: (id: string) => void;
  nextTab: (delta: number) => void;

  focusPane: (id: string) => void;
  splitPane: (id: string, dir: "row" | "col") => void;
  closePane: (id: string) => void;
  toggleKind: (id: string) => void;
  setRatio: (splitId: string, ratio: number) => void;
  setUrl: (paneId: string, url: string) => void;

  addSession: (paneId: string) => void;
  closeSession: (paneId: string, sessionId: string) => void;
  setActiveSession: (paneId: string, sessionId: string) => void;
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

  setActiveTab: (id) => set({ activeTabId: id }),

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
          leaf(l.kind === "browser" ? "terminal" : "browser", l.url)
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
