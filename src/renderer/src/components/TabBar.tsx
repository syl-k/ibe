import { useStore } from "../store";

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const addTab = useStore((s) => s.addTab);
  const closeTab = useStore((s) => s.closeTab);

  return (
    <div className="tabbar">
      <div className="tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab${t.id === activeTabId ? " active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="tab-title">{t.title}</span>
            {tabs.length > 1 && (
              <button
                className="tab-close"
                title="タブを閉じる"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button className="tab-add" title="新しいワークスペース (⌘T)" onClick={addTab}>
          ＋
        </button>
      </div>
    </div>
  );
}
