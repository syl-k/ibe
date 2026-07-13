import { useEffect, useRef, useState } from "react";
import type { ChromeProfile, SavedCredential, ThemeName } from "../../../shared/ipc";
import { useStore } from "../store";
import { useSettings } from "../settings";

const THEMES: Array<{ value: ThemeName; label: string }> = [
  { value: "mocha", label: "Dark (Mocha)" },
  { value: "latte", label: "Light (Latte)" },
];

/** Saved-passwords manager: lists origins + usernames, deletes on request.
 *  Secrets stay in main — this only ever sees origin/username metadata. */
function PasswordsSection() {
  const [creds, setCreds] = useState<SavedCredential[]>([]);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    window.ibe.passwords.available().then(setAvailable);
    window.ibe.passwords.list().then(setCreds);
    return window.ibe.passwords.onChange(setCreds);
  }, []);

  return (
    <div className="settings-field">
      <label>保存したパスワード</label>
      {!available ? (
        <p className="settings-hint">
          この環境では OS の暗号化(Keychain)が使えないため、パスワード保存は無効です。
        </p>
      ) : creds.length === 0 ? (
        <p className="settings-hint">
          まだ保存されていません。ログインフォームを送信すると保存を確認します。
        </p>
      ) : (
        <ul className="pw-list">
          {creds.map((c) => (
            <li key={`${c.origin} ${c.username}`} className="pw-item">
              <span className="pw-site">{c.origin.replace(/^https?:\/\//, "")}</span>
              <span className="pw-user">{c.username || "(ユーザー名なし)"}</span>
              <button
                className="pw-del"
                title="削除"
                onClick={() => window.ibe.passwords.remove(c.origin, c.username)}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="settings-hint">
        パスワードは OS の暗号化ストレージ(Keychain)で暗号化して保存され、
        同じサイトを次に開いたとき自動入力します。
      </p>
    </div>
  );
}

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
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);

  // Chrome profiles for the bookmarks-mirror dropdown (empty = not installed)
  useEffect(() => {
    window.ibe.chromeBookmarks.profiles().then(setProfiles);
  }, []);

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

        {profiles.length > 0 && (
          <div className="settings-field">
            <label htmlFor="set-chrome-profile">Chrome ブックマーク</label>
            <select
              id="set-chrome-profile"
              value={settings.chromeProfile}
              onChange={(e) => update({ chromeProfile: e.target.value })}
            >
              <option value="">同期しない</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
            <p className="settings-hint">
              選択した Chrome プロファイルのブックマークをブックマークバーの
              「Chrome ▾」に表示します(読み取り専用・Chrome 側の変更に自動追従)。
            </p>
          </div>
        )}

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

        <PasswordsSection />
      </div>
    </div>
  );
}
