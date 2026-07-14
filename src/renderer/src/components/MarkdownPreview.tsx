import { useEffect, useState } from "react";
import { marked } from "marked";
import DOMPurify, { type Config } from "dompurify";
import { useStore } from "../store";

/**
 * Live-updating markdown preview. The buffer text is untrusted input being
 * injected into the renderer DOM — and this renderer holds window.ibe (file
 * writes, pty input), so a <script> or onerror handler slipping through would
 * let a file attack the app just by being opened. Everything marked emits goes
 * through DOMPurify, and URIs are limited to https?:/# (no javascript:, no
 * file:, no data: — local images simply don't render in v1).
 */

const SANITIZE_OPTS: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["style", "form", "input", "iframe"],
  ALLOWED_URI_REGEXP: /^(?:https?:|#)/i,
};

function render(text: string): string {
  const html = marked.parse(text, { gfm: true, async: false });
  return String(DOMPurify.sanitize(html, SANITIZE_OPTS));
}

const DEBOUNCE_MS = 150;

export function MarkdownPreview({
  paneId,
  text,
  style,
}: {
  paneId: string;
  text: string;
  style?: React.CSSProperties;
}) {
  const openInNewPane = useStore((s) => s.openInNewPane);
  const [html, setHtml] = useState(() => render(text));

  // follow typing with a small debounce so huge documents don't re-render
  // on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setHtml(render(text)), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  // links open as a new browser pane (ibe's link convention), never in-place
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href") ?? "";
    if (/^https?:/i.test(href)) openInNewPane(paneId, href);
  };

  return (
    <div
      className="md-preview"
      style={style}
      onClick={onClick}
      // sanitized above — see SANITIZE_OPTS
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
