export type Kind = "browser" | "terminal";

export interface LeafNode {
  type: "leaf";
  id: string;
  kind: Kind;
  /** last-known url (browser panes only) */
  url: string;
}

export interface SplitNode {
  type: "split";
  id: string;
  dir: "row" | "col";
  /** fraction of space given to the first child (0..1) */
  ratio: number;
  children: [LayoutNode, LayoutNode];
}

export type LayoutNode = LeafNode | SplitNode;

export interface Tab {
  id: string;
  title: string;
  root: LayoutNode;
}
