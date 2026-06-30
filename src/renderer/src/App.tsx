import { useEffect, useLayoutEffect, useRef } from "react";
import { useStore } from "./store";
import { collectLeaves } from "./tree";
import { useBrowserViews } from "./hooks/useBrowserViews";
import { registerBoundsRunner, requestBoundsSync } from "./boundsSync";
import { TabBar } from "./components/TabBar";
import { SplitView } from "./components/SplitView";

const ibe = window.ibe;

export function App() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId)!;
  const workspaceRef = useRef<HTMLDivElement>(null);

  const syncBounds = useBrowserViews(tabs, activeTabId);

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

  // reflect navigation back into the store (address bar / titles)
  useEffect(() => ibe.onState((s) => useStore.getState().setUrl(s.id, s.url)), []);

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
