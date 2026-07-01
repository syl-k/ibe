# コントリビュートガイド

ibe への貢献に興味を持っていただきありがとうございます。

## 開発環境

- macOS（当面の対象プラットフォーム）
- Node.js 20 以上

```bash
git clone https://github.com/<owner>/ibe.git
cd ibe
npm install     # node-pty のネイティブリビルドを含む
npm run dev     # 開発モード（HMR）
```

## 送る前に

以下がローカルで通ることを確認してください。

```bash
npm run typecheck   # 型チェック（CI でも実行）
npm run build       # 本番ビルドが通ること
```

UI や挙動を変えた場合は、実際にアプリを起動して手元で動作確認をお願いします
（`npm run dev` または `npm start`）。

## ブランチ / コミット

- ブランチ名: `feat/...`, `fix/...`, `docs/...` など。
- コミットメッセージは **何を・なぜ** が分かる粒度で。1コミット1トピックを目安に。
- 大きな変更はパートに分けて段階的にコミットしてください（本リポジトリの履歴を参照）。

## コードスタイル

- TypeScript / React。周囲のコードのスタイル（命名・コメント量・イディオム）に合わせる。
- `main` / `preload` / `renderer` の境界を尊重し、IPC は `src/shared/ipc.ts` の型契約経由で。
- レンダラの権限は最小に（`contextIsolation` 有効・`nodeIntegration` 無効を維持）。
  Node / pty への口は preload の `window.ibe` に閉じる。

## 設計ドキュメント

各マイルストーンの設計は [docs/](docs/) にあります。挙動の背景や既知の制約は
まずここを参照してください。

## ライセンス

コントリビュートされたコードは [MIT ライセンス](LICENSE) の下で公開されます。
