# M10 — ライブラリ(履歴/ブックマーク検索)+ オムニボックス強化

> 目的: 履歴・ibe ブックマーク・Chrome ミラーを1か所で検索できるビュー(⌘Y)と、
> アドレスバー候補へのブックマーク統合。
> 設計合意: [docs/plans/2026-07-02-library-design.md](./plans/2026-07-02-library-design.md)
> 最終更新: 2026-07-02

---

## 1. ライブラリ(⌘Y)

- アプリメニュー `Library…`(⌘Y、`focusThenSend` — web ペインにフォーカスがあっても開く)。
- 検索ボックス(オートフォーカス)+ タブ 3 つ:
  - **履歴**: 未入力時は `history:recent(200)` を日付見出し(今日/昨日/日付)で
    グループ化。入力時は `history:search(query, 100)`。**閲覧のみ**(削除なし・合意済み)。
  - **ブックマーク**: ibe 独自ブックマーク(件数表示)。クライアント側フィルタ。
  - **Chrome**: M9 ミラーをフラット化しフォルダパス添えで表示・フィルタ。
    プロファイル未設定時は案内文。
- 行クリック → `openUrlInBrowserPane`(フォーカス中 or 最初の browser ペイン)で開いて閉じる。
  このヘルパーは BookmarksBar から抽出した共通化([src/renderer/src/openUrl.ts](../src/renderer/src/openUrl.ts))。
- DOM オーバーレイのため表示中は native ビュー退避(`libraryOpen` → 共通 `overlayOpen`)。
  Escape / 背景クリック / ✕ で閉じる。

## 2. オムニボックス強化

- 候補 = **ブックマーク一致が先頭**(最大3件: ibe「★」・Chrome「Chrome」バッジ)+
  履歴(`history:search`)、URL 重複除去、合計 8 件。
- Chrome ツリーのフラット化は [chromeFlat.ts](../src/renderer/src/chromeFlat.ts) の純関数 +
  `useMemo`(ツリー変更時のみ再計算)。

## 3. main の変更

なし(既存の history IPC のみ使用)。

## 4. スコープ外

履歴の削除/エクスポート・ブックマーク編集・fuzzy 検索・ページ内検索。

## 5. 動作確認の要点

1. ⌘Y → ライブラリが開き検索ボックスにフォーカス。背後のビューは退避。
2. 履歴タブ: 今日/昨日の見出しでグループ表示。検索語で絞り込み。
3. Chrome タブ: フォルダパス付き一覧。検索でタイトル/URL/パスに一致。
4. 行クリック → browser ペインで開いてライブラリが閉じる。
5. アドレスバーに入力 → ブックマーク一致が「★」/「Chrome」バッジ付きで先頭に出る。
6. Escape / 背景クリックで閉じる。
