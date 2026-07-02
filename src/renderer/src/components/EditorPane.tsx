import { useEffect, useRef, useState } from "react";
import type { LeafNode } from "../types";
import { useStore } from "../store";
import { findLeaf } from "../tree";
import { useEditorBuffers, isDirty } from "../editorBuffers";
import { PaneActions } from "./PaneActions";
import { FileTree } from "./FileTree";
import { CodeMirrorView } from "./CodeMirrorView";

const ibe = window.ibe;

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1) || path;
}

/**
 * Save the focused editor pane's active file (⌘S via the app menu). Lives here
 * rather than in a component so the shortcut handler in App can call it without
 * threading refs through the tree.
 */
export async function saveActiveEditorFile(): Promise<void> {
  const s = useStore.getState();
  const paneId = s.focusedPaneId;
  if (!paneId) return;
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  const node = tab ? findLeaf(tab.root, paneId) : null;
  if (!node || node.kind !== "editor" || !node.activeFile) return;

  const path = node.activeFile;
  const b = useEditorBuffers.getState();
  const buf = b.buffers[paneId]?.[path];
  if (!buf) return;
  const res = await ibe.editor.writeFile(path, buf.text);
  if (res.ok) b.markSaved(paneId, path);
  else b.setError(paneId, path, res.error);
}

/**
 * An editor pane: file tabs above, lazy folder tree left, CodeMirror right.
 * The folder and open tabs live in the layout tree (persisted); buffers live in
 * useEditorBuffers (volatile) so they survive tab switches but not restarts.
 */
