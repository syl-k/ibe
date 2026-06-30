/**
 * M0 prototype — renderer (self-contained, no imports; uses ibe bridge).
 *
 * Owns the recursive split layout (binary tree). Browser leaves are rendered as
 * empty placeholders; the real web content is a native WebContentsView in the
 * main process, positioned to match each placeholder's bounding rect. The whole
 * point of M0 is to prove that overlay + resize stay pixel-synced.
 */

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface BrowserState {
  id: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
}
interface IbeApi {
  createBrowser(id: string, url: string): Promise<void>;
  setBounds(id: string, b: Bounds): Promise<void>;
  navigate(id: string, url: string): Promise<void>;
  goBack(id: string): Promise<void>;
  goForward(id: string): Promise<void>;
  reload(id: string): Promise<void>;
  destroy(id: string): Promise<void>;
  onState(cb: (s: BrowserState) => void): void;
}

// The preload bridge. `contextBridge.exposeInMainWorld("ibe", ...)` defines a
// non-configurable global `ibe`; a classic script's top-level `const ibe` would
// collide with it ("already declared"), so we alias under a different name.
const bridge: IbeApi = (window as unknown as { ibe: IbeApi }).ibe;

type Kind = "browser" | "terminal";

interface LeafNode {
  type: "leaf";
  id: string;
  kind: Kind;
  url: string; // last-known url (browser only)
}
interface SplitNode {
  type: "split";
  dir: "row" | "col";
  ratio: number; // fraction given to the first child (0..1)
  children: [LayoutNode, LayoutNode];
}
type LayoutNode = LeafNode | SplitNode;

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

let nextId = 1;
function makeId(): string {
  return `pane-${nextId++}`;
}

function leaf(kind: Kind, url = "about:blank"): LeafNode {
  return { type: "leaf", id: makeId(), kind, url };
}

// Default layout = the 4-pane use case from the spec:
// left column = 2 browsers stacked, right column = 2 terminals stacked.
let root: LayoutNode = {
  type: "split",
  dir: "row",
  ratio: 0.5,
  children: [
    {
      type: "split",
      dir: "col",
      ratio: 0.5,
      children: [
        leaf("browser", "https://example.com"),
        leaf("browser", "https://www.wikipedia.org"),
      ],
    },
    {
      type: "split",
      dir: "col",
      ratio: 0.5,
      children: [leaf("terminal"), leaf("terminal")],
    },
  ],
};

let focusedId: string | null = null;
const activeBrowserIds = new Set<string>();
const lastSentBounds = new Map<string, string>();

const rootEl = document.getElementById("root") as HTMLDivElement;
const hudStats = document.getElementById("hud-stats") as HTMLSpanElement;

// ---------------------------------------------------------------------------
// tree helpers
// ---------------------------------------------------------------------------

function findLeaf(node: LayoutNode, id: string): LeafNode | null {
  if (node.type === "leaf") return node.id === id ? node : null;
  return findLeaf(node.children[0], id) ?? findLeaf(node.children[1], id);
}

/** Replace the leaf `id` in the tree by running `fn` on it; returns new subtree. */
function transform(
  node: LayoutNode,
  id: string,
  fn: (l: LeafNode) => LayoutNode
): LayoutNode {
  if (node.type === "leaf") return node.id === id ? fn(node) : node;
  return {
    ...node,
    children: [
      transform(node.children[0], id, fn),
      transform(node.children[1], id, fn),
    ],
  };
}

/** Remove the leaf `id`; the sibling takes over the parent's space. */
function removeLeaf(node: LayoutNode, id: string): LayoutNode | null {
  if (node.type === "leaf") return node.id === id ? null : node;
  const a = removeLeaf(node.children[0], id);
  const b = removeLeaf(node.children[1], id);
  if (a === null) return b;
  if (b === null) return a;
  return { ...node, children: [a, b] };
}

