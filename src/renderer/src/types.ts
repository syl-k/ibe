export type Kind = "browser" | "terminal";

export interface LeafNode {
  type: "leaf";
  id: string;
  kind: Kind;
  /** last-known url (browser panes only) */
  url: string;
  /** pty session ids in this pane (terminal panes only; ≥1) */
  sessions?: string[];
  /** which session is shown (terminal panes only) */
  activeSessionId?: string;
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
