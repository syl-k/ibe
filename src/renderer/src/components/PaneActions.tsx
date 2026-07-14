import { useStore } from "../store";

/** Shared split / toggle / close controls for a pane's toolbar. */
export function PaneActions({ id, toggleLabel, toggleTitle }: {
  id: string;
  toggleLabel: string;
  toggleTitle: string;
}) {
  const splitPane = useStore((s) => s.splitPane);
  const closePane = useStore((s) => s.closePane);
  const toggleKind = useStore((s) => s.toggleKind);

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <>
      <button title={toggleTitle} onClick={stop(() => toggleKind(id))}>
        {toggleLabel}
      </button>
      <button title="左右に分割" onClick={stop(() => splitPane(id, "row"))}>
        ▥
      </button>
      <button title="上下に分割" onClick={stop(() => splitPane(id, "col"))}>
        ▤
      </button>
      <button title="ペインを閉じる" onClick={stop(() => closePane(id))}>
        ✕
      </button>
    </>
  );
}