export function EditorPane({ node }: { node: LeafNode }) {
  const paneId = node.id;
  const setEditorFolder = useStore((s) => s.setEditorFolder);
  const openEditorFile = useStore((s) => s.openEditorFile);
  const closeEditorFile = useStore((s) => s.closeEditorFile);
  const setActiveEditorFile = useStore((s) => s.setActiveEditorFile);
  const paneBuffers = useEditorBuffers((s) => s.buffers[paneId]);

  // undefined = still validating the restored folder against the filesystem
  const [rootOk, setRootOk] = useState<boolean | undefined>(node.folder ? undefined : true);
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  // bumping a file's generation remounts its CodeMirror view with fresh text
  const [gen, setGen] = useState<Record<string, number>>({});

  const files = node.files ?? [];
  const active = node.activeFile;
  const activeBuf = active ? paneBuffers?.[active] : undefined;

  // (re)validate the folder as an allowed root — needed after session restore
  useEffect(() => {
    if (!node.folder) return;
    let cancelled = false;
    setRootOk(undefined);
    ibe.editor.registerRoot(node.folder).then((ok) => {
      if (!cancelled) setRootOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [node.folder]);

  // load the active file's buffer on demand (open, tab switch, session restore)
  useEffect(() => {
    if (!active || rootOk !== true) return;
    if (useEditorBuffers.getState().buffers[paneId]?.[active]) return;
    let cancelled = false;
    ibe.editor.readFile(active).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        useEditorBuffers.getState().load(paneId, active, res.content);
      } else if (res.error.includes("ENOENT")) {
        // restored tab whose file is gone — drop it silently (per design)
        closeEditorFile(paneId, active);
      } else {
        setLoadErrors((m) => ({ ...m, [active]: res.error }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active, rootOk, paneId, closeEditorFile]);

  // Reconcile one file against disk: clean buffers follow the disk silently;
  // dirty buffers get a conflict bar instead (never clobber user edits).
  // Skips the reload when disk content matches the buffer (e.g. our own save).
  const reconcile = async (path: string) => {
    const buf = useEditorBuffers.getState().buffers[paneId]?.[path];
    if (!buf) return;
    if (isDirty(buf)) {
      useEditorBuffers.getState().setConflict(paneId, path, true);
      return;
    }
    const res = await ibe.editor.readFile(path);
    if (!res.ok || res.content === buf.text) return;
    useEditorBuffers.getState().load(paneId, path, res.content);
    setGen((g) => ({ ...g, [path]: (g[path] ?? 0) + 1 }));
  };
  const reconcileRef = useRef(reconcile);
  reconcileRef.current = reconcile;

  // watch open files for external changes; re-sync everything on (re)mount
  // because watchers were off while this pane was on a background tab
  const watched = useRef(new Set<string>());
  useEffect(() => {
    const desired = new Set(files);
    for (const p of desired) {
      if (!watched.current.has(p)) {
        ibe.editor.watchStart(p);
        watched.current.add(p);
        void reconcileRef.current(p);
      }
    }
    for (const p of [...watched.current]) {
      if (!desired.has(p)) {
        ibe.editor.watchStop(p);
        watched.current.delete(p);
      }
    }
  }, [files]);
  useEffect(() => {
    return () => {
      for (const p of watched.current) ibe.editor.watchStop(p);
      watched.current.clear();
    };
  }, []);
  useEffect(
    () =>
      ibe.editor.onFileChange((path) => {
        if (watched.current.has(path)) void reconcileRef.current(path);
      }),
    []
  );

  const openFolder = async () => {
    const folder = await ibe.editor.openFolderDialog();
    if (folder) {
      useEditorBuffers.getState().dropPane(paneId);
      setLoadErrors({});
      setEditorFolder(paneId, folder);
      setRootOk(true); // dialog result is registered as a root by main
    }
  };

  const closeFile = (path: string) => {
    closeEditorFile(paneId, path);
    useEditorBuffers.getState().drop(paneId, path);
    setLoadErrors((m) => {
      if (!(path in m)) return m;
      const rest = { ...m };
      delete rest[path];
      return rest;
    });
  };

  const reloadConflict = async (path: string) => {
    const res = await ibe.editor.readFile(path);
    if (res.ok) {
      useEditorBuffers.getState().load(paneId, path, res.content);
      setGen((g) => ({ ...g, [path]: (g[path] ?? 0) + 1 }));
    }
  };

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <>
      <div className="toolbar" onMouseDown={(e) => e.stopPropagation()}>
        <div className="session-tabs">
          {files.map((path) => {
            const buf = paneBuffers?.[path];
            const dirty = buf ? isDirty(buf) : false;
            return (
              <div
                key={path}
                className={`session-tab${path === active ? " active" : ""}`}
                onMouseDown={stop(() => setActiveEditorFile(paneId, path))}
                title={path}
              >
                <span className="session-label">
                  {dirty ? "● " : ""}
                  {basename(path)}
                </span>
                <button
                  className="session-close"
                  title="タブを閉じる"
                  onMouseDown={stop(() => closeFile(path))}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        {node.folder && (
          <button title="別のフォルダを開く" onClick={stop(() => void openFolder())}>
            📁
          </button>
        )}
        <span className="spacer" />
        <PaneActions id={paneId} toggleLabel="B" toggleTitle="ブラウザに切替" />
      </div>

      <div className="content editor-content" onMouseDown={(e) => e.stopPropagation()}>
        {!node.folder || rootOk === false ? (
          <div className="editor-empty">
            {rootOk === false && (
              <p className="editor-missing">フォルダが見つかりません: {node.folder}</p>
            )}
            <button className="editor-open-btn" onClick={() => void openFolder()}>
              📁 フォルダを開く
            </button>
          </div>
        ) : rootOk === undefined ? null : (
          <>
            <div className="editor-tree">
              <FileTree
                root={node.folder}
                activeFile={active}
                onOpen={(p) => openEditorFile(paneId, p)}
              />
            </div>
            <div className="editor-main">
              {active && activeBuf?.conflict && (
                <div className="editor-bar conflict">
                  <span>ディスク上で変更されました</span>
                  <button onClick={() => void reloadConflict(active)}>再読込</button>
                  <button
                    onClick={() =>
                      useEditorBuffers.getState().setConflict(paneId, active, false)
                    }
                  >
                    このまま
                  </button>
                </div>
              )}
              {active && activeBuf?.error && (
                <div className="editor-bar error">
                  <span>保存できません: {activeBuf.error}</span>
                </div>
              )}
              {active && loadErrors[active] ? (
                <div className="editor-placeholder">{loadErrors[active]}</div>
              ) : active && activeBuf ? (
                <CodeMirrorView
                  key={`${active}:${gen[active] ?? 0}`}
                  path={active}
                  initialText={activeBuf.text}
                  onChange={(text) =>
                    useEditorBuffers.getState().edit(paneId, active, text)
                  }
                />
              ) : (
                <div className="editor-placeholder">
                  {active ? "読み込み中…" : "ツリーからファイルを選択"}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
