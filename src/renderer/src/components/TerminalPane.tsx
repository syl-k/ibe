import type { LeafNode } from "../types";
import { PaneActions } from "./PaneActions";

export function TerminalPane({ node }: { node: LeafNode }) {
  return (
    <>
      <div className="toolbar" onMouseDown={(e) => e.stopPropagation()}>
        <span className="kind">⌘ terminal · {node.id}</span>
        <span className="spacer" />
        <PaneActions id={node.id} toggleLabel="B" toggleTitle="ブラウザに切替" />
      </div>
      <div className="content terminal-content">
        {node.id} $ # terminal placeholder (M2: node-pty + xterm.js)
      </div>
    </>
  );
}
