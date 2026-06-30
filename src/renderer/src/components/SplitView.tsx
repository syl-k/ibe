import { useRef } from "react";
import type { LayoutNode, SplitNode } from "../types";
import { useStore } from "../store";
import { requestBoundsSync } from "../boundsSync";
import { Pane } from "./Pane";

export function SplitView({ node }: { node: LayoutNode }) {
  if (node.type === "leaf") return <Pane node={node} />;
  return <Split node={node} />;
}

function Split({ node }: { node: SplitNode }) {
  const setRatio = useStore((s) => s.setRatio);
  const containerRef = useRef<HTMLDivElement>(null);

  const onResizerDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;

    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      let r =
        node.dir === "row"
          ? (ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top) / rect.height;
      r = Math.max(0.05, Math.min(0.95, r));
      setRatio(node.id, r);
      requestBoundsSync();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("resizing");
      requestBoundsSync();
    };
    document.body.classList.add("resizing");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div ref={containerRef} className={`split ${node.dir}`}>
      <div className="split-child" style={{ flex: `${node.ratio} 1 0` }}>
        <SplitView node={node.children[0]} />
      </div>
      <div
        className={`resizer ${node.dir}`}
        onMouseDown={onResizerDown}
        role="separator"
        aria-orientation={node.dir === "row" ? "vertical" : "horizontal"}
      />
      <div className="split-child" style={{ flex: `${1 - node.ratio} 1 0` }}>
        <SplitView node={node.children[1]} />
      </div>
    </div>
  );
}
