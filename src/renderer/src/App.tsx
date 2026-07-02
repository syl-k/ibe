import { useEffect, useLayoutEffect, useRef } from "react";
import { useStore, visibleTerminalSessions } from "./store";
import { collectLeaves } from "./tree";
import { useBrowserViews } from "./hooks/useBrowserViews";
import { useTerminals } from "./hooks/useTerminals";
import { registerBoundsRunner, requestBoundsSync } from "./boundsSync";
import { TabBar } from "./components/TabBar";
import { BookmarksBar } from "./components/BookmarksBar";
import { SplitView } from "./components/SplitView";
import { SettingsModal } from "./components/SettingsModal";
import { saveActiveEditorFile } from "./components/EditorPane";
import { useEditorBuffers } from "./editorBuffers";
import { useSettings } from "./settings";

const ibe = window.ibe;

export function App() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const omniboxPaneId = useStore((s) => s.omniboxPaneId);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const chromeMenuOpen = useStore((s) => s.chromeMenuOpen);
  const activeTab = tabs.find((t) => t.id === activeTabId)!;
  const workspaceRef = useRef<HTMLDivElement>(null);

  const syncBounds = useBrowserViews(
    tabs,
    activeTabId,
    omniboxPaneId,
    settingsOpen || chromeMenuOpen
  );
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

  // settings: initial load + live updates from main
  useEffect(() => {
    ibe.settings.load().then((s) => useSettings.getState().replace(s));
    return ibe.settings.onChange((s) => useSettings.getState().replace(s));
  }, []);

  // Chrome bookmarks: (re)load whenever the configured profile changes, and
  // follow disk changes (Chrome's own sync keeps that file current).
  useEffect(() => {
    let current = "";
    const apply = (profile: string) => {
      if (profile === current) return;
      current = profile;
      if (!profile) return useStore.getState().setChromeBookmarks([]);
      ibe.chromeBookmarks
        .get(profile)
        .then((tree) => useStore.getState().setChromeBookmarks(tree));
    };
    apply(useSettings.getState().settings.chromeProfile);
    const offSettings = useSettings.subscribe((s) =>
      apply(s.settings.chromeProfile)
    );
    const offChange = ibe.chromeBookmarks.onChange((tree) =>
      useStore.getState().setChromeBookmarks(tree)
    );
    return () => {
      offSettings();
      offChange();
    };
  }, []);

  // a browser view gaining focus makes it the focused pane
  useEffect(() => ibe.onFocusPane((id) => useStore.getState().focusPane(id)), []);

  // clicking a terminal notification reveals that session's tab/pane
  useEffect(
    () => ibe.onNotifyActivate((sid) => useStore.getState().revealSession(sid)),
    []
  );

  // tell main which terminal sessions are on-screen (active tab, each terminal
  // pane's shown session) so it suppresses notifications only for those.
  useEffect(() => {
    let last = "";
    const push = (s: ReturnType<typeof useStore.getState>) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      const ids = tab ? visibleTerminalSessions(tab.root) : [];
      const key = ids.join(",");
      if (key !== last) {
        last = key;
        ibe.term.setVisibleSessions(ids);
      }
    };
    push(useStore.getState());
    return useStore.subscribe(push);
  }, []);

  // shortcuts arrive from the native app menu (they fire even when a web pane
  // holds keyboard focus). Resolve pane-relative actions against the store.
  useEffect(
    () =>
      ibe.onShortcut((action) => {
        const st = useStore.getState();
        const tab = st.tabs.find((t) => t.id === st.activeTabId);
        if (!tab) return;
        const leaves = collectLeaves(tab.root);
        // the focused pane if it's on the active tab, else the first leaf
        const target =
          leaves.find((l) => l.id === st.focusedPaneId) ?? leaves[0];

        switch (action) {
          case "new-tab":
            return st.addTab();
          case "close-pane":
            // closing the tab's only pane closes the tab instead
            return leaves.length === 1
              ? st.closeTab(st.activeTabId)
              : st.closePane(target.id);
          case "close-tab":
            return st.closeTab(st.activeTabId);
          case "split-h":
            return st.splitPane(target.id, "row");
          case "split-v":
            return st.splitPane(target.id, "col");
          case "prev-tab":
            return st.nextTab(-1);
          case "next-tab":
            return st.nextTab(1);
          case "reload":
            if (target.kind === "browser") ibe.reload(target.id);
            return;
          case "focus-address": {
            if (target.kind !== "browser") return;
            const input = document.querySelector<HTMLInputElement>(
              `.addressbar[data-address-for="${target.id}"]`
            );
            input?.focus();
            input?.select();
            return;
          }
          case "open-settings":
            return st.setSettingsOpen(true);
          case "save-file":
            return void saveActiveEditorFile();
        }
      }),
    []
  );

  // drop buffers of editor panes that left the layout (close pane / close tab)
  useEffect(
    () =>
      useStore.subscribe((s) => {
        const alive = new Set<string>();
        for (const t of s.tabs) {
          for (const l of collectLeaves(t.root)) {
            if (l.kind === "editor") alive.add(l.id);
          }
        }
        const bufs = useEditorBuffers.getState();
        for (const paneId of Object.keys(bufs.buffers)) {
          if (!alive.has(paneId)) bufs.dropPane(paneId);
        }
      }),
    []
  );

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
      {settingsOpen && <SettingsModal />}
    </div>
  );
}
