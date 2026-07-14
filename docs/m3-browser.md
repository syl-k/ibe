# M3 — ブラウザ統合（作り込み）

> 目的: M1 で動く最小ブラウザになったペインを、実際に使えるブラウザに引き上げる。
> ナビゲーションUI・リンクのペイン割り当て・ブックマーク・履歴を加える。
> 最終更新: 2026-06-30

> 注: 基本の URL 入力・表示・戻る/進むは M1 で実装済み。本マイルストーンはその差分。

---

## 1. 実装したもの / 検証結果

| 機能 | 状態 |
|------|------|
| ローディング状態 + 停止/リロードのトグル | ✅ |
| ファビコン表示・ページタイトル（ツールチップ） | ✅ Wikipedia/GitHub のファビコン確認 |
| 戻る/進むの活性制御（実履歴に基づく） | ✅ リダイレクト跨ぎで back が活性化 |
| アドレスバーがリダイレクト/ページ内遷移に追従 | ✅ |
| **リンクの新規ウィンドウ要求を新規ペインで開く** | ✅ Cmd+クリックで 4→5 ペイン |
| Cmd+L（アドレスバーへ）/ Cmd+R（リロード） | ✅ |
| **ブックマーク**（★トグル + バー + クリックで遷移、永続化） | ✅ 再起動後も保持 |
| **履歴**（記録 + 永続化 + アドレスバー候補） | ✅ 再起動後も候補表示 |

## 2. 主要な実装ポイント

### ブラウザ chrome の状態（loading / favicon / nav）
- main が `did-start/stop-loading`・`page-favicon-updated`・`did-navigate` 等を監視し、
  `BrowserState`（url/title/loading/favicon/canGoBack/canGoForward）を renderer に送る。
- renderer は **レイアウトツリーとは別の `viewState`（ペインIDキー）** に保持。url だけは
  ツリーにも反映（アドレスバー表示・将来の永続化のため）。

### リンクのペイン割り当て（in-app new-window）
- 各ブラウザ view の `setWindowOpenHandler` は OS ブラウザを開かず、
  `browser:open-new {fromId, url}` を renderer に送って **deny**。
- renderer は発生元ペインを左右分割し、新しい子ペインに対象 URL を開く（`openInNewPane`）。

### ブックマーク（永続化）
- main 所有。`userData/bookmarks.json` に保存。`list/add/remove`（invoke）と
  変更ブロードキャスト。バーは chrome 領域に置くのでネイティブ view と干渉しない。

### 履歴（永続化 + 候補）
- main 所有。`did-navigate` / `page-title-updated` で `recordVisit`（同一 URL は最新へ集約、
  タイトル更新）。`userData/history.json` に 1s デバウンス保存、上限 3000 件。
- アドレスバー入力で `history:search`（部分一致・最新優先）。候補ドロップダウンを表示。

### 候補ドロップダウンとネイティブ view の重なり問題
- ネイティブ `WebContentsView` は DOM の上に重なるため、コンテンツ領域に出す
  ドロップダウンは通常 view の裏に隠れる。
- 解決: **そのペインの view を一時的に retract（`setVisible(false)`）** して、空いた領域に
  DOM ドロップダウンを表示する。可視性の単一管理点として `useBrowserViews` に
  `omniboxPaneId` を渡し、`shouldShow = activeTab かつ omnibox 対象でない` と一元化。
  → メニューや find-in-page 等、今後の「chrome を view の上に出す」需要にも再利用可能。

## 3. ハマりどころ（記録）

- 候補クリック後にアドレスバーが入力文字列のままになる（`node.url` を入力フォーカス中に
  更新したため同期 effect が走らない）。→ `go()` で `setDraft(url)` を明示して解消。

## 4. 既知の制約 / 見送り

- 履歴の専用ビュー（一覧/削除 UI）は未実装（候補のみ）。`history:recent` は用意済み。
- ファビコン未提供サイトは `data:,` が入ることがある（表示は空）。実害なし。
- リモートファビコンを chrome の `img` で読むため CSP に `img-src https: data:` を許可
  （ページ本体は別 `WebContentsView` に隔離されており本 CSP 非対象）。
- Chrome 拡張・複数プロファイルは引き続き対象外（要件の MVP 後項目）。
- レイアウト/タブ/URL の永続化は M4。ブックマーク/履歴の保存は本マイルストーンで先行実装。

## 5. 動作確認の要点

1. ファビコン表示・back/forward の活性、停止/リロードのトグル。
2. ページ内リンクを Cmd+クリック → 新規ペインで開く。
3. ★でブックマーク → バーに出る → クリックで遷移 → 再起動後も残る。
4. 数サイト訪問後、アドレスバーに部分文字列入力 → 履歴候補が出る（view が retract）→
   クリックで遷移 → 再起動後も候補が残る。
