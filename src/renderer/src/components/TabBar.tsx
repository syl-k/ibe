import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const addTab = useStore((s) => s.addTab);
  const closeTab = useStore((s) => s.closeTab);
  const renameTab = useStore((s) => s.renameTab);

  // tab id being renamed inline (double-click a tab title to start)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  const commit = () => {
    if (editingId) renameTab(editingId, draft);
    setEditingId(null);
  };

  return (
    <div className="tabbar">
      <div className="tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab${t.id === activeTabId ? " active" : ""}`}
            onClick={() => setActiveTab(t.id)}
            onDoubleClick={() => {
              setEditingId(t.id);
              setDraft(t.title);
            }}
          >
            {editingId === t.id ? (
              <input
                ref={inputRef}
                className="tab-rename"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  else if (e.key === "Escape") setEditingId(null);
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="tab-title" title="ダブルクリックで名前を変更">
                {t.title}
              </span>
            )}
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
