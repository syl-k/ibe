import { useEffect, useLayoutEffect, useRef } from "react";
import { useStore } from "./store";
import { collectLeaves } from "./tree";
import { useBrowserViews } from "./hooks/useBrowserViews";
import { useTerminals } from "./hooks/useTerminals";
import { registerBoundsRunner, requestBoundsSync } from "./boundsSync";
import { TabBar } from "./components/TabBar";
import { BookmarksBar } from "./components/BookmarksBar";
import { SplitView } from "./components/SplitView";

const ibe = window.ibe;

export function App() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId)!;
  const workspaceRef = useRef<HTMLDivElement>(null);

  const syncBounds = useBrowserViews(tabs, activeTabId);
  useTerminals(tabs);

  // make the rAF-coalesced trigger run our bounds sync
  useEffect(() => registerBoundsRunner(syncBounds), [syncBounds]);

  // re-sync synchronously whenever the active layout changes (split/resize/tab)
  useLayoutEffect(() => {
    syncBounds();
  }, [activeTab.root, activeTabId, syncBounds]);

  // re-sync on window / container resize
  useEffect(() => {
    const onResize = () => requestBoundsSync();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => requestBoundsSync());
    if (workspaceRef.current) ro.observe(workspaceRef.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, []);

  // reflect navigation / chrome state back into the store
  useEffect(() => ibe.onState((s) => useStore.getState().applyBrowserState(s)), []);

  // links that want a new window open in a new pane (in-app, not the OS browser)
  useEffect(
    () => ibe.onOpenNew((r) => useStore.getState().openInNewPane(r.fromId, r.url)),
    []
  );

  // bookmarks: initial load + live updates from main
  useEffect(() => {
    ibe.bookmarks.list().then((b) => useStore.getState().setBookmarks(b));
    return ibe.bookmarks.onChange((b) => useStore.getState().setBookmarks(b));
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      const st = useStore.getState();
      const focused = st.focusedPaneId;
      const isLeaf = (id: string | null) =>
        id != null && collectLeaves(activeTab.root).some((l) => l.id === id);

      if (e.key === "t") {
        e.preventDefault();
        st.addTab();
      } else if (e.key === "d" && isLeaf(focused)) {
        e.preventDefault();
        st.splitPane(focused!, e.shiftKey ? "col" : "row");
      } else if (e.key === "[") {
        e.preventDefault();
        st.nextTab(-1);
      } else if (e.key === "]") {
        e.preventDefault();
        st.nextTab(1);
      } else if (e.key === "l" && isLeaf(focused)) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          `.addressbar[data-address-for="${focused}"]`
        );
        input?.focus();
        input?.select();
      } else if (e.key === "r" && isLeaf(focused)) {
        e.preventDefault();
        ibe.reload(focused!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab.root]);

  const leaves = collectLeaves(activeTab.root);
  const browsers = leaves.filter((l) => l.kind === "browser").length;

  return (
    <div className="app">
      <TabBar />
      <BookmarksBar />
      <div className="workspace" ref={workspaceRef}>
        <SplitView node={activeTab.root} />
      </div>
      <div className="hud">
        <span className="hud-label">ibe</span>
        {leaves.length} panes · {browsers} browser · {leaves.length - browsers} term
        {" · "}
        {tabs.length} tab{tabs.length > 1 ? "s" : ""}
      </div>
    </div>
  );
}
