# M6 — 設定 UI

> 目的: テーマ（ダーク/ライト）・ターミナルのフォント（種類/サイズ）・デフォルト shell を
> ユーザーが変更でき、永続化・即時反映される設定画面を追加する。
> 最終更新: 2026-07-01

---

## 1. 実装したもの / 検証結果

| 機能 | 状態 |
|------|------|
| 設定ダイアログ（⌘, で起動、× / 背景クリック / Escape で閉じる） | ✅ 実機確認 |
| テーマ切替 Mocha(ダーク) / Latte(ライト) — アプリ chrome + ターミナル連動・即時 | ✅ 双方向で反映 |
| ターミナルフォント（種類）変更・既存ターミナルへ即時反映 | ✅ 再マウントなし |
| ターミナルフォントサイズ変更・即時反映（12→13 等） | ✅ 即 refit |
| デフォルト shell 変更（空欄=ログインシェル $SHELL） | ✅ 新規セッションで bash 起動を確認 |
| 設定の永続化・再起動後の復元 | ✅ latte / size13 が復元 |
| モーダルが native ブラウザビューの上に表示される | ✅ 開いている間は全ビューを退避 |

## 2. 設計

### 保存先 / 責務分離
- `userData/settings.json` に `{ theme, terminalFontFamily, terminalFontSize, shell }` を保存。
- **main が設定を所有**する。理由は pty 層が spawn 時に **同期的に** shell を参照する必要があるため
  （`getSettings()` がインメモリの現在値を返す）。`persist.ts` の `loadJson/saveJson` を再利用。
- main は受け取った値を **フィールド単位で coerce**（未知テーマ→mocha、サイズは 6–32 に丸め、
  型不正はデフォルト）してから保存・配信する。ディスク破損や古いスキーマでも安全に起動できる。

### 反映の流れ
- renderer 側は Zustand ストア（`settings.ts`）が main の値をミラーする。
  - 編集（`update`）: ローカルへ即時反映 → テーマを `document.documentElement.dataset.theme` に適用
    → `ibe.settings.save` で main へ永続化。
  - 外部変更（`replace`）: main からの `settings:change` を受けて反映のみ（保存はしない）。
- テーマ: CSS 変数を `:root[data-theme="mocha|latte"]` で切替。ターミナルは xterm の `ITheme` を
  Mocha/Latte 2 種持ち、`useSettings.subscribe` で live term の `options.theme/fontFamily/fontSize`
  を更新して refit（セッションを再マウントせずに反映）。
- shell: `pty.ts` の `loginShell()` が `getSettings().shell.trim() || $SHELL || /bin/zsh`。
  **既存の pty には影響せず、次に spawn される端末から適用**（要件どおり）。

### モーダルと native ビューの重なり
- ブラウザペインは `WebContentsView`（native）で DOM の上に描画されるため、DOM のモーダルは
  そのままでは隠れる。omnibox と同じ手法で、**設定モーダルが開いている間は全ブラウザビューを
  退避**する（`store.settingsOpen` → `useBrowserViews` の可視判定に `!settingsOpen` を追加）。
- 起動は他のショートカット同様 **アプリメニューの Accelerator**（macOS はアプリメニュー内
  「Settings…」⌘,、他 OS は Workspace メニュー）。web ペインにフォーカスがあっても発火する。

### 送信元へエコーしない（入力破損の回避）
- `settings:save` は **送信元ウィンドウには `settings:change` を送り返さない**（他ウィンドウのみ）。
  1 キーごとに保存 → 同ウィンドウへ即エコー → `replace` が編集中の controlled input を古い値で
  上書き、という競合で **入力文字が欠落/入れ替わる不具合**があったため。将来の複数ウィンドウ間
  同期は残しつつ、編集中ウィンドウの取りこぼしを防ぐ。

## 3. 既知の制約 / 見送り

- テーマは Catppuccin Mocha / Latte の 2 種のみ（カスタムパレット・フォント指定 UI は未対応）。
- フォント設定はターミナルのみ（アプリ chrome のフォントは未対応）。
- shell 変更は新規端末から反映（既存 pty は再起動しない。要件どおり）。任意の shell を指定できるが
  存在しない/即 exit するパスを入れると端末はすぐ終了する（入力どおりに起動するだけで検証はしない）。
- Escape での閉止は標準の `window` keydown で実装。物理キーでは動作するが、合成キー注入
  （自動化）では Escape がアプリまで届かないことがある（× / 背景クリックは常に有効）。

## 4. 動作確認の要点

1. ⌘, で設定を開く → 背後のブラウザビューが退避してモーダルが最前面に出る。
2. テーマを Latte に → chrome もターミナルも即ライトに。Mocha に戻すと即ダーク。
3. フォントサイズを変更 → 既存ターミナルが再マウントなしで即リサイズ。
4. shell に `/bin/bash` → ターミナルペインで新規セッション（＋）を追加 → bash が起動。
   空欄に戻すとログインシェル（zsh）。
5. 再起動 → テーマ・フォント・shell 設定が復元。
