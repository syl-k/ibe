/** Shared IPC contract between main, preload and renderer. */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserState {
  id: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  /** favicon URL reported by the page, if any */
  favicon?: string;
}

/** A link/popup that wanted a new window; the renderer opens it in a new pane. */
export interface OpenNewRequest {
  /** the browser pane id the request originated from */
  fromId: string;
  url: string;
}

export interface Bookmark {
  url: string;
  title: string;
  favicon?: string;
  /** epoch ms when added */
  ts: number;
}

/** Persisted bookmarks, owned by the main process (userData/bookmarks.json). */
export interface BookmarksApi {
  list(): Promise<Bookmark[]>;
  add(entry: { url: string; title: string; favicon?: string }): Promise<void>;
  remove(url: string): Promise<void>;
  onChange(cb: (bookmarks: Bookmark[]) => void): () => void;
}

export interface HistoryEntry {
  url: string;
  title: string;
  /** epoch ms of the most recent visit */
  ts: number;
}

/** Visited-page history, owned by main (userData/history.json). */
export interface HistoryApi {
  /** url/title substring match, most-recent first, deduped by url */
  search(query: string, limit?: number): Promise<HistoryEntry[]>;
  recent(limit?: number): Promise<HistoryEntry[]>;
}

/**
 * Terminal (pty) control surface. The pty itself lives in the main process and
 * outlives renderer mounts: it is spawned on `create`, killed only on `destroy`
 * (when the pane leaves the layout), and survives tab switches. Main keeps a
 * capped scrollback buffer so a re-mounting terminal can `attach` and replay.
 */
export interface TerminalApi {
  /** Spawn the login shell for `id` if not already running (idempotent). */
  create(id: string, cols: number, rows: number): void;
  /** Begin live streaming to this renderer and replay the backlog. */
  attach(id: string): void;
  /** Stop live streaming (pty + buffer stay alive). */
  detach(id: string): void;
  input(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  /** Kill the pty and drop its buffer (pane removed from layout). */
  destroy(id: string): void;
  onData(id: string, cb: (data: string) => void): () => void;
  onExit(id: string, cb: (exitCode: number) => void): () => void;
}

/** The API the preload bridge exposes on `window.ibe`. */
export interface IbeApi {
  createBrowser(id: string, url: string): void;
  setBounds(id: string, bounds: Bounds): void;
  setVisible(id: string, visible: boolean): void;
  navigate(id: string, url: string): void;
  goBack(id: string): void;
  goForward(id: string): void;
  reload(id: string): void;
  stop(id: string): void;
  destroy(id: string): void;
  onState(cb: (state: BrowserState) => void): () => void;
  /** A browser pane asked to open a url in a new window → open it in a new pane. */
  onOpenNew(cb: (req: OpenNewRequest) => void): () => void;

  term: TerminalApi;
  bookmarks: BookmarksApi;
  history: HistoryApi;
}
