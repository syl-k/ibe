import type { LeafNode } from "../types";
import { useStore } from "../store";
import { PaneActions } from "./PaneActions";
import { TerminalView } from "./TerminalView";

/**
 * A terminal pane: a strip of in-pane session tabs (each is its own login-shell
 * pty) above the active session's xterm view. Adding/closing/switching sessions
 * only changes which TerminalView is mounted; ptys live in main and persist.
 */
export function TerminalPane({ node }: { node: LeafNode }) {
  const addSession = useStore((s) => s.addSession);
  const closeSession = useStore((s) => s.closeSession);
  const setActiveSession = useStore((s) => s.setActiveSession);

  const sessions = node.sessions ?? [];
  const active = node.activeSessionId ?? sessions[0];

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <>
      <div className="toolbar" onMouseDown={(e) => e.stopPropagation()}>
        <div className="session-tabs">
          {sessions.map((sid, i) => (
            <div
              key={sid}
              className={`session-tab${sid === active ? " active" : ""}`}
              onMouseDown={stop(() => setActiveSession(node.id, sid))}
              title={`セッション ${i + 1}`}
            >
              <span className="session-label">⌘ {i + 1}</span>
              <button
                className="session-close"
                title="セッションを閉じる"
                onMouseDown={stop(() => closeSession(node.id, sid))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="session-add"
            title="セッションを追加"
            onMouseDown={stop(() => addSession(node.id))}
          >
            ＋
          </button>
        </div>
        <span className="spacer" />
        <PaneActions id={node.id} toggleLabel="B" toggleTitle="ブラウザに切替" />
      </div>
      {active && <TerminalView key={active} sessionId={active} />}
    </>
  );
}
