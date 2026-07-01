# M5 — OSS 整備

> 目的: OSS として公開・配布できる状態に整える（ドキュメント・CI・配布ビルド）。
> 最終更新: 2026-07-01

---

## 1. 実装したもの

| 項目 | 状態 |
|------|------|
| README（概要・特徴・開発/ビルド・ショートカット・アーキテクチャ・ロードマップ） | ✅ |
| CONTRIBUTING（開発手順・事前チェック・スタイル方針） | ✅ |
| LICENSE（MIT） | ✅（既存） |
| CI（GitHub Actions: typecheck + build） | ✅ |
| 配布ビルド（electron-builder → dmg / zip） | ✅ 実機で生成・起動確認 |

## 2. CI

`.github/workflows/ci.yml`。**macOS ランナー**で実行（`node-pty` がネイティブ・
アプリが macOS 対象のため）。push（main）と PR で `npm ci` → `typecheck` → `build`。

`npm ci` の postinstall で `electron-builder install-app-deps` が走り、node-pty を
Electron 向けにリビルドする。

## 3. 配布ビルド

`electron-builder.yml` + `npm run dist`（= `electron-vite build && electron-builder --mac`）。

- 出力: `release/`（`ibe-<ver>-arm64.dmg`, `...-mac.zip`）。
- **ネイティブモジュール**: `node-pty` を `asarUnpack` で asar の外に出す（native バイナリと
  spawn-helper を実行できるようにするため）。production 依存は electron-builder が自動同梱。
- 署名: **ローカルは未署名**（`mac.identity: null`）。配布時は署名 + notarization が必要。
- アイコン: 未設定（Electron 既定アイコン）。将来 `build/icon.icns` を追加予定。

### ネイティブリビルドの一元化
`@electron/rebuild` の直接依存を外し、`postinstall` / `rebuild` を
`electron-builder install-app-deps` に統一（electron-builder の推奨。二重リビルドの解消）。

## 4. 検証（macOS, Apple Silicon）

- `npm run dist` で dmg（約 97MB）と zip（約 94MB）を生成。
- `release/mac-arm64/ibe.app` を起動 → セッション復元・カスタムメニュー表示を確認。
- パッケージ版のターミナルで `echo` を実行し出力を確認 → **node-pty が配布物でも動作**
  （native モジュールの同梱・asar 展開が正しいことの確証）。

## 5. 残タスク（配布を実運用にするなら）

- Developer ID 署名 + notarization（Gatekeeper 対応）。
- アプリアイコン（`build/icon.icns`）。
- Universal（arm64 + x64）ビルド、および Windows / Linux ターゲット（要件外だが将来）。
- リリース自動化（タグ push で電子ビルド + GitHub Releases への publish）。
