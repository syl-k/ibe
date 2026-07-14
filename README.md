# ibe

**統合型ブラウザ・ターミナル** — 1つのアプリでブラウザとターミナルを、**無制限の分割ビュー**で並べて使う。

> An integrated browser + terminal with unlimited split panes, for macOS.

既存ブラウザ（Chrome / Edge）の分割が基本2画面なのに対し、ibe は分割数に制限を設けません。
幅広ディスプレイで4分割し、左2画面にブラウザ・右2画面にターミナル、といった使い方ができます。

---

## 特徴

- 🔲 **無制限の再帰分割** — 任意のペインを上下・左右にネスト分割。ドラッグでリサイズ。
- 🌐 **ブラウザ** — Chromium（`WebContentsView`）。タブ・戻る/進む・停止・ファビコン・
  履歴（アドレスバー候補）・ブックマーク・右クリックメニュー（新規ペインで開く/コピー/
  選択テキスト検索/検証）。リンクの新規ウィンドウは**アプリ内の新規ペイン**で開く。
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
- 🔖 **Chrome ブックマーク** — ローカル Chrome プロファイルのブックマークを参照・自動追従
  （Chrome の公式同期経由で実質アカウント同期。読み取り専用）（[docs/m9-chrome-bookmarks.md](docs/m9-chrome-bookmarks.md)）。
- 🔎 **ライブラリ** — 履歴・ブックマーク・Chrome ミラーを1か所で検索（⌘Y）。
  アドレスバー候補にもブックマークが統合（[docs/m10-library.md](docs/m10-library.md)）。
- 👆 **ジェスチャー / スワイプ** — トラックパッド2本指の横スワイプで戻る/進む（Chrome 風に
  指を離した時点で発火、しきい値未満なら途中キャンセル可・進捗矢印を表示）。マウスの
  サイドボタン（戻る/進む）にも対応。
- 🔍 **ペイン単位のズーム** — ⌘+ / ⌘- / ⌘0。小さいペインでも読みやすく調整でき、
  レイアウトに保存されて再起動後も維持。
- 🔑 **パスワード保存** — ログインフォームの送信を検出して保存を確認、次回訪問で自動入力。
  パスワードは OS の暗号化（Keychain / safeStorage）で保存し、設定画面で一覧・削除できる。
- 🧩 **Chrome 拡張（実験的）** — `userData/extensions/` に展開ロード。UI ページをペインで
  表示（`scripts/install-chrome-extension.mjs` で導入・MV3 パッチ・鍵ピン留め）。
- 🛡️ **広告ブロック** — Ghostery エンジン（uBlock 相当のフィルタ）を全ペインに適用。
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
npm run icon       # build/icon.svg → build/icon.icns / icon.png を生成
npm run dist       # 配布用 .dmg / .app を生成（macOS, electron-builder）
```

## アプリケーション化（.app / .dmg）

`npm run dev` を使わず、通常の macOS アプリとして常用できます。

```bash
npm run dist
```

生成物は `release/` に出力されます:

| 生成物 | 用途 |
|--------|------|
| `release/ibe-<version>-arm64.dmg` | インストーラ。開いて `ibe.app` を `/Applications` へドラッグ |
| `release/ibe-<version>-arm64-mac.zip` | 配布・バックアップ用 |
| `release/mac-arm64/ibe.app` | アプリ本体 |

インストール後は Launchpad / Spotlight から起動でき、`npm run dev` は不要です。

**注意点**

- **署名なし（adhoc）ビルド**です。自分の Mac で作って自分で使う分は問題ありません。
  他人へ配布すると Gatekeeper に弾かれます（配布には Apple Developer 署名 +
  notarization が必要。`electron-builder.yml` の `mac.identity` を設定）。
- ユーザーデータ（履歴・ブックマーク・保存パスワード・拡張）は
  `~/Library/Application Support/ibe/` に保存され、**dev 版とアプリ版で共通**です。
- 保存パスワードの暗号鍵はアプリの署名に紐づきます。将来 adhoc から正式署名へ切り替えると、
  それ以前に保存したパスワードは復号できなくなることがあります（保存し直せば解消）。
- バージョンは `package.json` の `version` を更新してから `npm run dist` すると管理しやすいです。

### アプリアイコン

アイコンは `build/icon.svg` を元に `npm run icon` で生成します（`build/icon.icns` =
アプリアイコン、`build/icon.png` = 通知アイコン）。`icon.svg` を編集して `npm run icon`
→ `npm run dist` で差し替えられます。

## Chrome 拡張の導入（実験的）

```bash
node scripts/install-chrome-extension.mjs <Chrome ウェブストアの拡張ID> <呼び名>
# 例: LINE
node scripts/install-chrome-extension.mjs ophjlpahpchlmihnnnihgmmeilfjmjjc line
```

`~/Library/Application Support/ibe/extensions/<呼び名>/` に展開され、次回起動時に読み込まれ、
メニューバー「Extensions」から UI ページをペインで開けます。MV3 の service worker 非対応や
origin ゲートのため、動かない拡張もあります（スクリプトが background 除去・`chrome.*` シム注入・
署名鍵ピン留めを自動で行います）。

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
| スーパーリロード | Cmd+Shift+R |
| 前 / 次のタブ | Cmd+Shift+[ / Cmd+Shift+] |
| ズーム イン / アウト / リセット | Cmd+= / Cmd+- / Cmd+0 |
| 設定を開く | Cmd+, |
| ファイルを保存（エディタ） | Cmd+S |
| ライブラリ | Cmd+Y |

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
[M9 Chrome ブックマーク](docs/m9-chrome-bookmarks.md) ·
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
- [x] M8 エディタペイン（フォルダ・ツリー・CodeMirror 6・md プレビュー）
- [x] M9 Chrome ブックマーク参照（自動追従・読み取り専用）
- [x] M10 ライブラリ（履歴/ブックマーク検索 ⌘Y・オムニボックス統合）
- [x] スワイプ/ジェスチャーで戻る・進む・ペイン単位ズーム
- [x] パスワード保存・自動入力（safeStorage 暗号化）
- [x] Chrome 拡張の展開ロード・広告ブロック（Ghostery）
- [x] アプリアイコン・通知アイコン
- [ ] 以降: 署名/notarization・複数プロファイル・リッチターミナル 等

## コントリビュート

[CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## ライセンス

[MIT](LICENSE) © 2026 T_Kikuyama
