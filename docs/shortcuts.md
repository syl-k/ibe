# キーボードショートカット（アプリメニュー化）

> 目的: web ペインにフォーカスがあってもショートカットが効くようにする。
> 最終更新: 2026-07-01

---

## 背景 / 問題

ネイティブ `WebContentsView`（各ブラウザペイン）は、フォーカス時にキー入力を
そのページに奪う。そのため renderer 側の `window.addEventListener("keydown")` では、
web ページ操作中に Cmd+T などが発火しなかった（M4 で顕在化）。

## 解決策

**アプリケーションメニューの Accelerator** を唯一のショートカット源にする。ネイティブ
メニューのアクセラレータは、どの `WebContentsView` にフォーカスがあっても OS レベルで
発火するため、この問題を回避できる。renderer の keydown ハンドラは撤去した。

### 流れ
1. main（`menu.ts`）が `Menu.setApplicationMenu` でメニューを設定。各項目は
   `ShortcutAction` を renderer に送るだけ（`getWebContents().send("shortcut", action)`）。
2. renderer（`App.tsx`）が `ibe.onShortcut` で受け、**自分の `focusedPaneId`** に対して
   アクションを解決（分割・リロード・アドレスバーへフォーカス等）。
3. web ページをクリックしたときにフォーカスペインが追従するよう、main は各ブラウザ view の
   `webContents.on("focus")` で `browser:focus-pane` を送り、renderer が `focusPane` する。

### focus-address / open-settings の特別扱い
アドレスバーへフォーカス（Cmd+L）や設定を開く（Cmd+,）は、DOM 要素に `.focus()` する
だけでは不十分。ネイティブ子 view がキーボードフォーカスを保持したままだと入力がそちらに
行くため、main 側で先に `webContents.focus()` して**レンダラにキーフォーカスを引き戻して**
から `focus-address` / `open-settings` を送る（`focusThenSend`）。

## ショートカット一覧

| 操作 | キー | アクション |
|------|------|-----------|
| 新規タブ | Cmd+T | `new-tab` |
| ペインを閉じる | Cmd+W | `close-pane`（最後の1枚ならタブを閉じる） |
| タブを閉じる | Cmd+Shift+W | `close-tab` |
| 左右に分割 | Cmd+D | `split-h` |
| 上下に分割 | Cmd+Shift+D | `split-v` |
| アドレスバーへ | Cmd+L | `focus-address` |
| ペインをリロード | Cmd+R | `reload` |
| スーパーリロード（キャッシュ無視） | Cmd+Shift+R | `hard-reload` |
| 前のタブ | Cmd+Shift+[ | `prev-tab` |
| 次のタブ | Cmd+Shift+] | `next-tab` |
| 設定を開く | Cmd+, | `open-settings` |
| ファイルを保存（エディタ） | Cmd+S | `save-file` |
| ライブラリ（履歴/ブックマーク検索） | Cmd+Y | `open-library` |

編集系（コピー/ペースト等）は標準の `editMenu` ロールで供給（ターミナル・ブラウザ双方で必要）。

## 検証（macOS）

web ページにフォーカスを置いた状態で:
- Cmd+T → 新規タブ作成（従来は失敗）。
- ページをクリック → Cmd+D → **そのペイン**が左右分割（フォーカス追従）。
- Cmd+L → アドレスバーにフォーカスし、入力→Enter で遷移（キーフォーカス引き戻し）。

## 既知の制約

- 分割/リロード/アドレスバー等の「ペイン相対」操作は `focusedPaneId` を対象にする。
  web view クリックで追従するが、フォーカス対象が曖昧な場合は先頭ペインにフォールバック。
- Cmd+W をペイン閉じに割り当てているため、ウィンドウを閉じるのは赤ボタン / Cmd+Q。
