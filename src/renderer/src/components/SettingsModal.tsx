import { useEffect, useRef } from "react";
import type { ThemeName } from "../../../shared/ipc";
import { useStore } from "../store";
import { useSettings } from "../settings";

const THEMES: Array<{ value: ThemeName; label: string }> = [
  { value: "mocha", label: "Dark (Mocha)" },
  { value: "latte", label: "Light (Latte)" },
];

/**
 * Preferences dialog (⌘,). Rendered as renderer DOM over the workspace; the
 * native browser views are retracted while it's open (see useBrowserViews) so it
 * isn't painted behind them. Edits apply live and persist via the settings store.
 */
export function SettingsModal() {
  const close = useStore((s) => s.setSettingsOpen);
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const cardRef = useRef<HTMLDivElement>(null);

  // Escape closes; grab focus so the key lands on the renderer, not a web view.
  useEffect(() => {
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="settings-overlay" onMouseDown={() => close(false)}>
      <div
        className="settings-card"
        ref={cardRef}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={() => close(false)}>
            ✕
          </button>
        </div>

        <div className="settings-field">
          <label>Theme</label>
          <div className="segmented">
            {THEMES.map((t) => (
              <button
                key={t.value}
                className={settings.theme === t.value ? "active" : ""}
                onClick={() => update({ theme: t.value })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <label htmlFor="set-font-family">Terminal font</label>
          <input
            id="set-font-family"
            type="text"
            value={settings.terminalFontFamily}
            spellCheck={false}
            onChange={(e) => update({ terminalFontFamily: e.target.value })}
          />
        </div>

        <div className="settings-field">
          <label htmlFor="set-font-size">Terminal font size</label>
          <input
            id="set-font-size"
            type="number"
            min={6}
            max={32}
            value={settings.terminalFontSize}
            onChange={(e) => {
              // clamp to the same 6–32 integer range main coerces to, so an
              // empty/out-of-range field can't apply fontSize 0 (or a value that
              // silently diverges from the persisted one) to the live terminal.
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n) && n >= 6 && n <= 32)
                update({ terminalFontSize: n });
            }}
          />
        </div>

        <div className="settings-field">
          <label htmlFor="set-shell">Shell</label>
          <input
            id="set-shell"
            type="text"
            value={settings.shell}
            spellCheck={false}
            placeholder="login shell ($SHELL)"
            onChange={(e) => update({ shell: e.target.value })}
          />
          <p className="settings-hint">
            Leave blank to use your login shell. Applies to newly opened
            terminals, not existing ones.
          </p>
        </div>

        <div className="settings-field">
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.notifyOnBell}
              onChange={(e) => update({ notifyOnBell: e.target.checked })}
            />
            <span>ターミナル通知</span>
          </label>
          <p className="settings-hint">
            Claude などがターミナルでベルを鳴らしたとき（処理完了・入力待ち）、
            ウィンドウが非アクティブなら OS 通知を表示します。通知をクリックすると
            そのセッションのタブ／ペインに移動します。
          </p>
        </div>
      </div>
    </div>
  );
}
