import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { EditorView } from "@codemirror/view";
import { Compartment, type Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { useSettings } from "../settings";

/** Pick a CodeMirror language by file extension; plain text otherwise. */
function languageFor(path: string): Extension {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "js":
    case "mjs":
    case "cjs":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "json":
      return json();
    case "html":
    case "htm":
      return html();
    case "css":
      return css();
    case "py":
      return python();
    case "md":
    case "markdown":
      return markdown();
    case "sh":
    case "bash":
    case "zsh":
      return StreamLanguage.define(shell);
    default:
      return [];
  }
}

// Fill the pane; fonts come from CSS vars set on the host (live via settings).
const baseTheme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-scroller": {
    fontFamily: "var(--editor-font-family)",
    fontSize: "var(--editor-font-size)",
  },
});

function themeFor(theme: "mocha" | "latte"): Extension {
  return theme === "mocha" ? oneDark : [];
}

/**
 * One CodeMirror editor bound to one file buffer. The view owns the document
 * after mount; edits flow up through `onChange`. The call site keys this
 * component by file path + disk generation, so `path`/`initialText` are stable
 * for the lifetime of a mount.
 */
export function CodeMirrorView({
  path,
  initialText,
  onChange,
}: {
  path: string;
  initialText: string;
  onChange: (text: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const settings = useSettings((s) => s.settings);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const themeCompartment = new Compartment();
    const view = new EditorView({
      parent: host,
      doc: initialText,
      extensions: [
        basicSetup,
        baseTheme,
        languageFor(path),
        themeCompartment.of(themeFor(useSettings.getState().settings.theme)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    view.focus();

    // live theme switching (font is CSS-var based and needs no reconfigure)
    const unsubscribe = useSettings.subscribe((state) => {
      view.dispatch({
        effects: themeCompartment.reconfigure(themeFor(state.settings.theme)),
      });
    });

    return () => {
      unsubscribe();
      view.destroy();
    };
    // keyed by path+generation at the call site; props are mount-constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={hostRef}
      className="editor-cm"
      style={{
        // the editor shares the user's terminal mono-font settings
        ["--editor-font-family" as string]: settings.terminalFontFamily,
        ["--editor-font-size" as string]: `${settings.terminalFontSize + 1}px`,
      }}
    />
  );
}
