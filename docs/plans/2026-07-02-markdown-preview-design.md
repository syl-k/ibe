# M8.1 — Markdown プレビュー 設計

> 決定事項: 並列表示・ライブ更新(エディタ右半分にプレビュー、150ms デバウンス)。
> 作成: 2026-07-02(ブレインストーミングで合意済み)

## 1. レンダリングとセキュリティ(核心)

- `marked`(GFM・同期)+ `DOMPurify`。
- プレビューは「信頼できない入力を renderer の DOM に注入する」操作。renderer は
  `window.ibe`(ファイル書換・pty 入力等)を持つため、悪意ある md の `<script>` /
  `<img onerror>` が実行されると開いただけで任意操作につながる。よって:
  - marked の出力は**必ず DOMPurify を通してから** innerHTML へ。
  - URI は `https?:` / `#` のみ許可(`javascript:` / `file:` / `data:` を遮断。
    ローカル画像は v1 では表示されない)。
  - リンクは delegate で捕捉して preventDefault、`http(s)` のみ既存の
    `openInNewPane` で**新規ブラウザペイン**に開く(ibe の思想に一致)。

## 2. UI / データフロー

- activeFile が `.md` / `.markdown` のときツールバーに「◫」トグル。ON で
  エディタ右に flex 50/50 のプレビュー。トグルはペインのローカル state(非永続)。
- EditorPane は既にバッファ購読済 → `activeBuf.text` を 150ms デバウンスで
  marked+DOMPurify → `.md-preview` に反映(ライブ更新)。
- スタイルは GitHub 風簡易ルール。色は CSS 変数で Mocha/Latte 連動。
- 新規依存: marked / dompurify のみ。

## 3. スコープ外

ローカル画像(相対パス)表示・スクロール同期・プレビューのみ全画面・エクスポート。