function collectLeaves(node: LayoutNode, out: LeafNode[] = []): LeafNode[] {
  if (node.type === "leaf") out.push(node);
  else {
    collectLeaves(node.children[0], out);
    collectLeaves(node.children[1], out);
  }
  return out;
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

function splitPane(id: string, dir: "row" | "col"): void {
  root = transform(root, id, (l) => ({
    type: "split",
    dir,
    ratio: 0.5,
    children: [l, leaf(l.kind, l.url)],
  }));
  render();
}

function closePane(id: string): void {
  const next = removeLeaf(root, id);
  if (next === null) return; // never empty the whole window in M0
  root = next;
  if (focusedId === id) focusedId = null;
  render();
}

function toggleKind(id: string): void {
  root = transform(root, id, (l) => ({
    ...l,
    kind: l.kind === "browser" ? "terminal" : "browser",
    id: makeId(), // new identity so view lifecycle is unambiguous
  }));
  render();
}

function setUrl(id: string, url: string): void {
  const l = findLeaf(root, id);
  if (l) l.url = url;
  bridge.navigate(id, url);
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

function render(): void {
  rootEl.innerHTML = "";
  rootEl.appendChild(renderNode(root));
  reconcileBrowserViews();
  syncAllBounds();
  updateHud();
}

function renderNode(node: LayoutNode): HTMLElement {
  if (node.type === "leaf") return renderLeaf(node);

  const el = document.createElement("div");
  el.className = `split ${node.dir}`;

  const first = document.createElement("div");
  first.className = "split-child";
  first.style.flex = `${node.ratio} 1 0`;
  first.appendChild(renderNode(node.children[0]));

  const resizer = document.createElement("div");
  resizer.className = "resizer";
  attachResizer(resizer, node, el);

  const second = document.createElement("div");
  second.className = "split-child";
  second.style.flex = `${1 - node.ratio} 1 0`;
  second.appendChild(renderNode(node.children[1]));

  el.append(first, resizer, second);
  return el;
}

function renderLeaf(node: LeafNode): HTMLElement {
  const pane = document.createElement("div");
  pane.className = "pane" + (node.id === focusedId ? " focused" : "");
  pane.dataset.id = node.id;
  pane.addEventListener("mousedown", () => {
    focusedId = node.id;
    document
      .querySelectorAll(".pane.focused")
      .forEach((p) => p.classList.remove("focused"));
    pane.classList.add("focused");
  });

  pane.appendChild(
    node.kind === "browser" ? browserToolbar(node) : terminalToolbar(node)
  );

  const content = document.createElement("div");
  content.className = "content";
  content.dataset.contentFor = node.id;

  if (node.kind === "browser") {
    const ph = document.createElement("div");
    ph.className = "browser-placeholder";
    ph.textContent = "↑ loading web content (native overlay)";
    content.appendChild(ph);
  } else {
    const ph = document.createElement("div");
    ph.className = "terminal-placeholder";
    ph.textContent = `${node.id} $ # terminal placeholder (M2: node-pty + xterm.js)\n`;
    content.appendChild(ph);
  }

  pane.appendChild(content);
  return pane;
}

function btn(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.title = title;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function browserToolbar(node: LeafNode): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "toolbar";

  bar.appendChild(btn("←", "戻る", () => bridge.goBack(node.id)));
  bar.appendChild(btn("→", "進む", () => bridge.goForward(node.id)));
  bar.appendChild(btn("⟳", "リロード", () => bridge.reload(node.id)));

  const address = document.createElement("input");
  address.className = "addressbar";
  address.value = node.url;
  address.dataset.addressFor = node.id;
  address.spellcheck = false;
  address.addEventListener("mousedown", (e) => e.stopPropagation());
  address.addEventListener("keydown", (e) => {
    if (e.key === "Enter") setUrl(node.id, normalizeUrl(address.value));
  });
  bar.appendChild(address);

  bar.appendChild(btn("T", "ターミナルに切替", () => toggleKind(node.id)));
  appendSplitButtons(bar, node.id);
  return bar;
}

function terminalToolbar(node: LeafNode): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "toolbar";
  const kind = document.createElement("span");
  kind.className = "kind";
  kind.textContent = `⌘ terminal · ${node.id}`;
  bar.appendChild(kind);
  const spacer = document.createElement("div");
  spacer.className = "spacer";
  bar.appendChild(spacer);
  bar.appendChild(btn("B", "ブラウザに切替", () => toggleKind(node.id)));
  appendSplitButtons(bar, node.id);
  return bar;
}

function appendSplitButtons(bar: HTMLElement, id: string): void {
  bar.appendChild(btn("▥", "左右に分割", () => splitPane(id, "row")));
  bar.appendChild(btn("▤", "上下に分割", () => splitPane(id, "col")));
  bar.appendChild(btn("✕", "ペインを閉じる", () => closePane(id)));
}

function normalizeUrl(input: string): string {
  const v = input.trim();
  if (!v) return "about:blank";
  if (/^[a-z]+:\/\//i.test(v) || v.startsWith("about:")) return v;
  if (/^[\w-]+(\.[\w-]+)+/.test(v)) return `https://${v}`;
  return `https://www.google.com/search?q=${encodeURIComponent(v)}`;
}

// ---------------------------------------------------------------------------
// resizer drag — adjusts ratio live and keeps overlays synced every frame
// ---------------------------------------------------------------------------

function attachResizer(
  resizer: HTMLElement,
  node: SplitNode,
  container: HTMLElement
): void {
  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    resizer.classList.add("dragging");

    let raf = 0;
    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      let r =
        node.dir === "row"
          ? (ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top) / rect.height;
      r = Math.max(0.05, Math.min(0.95, r));
      node.ratio = r;

      const first = container.children[0] as HTMLElement;
      const second = container.children[2] as HTMLElement;
      first.style.flex = `${r} 1 0`;
      second.style.flex = `${1 - r} 1 0`;

      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        syncAllBounds();
      });
    };
    const onUp = () => {
      resizer.classList.remove("dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (raf) cancelAnimationFrame(raf);
      syncAllBounds();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

// ---------------------------------------------------------------------------
// view lifecycle + bounds sync (the actual M0 validation)
// ---------------------------------------------------------------------------

function reconcileBrowserViews(): void {
  const leaves = collectLeaves(root);
  const current = new Set(
    leaves.filter((l) => l.kind === "browser").map((l) => l.id)
  );

  // create new browser views
  for (const l of leaves) {
    if (l.kind === "browser" && !activeBrowserIds.has(l.id)) {
      bridge.createBrowser(l.id, l.url);
      activeBrowserIds.add(l.id);
    }
  }
  // destroy views whose leaf is gone (or turned into a terminal)
  for (const id of [...activeBrowserIds]) {
    if (!current.has(id)) {
      bridge.destroy(id);
      activeBrowserIds.delete(id);
      lastSentBounds.delete(id);
    }
  }
}

function syncAllBounds(): void {
  for (const id of activeBrowserIds) {
    const content = document.querySelector(
      `.content[data-content-for="${id}"]`
    ) as HTMLElement | null;
    if (!content) continue;
    const r = content.getBoundingClientRect();
    const bounds = {
      x: r.left,
      y: r.top,
      width: r.width,
      height: r.height,
    };
    // skip redundant IPC when nothing moved
    const key = `${Math.round(bounds.x)},${Math.round(bounds.y)},${Math.round(
      bounds.width
    )},${Math.round(bounds.height)}`;
    if (lastSentBounds.get(id) === key) continue;
    lastSentBounds.set(id, key);
    bridge.setBounds(id, bounds);
  }
}

function updateHud(): void {
  const leaves = collectLeaves(root);
  const browsers = leaves.filter((l) => l.kind === "browser").length;
  const terms = leaves.length - browsers;
  hudStats.textContent = `${leaves.length} panes · ${browsers} browser · ${terms} term`;
}

// ---------------------------------------------------------------------------
// wiring
// ---------------------------------------------------------------------------

bridge.onState((s) => {
  const l = findLeaf(root, s.id);
  if (l) l.url = s.url;
  const address = document.querySelector(
    `.addressbar[data-address-for="${s.id}"]`
  ) as HTMLInputElement | null;
  if (address && document.activeElement !== address) address.value = s.url;
});

window.addEventListener("resize", syncAllBounds);

// re-sync on any layout reflow (font load, scrollbar, etc.)
const ro = new ResizeObserver(() => syncAllBounds());
ro.observe(rootEl);

render();
