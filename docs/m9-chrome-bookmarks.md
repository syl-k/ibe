# M9 — Chrome ブックマーク同期(参照・自動追従)

> 目的: Chrome のブックマークを ibe から参照できるようにする。Chrome 本体の
> Google アカウント同期を経由するため、実質「別デバイス → ibe」方向のアカウント同期になる。
> 設計合意: [docs/plans/2026-07-02-chrome-bookmarks-design.md](./plans/2026-07-02-chrome-bookmarks-design.md)
> 最終更新: 2026-07-02

---

## 1. 仕組み(なぜこれが「同期」になるか)

Chrome Sync API は 2021 年にサードパーティから遮断されたため、Google アカウントへの直接接続は
不可能。代わりにローカルの Chrome プロファイルの `Bookmarks`(JSON)を読む:

```
別PC/スマホ → Google アカウント → このMacの Chrome(公式同期) → Bookmarks ファイル → ibe(監視・自動追従)
```

- **別デバイス → ibe**: Chrome が同期した瞬間に ibe に反映される ✅
- **ibe → 別デバイス**: 不可(ibe は Chrome のファイルに一切書かない。読み取り専用)❌
- 前提: このMacの Chrome がログイン・同期ON で、ときどき起動されること。

## 2. 実装

| 部品 | 内容 |
|------|------|
| [src/main/chromeParse.ts](../src/main/chromeParse.ts) | 純関数: Bookmarks JSON→ツリー変換・`Local State`→プロファイル表示名・プロファイル id 検証(`Default`/`Profile N` のみ許可、トラバーサル拒否)。実データ(1,752件)含めユニットテスト済み |
| [src/main/chromeBookmarks.ts](../src/main/chromeBookmarks.ts) | `chrome:profiles`(Bookmarks を持つプロファイル一覧)・`chrome:get`(パース+watcher 張り替え)。**ディレクトリを watch**(Chrome は rename で書き換えるためファイル watch は切れる)・500ms デバウンス・空パース(rename 途中の torn read)では配信しない |
| 設定 | `Settings.chromeProfile`("" = 無効)。設定モーダルにプロファイルのドロップダウン(表示名 + id) |
| UI | ブックマークバー左端の「Chrome ▾」→ フォルダツリーのドロップダウン(展開式・件数表示)。URL クリックで既存ブックマークと同じ「フォーカス中 or 最初の browser ペイン」で開く |
| ビュー退避 | ドロップダウンは DOM のため、開いている間は全ブラウザビューを退避(`chromeMenuOpen` — settings と同じ`overlayOpen` 機構) |

## 3. 既知の制約 / 見送り

- 読み取り専用(ibe 内での Chrome ブックマーク追加・編集・削除は不可。ibe 独自ブックマークは従来どおり)。
- ibe→Google アカウント方向なし(正攻法は Chrome 拡張ブリッジ。将来検討)。
- パスワード同期は見送り(公開 API なし・キーチェーン復号は脆く責任が重い。将来は Bitwarden/1Password 等の公式 API を検討)。
- favicon なし(Chrome の Favicons DB は読まない)。検索なし。

## 4. 動作確認の要点

1. 設定(⌘,)→「Chrome ブックマーク」→ プロファイルを選択(例: T (Default))。
2. ブックマークバーに「Chrome ▾」が出る → クリック → ブックマークバー/その他がツリー表示。
3. フォルダ展開 → URL クリック → browser ペインで開き、メニューが閉じる。
4. Chrome 側でブックマークを追加/削除 → 数秒以内に ibe のツリーに反映(メニューを開き直して確認)。
5. 設定で「同期しない」→「Chrome ▾」が消える。再起動後も選択が復元される。
