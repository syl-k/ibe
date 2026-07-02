# ibe

**統合型ブラウザ・ターミナル** — 1つのアプリでブラウザとターミナルを、**無制限の分割ビュー**で並べて使う。

> An integrated browser + terminal with unlimited split panes, for macOS.

既存ブラウザ（Chrome / Edge）の分割が基本2画面なのに対し、ibe は分割数に制限を設けません。
幅広ディスプレイで4分割し、左2画面にブラウザ・右2画面にターミナル、といった使い方ができます。

---

## 特徴

- 🔲 **無制限の再帰分割** — 任意のペインを上下・左右にネスト分割。ドラッグでリサイズ。
- 🌐 **ブラウザ** — Chromium（`WebContentsView`）。タブ・戻る/進む・停止・ファビコン・
  履歴（アドレスバー候補）・ブックマーク。リンクの新規ウィンドウは**アプリ内の新規ペイン**で開く。
- ⌨️ **ターミナル** — ログイン shell（zsh 等）をそのまま起動（node-pty + xterm.js）。
  1ペイン内に複数セッション（ペイン内タブ）。
- 🗂️ **ワークスペース（タブ）** — レイアウト全体をタブ単位で切り替え。
- 💾 **状態復元** — レイアウト・タブ・URL を再起動後に復元（ターミナルは枠のみ・shell 再起動）。
- ⚙️ **設定** — テーマ（ダーク Mocha / ライト Latte）・ターミナルフォント・デフォルト shell
  を変更・永続化・即時反映（⌘,）（[docs/m6-settings.md](docs/m6-settings.md)）。
- 🔔 **ターミナル通知** — Claude 等がターミナルでベルを鳴らす（処理完了・入力待ち）と、
  見ていないセッションなら OS 通知。クリックでそのセッションへ移動。ブラウザペインの
  Google カレンダー等の Web 通知も許可オリジンのみ橋渡し（[docs/m7-notifications.md](docs/m7-notifications.md)）。
- 📝 **エディタ** — フォルダを開いてファイルを閲覧・編集（CodeMirror 6）。ファイルツリー・
  ペイン内ファイルタブ・⌘S 保存・外部変更検知・Markdown プレビュー（[docs/m8-editor.md](docs/m8-editor.md)）。
- 🎹 **アプリメニューのショートカット** — web ペインにフォーカスがあっても効く（[docs/shortcuts.md](docs/shortcuts.md)）。

## 動作環境

- macOS（Apple Silicon / Intel）
- Node.js 20+（開発時。ネイティブモジュール `node-pty` をビルドします）

## セットアップ / 開発

```bash
npm install        # 依存関係の取得 + node-pty のネイティブリビルド
npm run dev        # electron-vite の開発モード（HMR）
```

## ビルド

```bash
npm run typecheck  # 型チェック
npm run build      # 本番ビルド（out/ に出力）
npm start          # ビルド済みをプレビュー起動
npm run dist       # 配布用 .dmg / .app を生成（macOS, electron-builder）
```

生成物は `release/` に出力されます（署名なしのローカルビルド）。

## キーボードショートカット

| 操作 | キー |
|------|------|
| 新規タブ | Cmd+T |
| ペインを閉じる | Cmd+W |
| タブを閉じる | Cmd+Shift+W |
| 左右に分割 | Cmd+D |
| 上下に分割 | Cmd+Shift+D |
| アドレスバーへ | Cmd+L |
| ペインをリロード | Cmd+R |
| 前 / 次のタブ | Cmd+Shift+[ / Cmd+Shift+] |
| 設定を開く | Cmd+, |
| ファイルを保存（エディタ） | Cmd+S |

## アーキテクチャ

Electron（main / preload / renderer）+ React + electron-vite + Zustand。
各ブラウザペインは main が所有するネイティブ `WebContentsView` で、renderer の DOM
プレースホルダの矩形に重ねて配置します。

```
src/
  shared/        main/preload/renderer 共有の IPC 型契約
  main/          WebContentsView 管理 / pty / 履歴 / ブックマーク / セッション / メニュー
  preload/       contextBridge 経由の最小 API (window.ibe)
  renderer/src/  React（レイアウトツリー・タブ・ブラウザ/ターミナルペイン）
```

設計と各マイルストーンの詳細は [docs/](docs/) を参照:
[要件定義](docs/requirements.md) ·
[M0 プロトタイプ](docs/m0-prototype.md) ·
[M1 レイアウト](docs/m1-layout.md) ·
[M2 ターミナル](docs/m2-terminal.md) ·
[M3 ブラウザ](docs/m3-browser.md) ·
[M4 状態復元](docs/m4-persistence.md) ·
[M6 設定](docs/m6-settings.md) ·
[M7 通知](docs/m7-notifications.md) ·
[M8 エディタ](docs/m8-editor.md) ·
[ショートカット](docs/shortcuts.md)

## ロードマップ

- [x] M0 `WebContentsView` 多ペイン重ね合わせ検証
- [x] M1 レイアウト基盤（再帰分割・タブ）
- [x] M2 ターミナル統合（node-pty + xterm.js）
- [x] M3 ブラウザ統合（履歴・ブックマーク・ペイン割り当て）
- [x] M4 状態復元
- [x] キーボードショートカット（アプリメニュー化）
- [x] M5 OSS 整備（README・CI・electron-builder 配布）
- [x] M6 設定 UI（テーマ・フォント・デフォルト shell）
- [x] M7 ターミナル通知（cmux 風・ベル検出）
- [x] M8 エディタペイン（フォルダ・ツリー・CodeMirror 6）
- [ ] 以降: 署名/notarization・アプリアイコン・Chrome 拡張・複数プロファイル・リッチターミナル 等

## コントリビュート

[CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## ライセンス

[MIT](LICENSE) © 2026 T_Kikuyama
