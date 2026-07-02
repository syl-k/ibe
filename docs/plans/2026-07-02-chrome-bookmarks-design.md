# M9 — Chrome ブックマーク同期(参照・自動追従)設計

> 決定事項: Chrome→ibe の読み取り専用・自動追従。パスワードは見送り。
> 経路: 別PC → Google アカウント → このMacの Chrome(公式同期) → Bookmarks ファイル → ibe。
> ibe→Chrome 方向は書かない(Chrome 起動中の書換は Chrome が上書きするため危険、かつ不要)。
> 作成: 2026-07-02(ブレインストーミングで合意済み)

## 1. 背景 / 制約

- Chrome Sync API は 2021 年にサードパーティ遮断。Google アカウントへの直接接続は不可能。
- ローカルの `~/Library/Application Support/Google/Chrome/<Profile>/Bookmarks`(JSON)が
  「アカウントの最新状態」なので、これを読む＝実質アカウント同期(別PC→ibe 方向)。
- このマシンは 13 プロファイル・Default に約 1,750 件。フラット展開は不可能な規模なので
  **フォルダツリーのままドロップダウンで見せる**。

## 2. main(src/main/chromeBookmarks.ts)

- `chrome:profiles` — `Local State` の `profile.info_cache` から `{ id, name }` 一覧
  (name は表示名。Bookmarks ファイルが存在するもののみ)。
- `chrome:get(profileId)` — Bookmarks JSON を読み、`ChromeBookmarkNode { name, url?, children? }`
  のツリーに変換して返す(roots.bookmark_bar / roots.other を「ブックマークバー」「その他」の
  2トップフォルダに)。呼ばれたら**そのプロファイルの監視を張り替える**。
- 監視: Chrome は Bookmarks を rename で書き換えるため、**ファイルでなくディレクトリを
  fs.watch** し `Bookmarks` のイベントを 500ms デバウンス → 再パースして
  `chrome:bookmarks-change` をブロードキャスト。
- パスは Chrome ディレクトリ配下に固定(プロファイル id はディレクトリ名として検証。
  `..` や絶対パスを拒否)。JSON→ツリー変換は純関数(chromeParse.ts)に切り出しテスト。

## 3. 設定 / renderer

- `Settings.chromeProfile: string`("" = 無効)。設定モーダルに「Chrome ブックマーク」
  ドロップダウン(プロファイル一覧 + 同期しない)。
- store: `chromeBookmarks: ChromeBookmarkNode[]`(ライブ状態、非永続)と
  `chromeMenuOpen`。App が `settings.chromeProfile` を購読して get + onChange 購読。
- BookmarksBar 左端に「Chrome ▾」ボタン(プロファイル設定時のみ)。クリックで
  フォルダツリーのドロップダウン(展開式)。URL クリック → 既存 `open()` と同じ
  「フォーカス中 or 最初の browser ペインで開く」。
- ドロップダウンは DOM なので、開いている間は **全ブラウザビューを退避**
  (settingsOpen と同じ仕組みに `chromeMenuOpen` を追加)。

## 4. スコープ外

ibe→Chrome 書き込み・パスワード・favicon 取得(Chrome の favicon DB は読まない)・
複数プロファイル同時表示・検索。
