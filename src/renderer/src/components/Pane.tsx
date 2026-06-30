import type { LeafNode } from "../types";
import { useStore } from "../store";
import { BrowserPane } from "./BrowserPane";
import { TerminalPane } from "./TerminalPane";

export function Pane({ node }: { node: LeafNode }) {
  const focusedPaneId = useStore((s) => s.focusedPaneId);
  const focusPane = useStore((s) => s.focusPane);
  const focused = node.id === focusedPaneId;

  return (
    <div
      className={`pane${focused ? " focused" : ""}`}
      onMouseDown={() => focusPane(node.id)}
    >
      {node.kind === "browser" ? (
        <BrowserPane node={node} />
      ) : (
        <TerminalPane node={node} />
      )}
    </div>
  );
}
