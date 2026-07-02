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

/**
 * App-menu accelerator actions. Routed through the native menu (not a renderer
 * keydown) so they fire even while a WebContentsView has keyboard focus. The
 * renderer resolves pane-relative actions against its own focusedPaneId.
 */
export type ShortcutAction =
  | "new-tab"
  | "close-pane"
  | "close-tab"
  | "split-h"
  | "split-v"
  | "prev-tab"
  | "next-tab"
  | "focus-address"
  | "reload"
  | "open-settings"
  | "save-file";

export type ThemeName = "mocha" | "latte";

/**
 * User preferences (userData/settings.json). Owned by the main process so the
 * pty layer can read the shell choice synchronously; the renderer applies theme
 * and terminal font live and persists edits via `settings.save`.
 */
export interface Settings {
  /** app + terminal colour theme */
  theme: ThemeName;
  /** xterm font family (CSS font-family string) */
  terminalFontFamily: string;
  /** xterm font size in px */
  terminalFontSize: number;
  /** custom shell path; empty = the user's login shell ($SHELL) */
  shell: string;
  /** show an OS notification when a terminal rings the bell (AI turn done /
   * input awaited) while the window is not focused */
  notifyOnBell: boolean;
}

/** Persisted user preferences, owned by the main process. */
export interface SettingsApi {
  load(): Promise<Settings>;
  /** persist the full settings object (main validates + broadcasts) */
  save(settings: Settings): void;
  /** settings changed (from this or another window) */
  onChange(cb: (settings: Settings) => void): () => void;
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
  /** report the sessions currently on-screen so bells for them aren't notified */
  setVisibleSessions(ids: string[]): void;
}

/** One entry of a directory listing (editor file tree, lazily loaded). */
export interface DirEntry {
  name: string;
  kind: "file" | "dir";
}

/** Result of reading a file into the editor. */
export type ReadFileResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

/** Result of writing a file from the editor. */
export type WriteFileResult = { ok: true } | { ok: false; error: string };

/**
 * Editor filesystem surface. All access runs in main and is restricted to
 * folders the user opened via the OS dialog (allowed roots) — a compromised
 * renderer can't read or write outside them. Reads are guarded against
 * binary/huge files.
 */
export interface EditorApi {
  /** OS folder picker; the chosen folder becomes an allowed root. null = cancelled */
  openFolderDialog(): Promise<string | null>;
  /** re-register a restored folder as an allowed root; false if it's gone */
  registerRoot(path: string): Promise<boolean>;
  /** immediate children of a dir under an allowed root (name-sorted, dirs first) */
  readDir(path: string): Promise<DirEntry[]>;
  readFile(path: string): Promise<ReadFileResult>;
  writeFile(path: string, content: string): Promise<WriteFileResult>;
  /** watch a file for external changes (refcounted per path) */
  watchStart(path: string): void;
  watchStop(path: string): void;
  /** a watched file changed on disk */
  onFileChange(cb: (path: string) => void): () => void;
}

/**
 * Session persistence (userData/session.json). Main is a dumb JSON store; the
 * renderer owns the layout shape and validates on load. Payload is
 * `{ version, tabs, activeTabId }` — see the renderer's PersistedSession.
 */
export interface SessionApi {
  load(): Promise<unknown>;
  save(session: unknown): void;
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
  /** app-menu accelerator fired (works even when a web pane has focus) */
  onShortcut(cb: (action: ShortcutAction) => void): () => void;
  /** a browser pane's native view gained focus → sync focusedPaneId */
  onFocusPane(cb: (paneId: string) => void): () => void;
  /** a terminal notification was clicked → reveal that session's pane/tab */
  onNotifyActivate(cb: (sessionId: string) => void): () => void;

  term: TerminalApi;
  bookmarks: BookmarksApi;
  history: HistoryApi;
  session: SessionApi;
  settings: SettingsApi;
  editor: EditorApi;
}
