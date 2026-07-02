# M10 — ライブラリ(履歴/ブックマーク検索)+ オムニボックス強化 設計

> 決定事項: ⌘Y のライブラリオーバーレイ + オムニボックス候補へのブックマーク統合。
> 履歴は閲覧のみ(削除なし)。作成: 2026-07-02(ブレインストーミングで合意済み)

## 1. ライブラリオーバーレイ(⌘Y)

- アプリメニュー `Library…`(⌘Y, `focusThenSend`)→ `shortcut:"open-library"` →
  `store.libraryOpen`。表示中は `overlayOpen`(settings/Chrome メニューと同機構)で
  native ビュー退避。Escape / 背景クリック / ✕ で閉じる。
- パネル: 検索ボックス(オートフォーカス)+ タブ 3 つ。
  - **履歴**: `history:recent(200)` を日付見出し(今日/昨日/日付)でグループ化。
    検索時は `history:search(query, 100)`。閲覧のみ。
  - **ブックマーク**: store の ibe ブックマークをクライアント側フィルタ。
  - **Chrome**: M9 ミラーをフラット化しフォルダパス添えで表示・フィルタ。
- クリック → 「フォーカス中 or 最初の browser ペイン」で開いて閉じる。この開くロジックは
  BookmarksBar から **`openUrl.ts` の共通ヘルパーに抽出**して共用。

## 2. オムニボックス強化

- 候補 = ブックマーク一致(ibe「★」+ Chrome「Chrome」バッジ、先頭最大3件)
  + `history:search`、URL 重複除去、合計 8 件。
- Chrome ツリーのフラット化は `chromeFlat.ts` の純関数 + useMemo。

## 3. main の変更

なし(既存 IPC のみ)。新規はすべて renderer + menu.ts の1項目。

## 4. スコープ外

履歴の削除・エクスポート、ブックマークの編集、あいまい検索(fuzzy)、ページ内検索。
