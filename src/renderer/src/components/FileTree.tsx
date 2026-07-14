import { useEffect, useState } from "react";
import type { DirEntry } from "../../../shared/ipc";

const ibe = window.ibe;

/**
 * Lazily loaded folder tree: a directory's children are listed only when it is
 * first expanded, so huge folders (node_modules, .git) cost nothing until
 * opened. Dotfiles are shown — this is a developer tool.
 */
export function FileTree({
  root,
  activeFile,
  onOpen,
}: {
  root: string;
  activeFile?: string;
  onOpen: (path: string) => void;
}) {
  return (
    <div className="filetree">
      <DirNode path={root} depth={0} initiallyOpen activeFile={activeFile} onOpen={onOpen} />
    </div>
  );
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1) || path;
}

function DirNode({
  path,
  depth,
  initiallyOpen = false,
  activeFile,
  onOpen,
}: {
  path: string;
  depth: number;
  initiallyOpen?: boolean;
  activeFile?: string;
  onOpen: (path: string) => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [entries, setEntries] = useState<DirEntry[] | null>(null);

  useEffect(() => {
    if (open && entries === null) {
      ibe.editor.readDir(path).then(setEntries);
    }
  }, [open, entries, path]);

  return (
    <>
      <div
        className="filetree-row dir"
        style={{ paddingLeft: depth * 14 + 6 }}
        onClick={() => setOpen((o) => !o)}
        title={path}
      >
        <span className="filetree-arrow">{open ? "▾" : "▸"}</span>
        <span className="filetree-name">{basename(path)}</span>
      </div>
      {open &&
        entries?.map((e) => {
          const child = `${path}/${e.name}`;
          return e.kind === "dir" ? (
            <DirNode
              key={child}
              path={child}
              depth={depth + 1}
              activeFile={activeFile}
              onOpen={onOpen}
            />
          ) : (
            <div
              key={child}
              className={`filetree-row file${child === activeFile ? " active" : ""}`}
              style={{ paddingLeft: (depth + 1) * 14 + 6 }}
              onClick={() => onOpen(child)}
              title={child}
            >
              <span className="filetree-name">{e.name}</span>
            </div>
          );
        })}
    </>
  );
}
