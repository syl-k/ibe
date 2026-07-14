# M0 プロトタイプ — 検証結果

> 目的: 要件定義 [docs/requirements.md](./requirements.md) で「M0 最大の山場」とした
> **複数 `WebContentsView` を DOM 分割レイアウトに重ね合わせ、リサイズ時も座標同期できるか**
> を実機で検証する。
>
> 結論: **検証成功。**この方式で M1 以降に進める。
> 最終更新: 2026-06-30

---

## 1. 検証したこと / 結果

| # | 検証項目 | 結果 |
|---|----------|------|
| 1 | 複数の `WebContentsView` を DOM プレースホルダの矩形に重ね合わせる | ✅ ピクセル単位で一致 |
| 2 | 分割境界のドラッグ（リサイズ）で web コンテンツが追従する | ✅ 遅延・隙間・はみ出しなし |
| 3 | 実行中の動的分割で新しいビューが生成・配置される | ✅ ライブで生成＆整列 |
| 4 | 再帰分割ツリー（ブラウザ/ターミナル混在の 4 ペイン）が成立する | ✅ |

リサイズ時、web コンテンツの右端は分割バーで正確にクリップされ、境界を越えて
はみ出さないことを確認した（example.com の再ラップ、Wikipedia のレスポンシブ
レイアウト切替が分割幅に追従）。

## 2. 仕組み（要点）

- **描画方式**: Electron の `WebContentsView`（新 API）を採用。各ブラウザペイン =
  1 つの `WebContentsView` を main プロセスで保持し、`win.contentView.addChildView()`
  で UI レンダラ（DOM）の**上に**重ねる。
- **座標同期**: レイアウトはレンダラの DOM が所有する。ブラウザペインは中身が空の
  プレースホルダ `div` として描画し、その `getBoundingClientRect()`（CSS/DIP ピクセル）を
  IPC で main に送って `view.setBounds()` に渡す。getBoundingClientRect の座標系と
  setBounds の座標系（ウィンドウのコンテンツ領域基準・DIP）が一致するため、
  devicePixelRatio によるスケール補正は不要だった。
- **同期タイミング**: 初回描画後 / `window.resize` / `ResizeObserver` / 分割バー
  ドラッグ中の `requestAnimationFrame` ループ。冗長な IPC を避けるため、送信前に
  直前の bounds と比較して変化時のみ送る。
- **ビューのライフサイクル**: レンダラがレイアウトツリーのブラウザ葉 id 集合を差分し、
  新規 → `createBrowser`、消滅/種別変更 → `destroy` を IPC で指示（`reconcileBrowserViews`）。

## 3. ハマりどころ（記録）

- **`Identifier 'ibe' has already been declared`**: preload の
  `contextBridge.exposeInMainWorld("ibe", ...)` はグローバルに非設定可能(non-configurable)な
  `ibe` を定義する。レンダラを「プレーンな script（import/export なし）」として読み込んだため、
  トップレベル `const ibe` がそのグローバルと衝突した。→ レンダラ側の束縛名を `bridge` に変更して解消。
  - 補足: レンダラを ES Module 化すれば衝突は避けられるが、tsc の CommonJS 出力が
    ブラウザで `exports` を参照して別のエラーになる。今回は「script のまま別名」で回避。
    M1 でバンドラ（esbuild 等）導入時に ESM 化を再検討する。

## 4. 結論・M1 への示唆

- `WebContentsView` 重ね合わせ方式は**実用に足る**。要件 [10] の未決事項
  「ブラウザ描画の最終方式」は **`WebContentsView` で確定**してよい。
- ネイティブビューは DOM の上に重なるため、**DOM 側のモーダル/メニューがブラウザ領域に
  重なる UI** を作る場合は、その都度ビューを一時的に隠す/退避する設計が要る（M1 で考慮）。
- レンダラのビルドは現状 tsc 直＋プレーン script。レイアウト状態管理が複雑化する M1 では
  UI フレームワーク＋バンドラ導入を推奨。

---

## 5. 実行方法

```bash
npm install
npm start      # tsc ビルド → electron 起動
```

起動時のデフォルトは要件の 4 ペイン例（左 2 = ブラウザ、右 2 = ターミナル）。
各ペインのツールバー: `←/→/⟳` ナビ・アドレスバー・`T`/`B` 種別切替・`▥`/`▤` 分割・`✕` 閉じる。

### 構成
```
src/
  main/main.ts        Electron main: WebContentsView 管理 / IPC / 状態
  preload/preload.ts  contextBridge 経由の最小 API (window.ibe)
  renderer/
    index.html
    styles.css
    renderer.ts       再帰分割ツリー / 描画 / bounds 同期（プレーン script）
```

> 注: 本プロトタイプはターミナル機能を未実装（M2: node-pty + xterm.js）。
> 右ペインはプレースホルダ表示のみ。
