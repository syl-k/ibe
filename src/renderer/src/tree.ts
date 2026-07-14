import type { Kind, LayoutNode, LeafNode, SplitNode } from "./types";

let counter = 0;
export function makeId(prefix = "n"): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * Advance the id counter past any numeric suffix seen in `ids`, so ids minted
 * after restoring a persisted session can't collide with restored ones.
 */
export function reseedCounter(ids: Iterable<string>): void {
  let max = counter;
  for (const id of ids) {
    const m = /(\d+)$/.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  counter = max;
}

export function leaf(kind: Kind, url = "about:blank"): LeafNode {
  const base: LeafNode = { type: "leaf", id: makeId("pane"), kind, url };
  if (kind === "terminal") {
    const session = makeId("sess");
    base.sessions = [session];
    base.activeSessionId = session;
  }
  return base;
}

/** Find a leaf by id anywhere in the tree. */
export function findLeaf(node: LayoutNode, id: string): LeafNode | null {
  if (node.type === "leaf") return node.id === id ? node : null;
  return findLeaf(node.children[0], id) ?? findLeaf(node.children[1], id);
}

/** Replace the leaf `id` by running `fn` on it; returns a new tree (immutable). */
export function transformLeaf(
  node: LayoutNode,
  id: string,
  fn: (l: LeafNode) => LayoutNode
): LayoutNode {
  if (node.type === "leaf") return node.id === id ? fn(node) : node;
  return {
    ...node,
    children: [
      transformLeaf(node.children[0], id, fn),
      transformLeaf(node.children[1], id, fn),
    ],
  };
}

/** Remove the leaf `id`; its sibling takes over the parent's space. */
export function removeLeaf(node: LayoutNode, id: string): LayoutNode | null {
  if (node.type === "leaf") return node.id === id ? null : node;
  const a = removeLeaf(node.children[0], id);
  const b = removeLeaf(node.children[1], id);
  if (a === null) return b;
  if (b === null) return a;
  if (a === node.children[0] && b === node.children[1]) return node;
  return { ...node, children: [a, b] };
}

/** Set the ratio of the split `id`; returns a new tree. */
export function setSplitRatio(
  node: LayoutNode,
  id: string,
  ratio: number
): LayoutNode {
  if (node.type === "leaf") return node;
  if (node.id === id) return { ...node, ratio };
  return {
    ...node,
    children: [
      setSplitRatio(node.children[0], id, ratio),
      setSplitRatio(node.children[1], id, ratio),
    ],
  };
}

export function collectLeaves(node: LayoutNode, out: LeafNode[] = []): LeafNode[] {
  if (node.type === "leaf") out.push(node);
  else {
    collectLeaves(node.children[0], out);
    collectLeaves(node.children[1], out);
  }
  return out;
}

export function split(target: LeafNode, dir: SplitNode["dir"]): SplitNode {
  return {
    type: "split",
    id: makeId("split"),
    dir,
    ratio: 0.5,
    children: [target, leaf(target.kind, target.url)],
  };
}
