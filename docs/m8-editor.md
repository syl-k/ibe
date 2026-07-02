# M8 — エディタペイン

> 目的: フォルダを開いてファイルを閲覧・編集できる軽量エディタを、第3のペイン種として追加する。
> 設計合意: [docs/plans/2026-07-02-editor-pane-design.md](./plans/2026-07-02-editor-pane-design.md)
> 最終更新: 2026-07-02

---

## 1. 実装したもの

| 機能 | 内容 |
|------|------|
| 第3のペイン種 `editor` | 分割・リサイズ・タブ・toggleKind(B→T→E→B 巡回)にそのまま乗る |
| フォルダを開く | OS のフォルダ選択ダイアログ。ペインごとに独立 |
| ファイルツリー | 遅延読込(展開時に `readDir`)。ドットファイル表示。dirs 先・名前順 |
| ファイルタブ | ペイン内タブ(セッションタブと同型)。未保存●・✕。全部閉じてもペインは残る |
| エディタ本体 | CodeMirror 6 + basicSetup。拡張子で言語自動選択(TS/JS/JSON/HTML/CSS/Py/MD/shell) |
| テーマ/フォント | Mocha=oneDark / Latte=ライト。フォントはターミナル設定を共用し live 反映 |
| 保存 | ⌘S(アプリメニュー Save File)。保存失敗は赤帯表示・バッファ保持 |
| 外部変更 | fs.watch。クリーンなら黙って再読込(自own保存は内容比較でスキップ)、dirty なら「再読込/このまま」帯 |
| 永続化 | folder / files / activeFile を復元(内容はディスクから再読込)。消えたファイルはタブから除外 |
| Markdown プレビュー | `.md` を開くと「◫」トグル。エディタ右に並列表示・入力に 150ms デバウンスで追従 |

## 2. 設計の要点

- **FS は全て main 経由**([src/main/editor.ts](../src/main/editor.ts))。renderer は sandbox。
- **allowed roots**: ダイアログで選んだ(または復元時に `registerRoot` で再検証した)フォルダ配下
  のみ読み書き可。判定は [src/main/pathGuard.ts](../src/main/pathGuard.ts) の `isUnderRoots`
  (resolve 済み比較なので `../` エスケープや prefix 兄弟 `/proj` vs `/proj-evil` を弾く)。
- **読み込みガード**: 2MB 超・NUL バイト(バイナリ)は拒否してメッセージ表示。
- **バッファはツリー外**([editorBuffers.ts](../src/renderer/src/editorBuffers.ts)):
  `paneId → path → { text, savedText, conflict, error }`。dirty は `text !== savedText`。
  タブ切替(アンマウント)を跨いで生きるが、再起動では消える(設計どおり)。
  ペインがレイアウトから消えたら App の購読が `dropPane` で掃除。
- **外部変更の自己エコー回避**: 自分の保存でも fs.watch は発火するため、クリーン時の再読込は
  ディスク内容とバッファが一致したらスキップ(カーソル位置を失う無駄な再マウントを防ぐ)。
- **watch はマウント中のみ**: 背景タブでは watcher が止まるので、再マウント時に全開ファイルを
  ディスクと突き合わせて差分を反映(reconcile)。
- **Markdown プレビューのサニタイズ**([MarkdownPreview.tsx](../src/renderer/src/components/MarkdownPreview.tsx)):
  プレビューは「信頼できない入力を renderer の DOM に注入する」操作で、renderer は
  `window.ibe`(ファイル書換・pty 入力)を持つ。marked の出力は必ず DOMPurify を通し、
  URI は `https?:`/`#` のみ許可(`javascript:`/`file:`/`data:` 遮断)。リンクは delegate で
  preventDefault し、http(s) のみ `openInNewPane` で新規ブラウザペインに開く。
  ローカル画像(相対パス)は v1 では表示されない(設計どおり)。

## 3. 既知の制約 / 見送り(v1)

- ファイル新規作成・リネーム・削除なし(ターミナルで行い、ツリーは再展開で反映)。
- 検索(ファイル内/横断)・Git 差分・補完/LSP なし。
- ツリーの自動更新なし(フォルダの watch はしない。ファイルのみ)。
- 未保存確認ダイアログなし(●表示のみ。アプリ全体の「確認なしで閉じる」思想に合わせる)。
- 外部変更の再読込・コンフリクト再読込でカーソル位置はリセットされる。

## 4. 動作確認の要点

1. ターミナルペインの「E」で editor ペインに切替 → 「フォルダを開く」→ プロジェクトを選択。
2. ツリーで `.ts` を開く → ハイライト付きで表示。編集 → タブに●。⌘S → ●が消え、
   ターミナルで `cat` すると保存内容が見える。
3. ターミナルで `echo x >> file` → クリーンなタブは即再読込。dirty のタブは黄色帯
   「再読込/このまま」。
4. `node_modules` のあるフォルダでもツリーが即表示(遅延読込)。展開しなければ読まれない。
5. 2MB 超 / バイナリ(画像等)を開く → 「表示できません」メッセージ。
6. 再起動 → フォルダ・タブ構成・アクティブファイルが復元(未保存編集は消える)。
7. テーマ切替(⌘,)→ エディタも即 Mocha/Latte 連動。フォントサイズ変更も即反映。
8. **プレビュー**: `.md` を開き「◫」→ 右半分にレンダリング。タイプすると追従。
   見出し/表/コードブロックが GitHub 風に表示され、テーマにも連動。
9. **プレビューの安全性**: `<script>alert(1)</script>` と
   `<img src=x onerror="alert(2)">` と `[x](javascript:alert(3))` を含む md を開いて
   プレビュー → 何も実行されない(script 除去・onerror 除去・リンク無効)ことを確認。
   `[link](https://example.com)` のクリック → 新規ブラウザペインで開く。
