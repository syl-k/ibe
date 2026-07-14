# M8 — エディタペイン 設計

> 決定事項: 軽量エディタ(CodeMirror 6)/ 第3のペイン種 "editor" / フォルダは OS ダイアログで開く /
> ペイン内ファイルタブ / 手動保存 ⌘S。
> 作成: 2026-07-02(ブレインストーミングで各項目を合意済み)

## 1. アーキテクチャ

- `Kind` に `"editor"` を追加(browser / terminal / editor)。エディタは terminal と同じく
  **renderer の DOM 内**に描画。native view の重ね合わせ問題とは無縁で、既存の分割・リサイズ・
  タブ切替・toggleKind にそのまま乗る。
- エディタ本体は **CodeMirror 6**。テーマは Mocha=oneDark 系 / Latte=ライトの2種を設定に連動。
  フォントは既存の terminalFontFamily / terminalFontSize を適用(live 反映は
  `useSettings.subscribe` — TerminalView と同じパターン)。
- **FS アクセスは全て main 経由**(renderer は sandbox)。preload に `window.ibe.editor`:
  - `openFolderDialog()` — OS フォルダ選択。選択パスを allowed roots に登録して返す
  - `registerRoot(path)` — セッション復元用(main が存在チェックのうえ登録)
  - `readDir(path)` — 直下エントリ(遅延読込)
  - `readFile(path)` / `writeFile(path, content)`
  - `watchStart(path)` / `watchStop(path)` / `onFileChange(cb)`
- main は `src/main/editor.ts` の `registerEditor()`。**読み書き・列挙は allowed roots 配下のみ**
  main 側で検証(汚染 renderer からの任意パスアクセスを遮断)。

## 2. データモデル / 永続化

- `LeafNode` 拡張: `folder?: string` / `files?: string[]` / `activeFile?: string`(editor のみ)。
- 未保存バッファ・ツリー展開状態は **ツリー外**の renderer モジュール(`editorBuffers`)で
  `paneId → { path → { text, dirty } }`。viewState と同じ「ライブ状態」の扱い。
- 永続化: folder / files / activeFile を保存・復元(内容はディスクから再読込)。存在しない
  ファイルはタブから除外。`isLayoutNode` に editor を許可。**未保存内容は復元しない**。
- 新規 editor ペインは folder 未設定 → 「フォルダを開く」だけの空状態。

## 3. UI

- `EditorPane` = toolbar(ファイルタブ + open + PaneActions)/ 左: ファイルツリー(遅延読込、
  ドットファイル表示)/ 右: CodeMirror。
- ファイルタブ: ファイル名 + 未保存● + ✕。全部閉じてもペインは空状態で残る。
- 言語: 拡張子で TS/JS・JSON・HTML・CSS・Python・Markdown・shell を自動選択、他はプレーン。
- ⌘S はアプリメニュー `Save File` → `shortcut:"save-file"` → フォーカス中 editor ペインの
  アクティブファイルを保存。
- toggleKind は B→T→E→B の巡回に変更。

## 4. I/O・外部変更・エラー・ガード

- 保存失敗(権限等)は赤帯表示、バッファ保持。
- 外部変更(fs.watch): dirty でない → 黙って再読込 / dirty → 「再読込 / このまま」帯
  (編集内容を黙って壊さない)。
- readFile ガード: サイズ上限 2MB + NUL バイト検査 → 超過/バイナリは表示不可を返す。
- 未保存確認ダイアログは v1 なし(●表示のみ。アプリ全体の「確認なしで閉じる」思想に合わせる)。

## 5. v1 スコープ外

ファイル作成/リネーム/削除・検索・Git 差分・補完/LSP・ツリー自動更新。

## 6. テスト

typecheck + build。パス検証(roots 配下判定)・バイナリ判定は純関数に切り出し node で検証。
動作確認手順は docs/m8-editor.md。
