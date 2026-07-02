import { create } from "zustand";

/**
 * Live editor buffers, outside the layout tree (like viewState for browser
 * panes): unsaved text changes fast and must not churn the persisted layout.
 * Keyed by pane id then file path, so the same file open in two panes has
 * independent buffers. Nothing here survives a restart — unsaved edits are
 * intentionally volatile (agreed in the M8 design).
 */

export interface FileBuffer {
  /** current editor text */
  text: string;
  /** text as last loaded/saved — dirty = text !== savedText */
  savedText: string;
  /** the file changed on disk while this buffer was dirty */
  conflict: boolean;
  /** last save/load failure to surface in the pane */
  error: string | null;
}

export function isDirty(b: FileBuffer): boolean {
  return b.text !== b.savedText;
}

interface BuffersState {
  /** paneId -> path -> buffer */
  buffers: Record<string, Record<string, FileBuffer>>;

  /** register freshly loaded (or externally reloaded) disk content */
  load: (paneId: string, path: string, text: string) => void;
  /** user typed; marks dirty via savedText comparison */
  edit: (paneId: string, path: string, text: string) => void;
  /** save succeeded */
  markSaved: (paneId: string, path: string) => void;
  setConflict: (paneId: string, path: string, conflict: boolean) => void;
  setError: (paneId: string, path: string, error: string | null) => void;
  drop: (paneId: string, path: string) => void;
  dropPane: (paneId: string) => void;
}

function patch(
  s: BuffersState,
  paneId: string,
  path: string,
  fn: (b: FileBuffer) => FileBuffer
): Partial<BuffersState> {
  const pane = s.buffers[paneId];
  const buf = pane?.[path];
  if (!buf) return {};
  return {
    buffers: { ...s.buffers, [paneId]: { ...pane, [path]: fn(buf) } },
  };
}

export const useEditorBuffers = create<BuffersState>((set) => ({
  buffers: {},

  load: (paneId, path, text) =>
    set((s) => ({
      buffers: {
        ...s.buffers,
        [paneId]: {
          ...s.buffers[paneId],
          [path]: { text, savedText: text, conflict: false, error: null },
        },
      },
    })),

  edit: (paneId, path, text) =>
    set((s) => patch(s, paneId, path, (b) => ({ ...b, text }))),

  markSaved: (paneId, path) =>
    set((s) =>
      patch(s, paneId, path, (b) => ({
        ...b,
        savedText: b.text,
        conflict: false,
        error: null,
      }))
    ),

  setConflict: (paneId, path, conflict) =>
    set((s) => patch(s, paneId, path, (b) => ({ ...b, conflict }))),

  setError: (paneId, path, error) =>
    set((s) => patch(s, paneId, path, (b) => ({ ...b, error }))),

  drop: (paneId, path) =>
    set((s) => {
      const pane = s.buffers[paneId];
      if (!pane?.[path]) return s;
      const rest = { ...pane };
      delete rest[path];
      return { buffers: { ...s.buffers, [paneId]: rest } };
    }),

  dropPane: (paneId) =>
    set((s) => {
      if (!s.buffers[paneId]) return s;
      const rest = { ...s.buffers };
      delete rest[paneId];
      return { buffers: rest };
    }),
}));
