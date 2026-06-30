# M1 — レイアウト基盤

> 目的: M0 で実証した `WebContentsView` 重ね合わせ方式を土台に、保守可能な
> アーキテクチャ（React + electron-vite + Zustand）でレイアウト基盤を作り込む。
> 最終更新: 2026-06-30

---

## 1. 実装したもの / 検証結果

| 機能 | 状態 |
|------|------|
| React + electron-vite + Zustand への移行（Vite バンドラ・HMR 対応） | ✅ |
| 再帰分割レイアウト（行/列・無制限ネスト・ドラッグでリサイズ） | ✅ |
| ペインの分割 / 開閉 / ブラウザ⇄ターミナル切替 | ✅ |
| ブラウザペイン = ネイティブ `WebContentsView` 重ね合わせ（リサイズ追従） | ✅ React 経路でもピクセル同期を確認 |
| **タブ（ワークスペース）**: 追加 / 切替 / 閉じる | ✅ |
| 非アクティブタブのブラウザビューを隠す（生存はさせ、ページ状態を保持） | ✅ タブ往復でも Wikipedia の読込状態を維持 |
| キーボードショートカット（⌘T 新タブ・⌘D/⌘⇧D 分割・⌘[ /⌘] タブ移動） | ✅ |

## 2. アーキテクチャ

```
src/
  shared/ipc.ts          main/preload/renderer 共有の IPC 契約（型）
  main/index.ts          WebContentsView 管理 / IPC（create,setBounds,setVisible,...）
  preload/index.ts       contextBridge 経由の最小 API (window.ibe)
  renderer/
    index.html
    src/
      main.tsx           React エントリ
      App.tsx            全体配線（bounds 同期・リサイズ監視・ナビ状態・ショートカット）
      store.ts           Zustand: tabs / activeTab / focusedPane と各アクション
      tree.ts            レイアウトツリーの純粋関数（split/remove/transform/...）
      types.ts           LayoutNode / Tab 型
      boundsSync.ts       rAF で束ねた bounds 再同期トリガ
      hooks/useBrowserViews.ts  ビューのライフサイクル + 可視制御 + bounds 同期
      components/         TabBar / SplitView / Pane / BrowserPane / TerminalPane / PaneActions
```

### 状態モデル
- `Tab[]` それぞれが 1 つのレイアウトツリー（`LayoutNode` の二分木）を持つ。
- ブラウザペインは中身が空のプレースホルダ `div`（`data-browser-id`）として描画し、
  その `getBoundingClientRect()` を IPC で main に送って `WebContentsView.setBounds()` に渡す。
- 非アクティブタブのペインは DOM に存在しない → そのビューは `setVisible(false)` で隠し、
  破棄はしない（ページ状態を保持）。アクティブ復帰時に再表示 + bounds 再同期。

## 3. ハマりどころ（記録）

- **エフェクト順序によるブラウザ未表示**: ビュー生成を `useEffect`（描画後）で行うと、
  bounds 同期の `useLayoutEffect`（描画前）が先に走り、`setBounds` がビュー生成前に届いて
  無視され、ビューが 0×0 のまま見えなくなった。→ ライフサイクル系を `useLayoutEffect` 化して
  「生成 → bounds 同期」の順序を保証して解消。

## 4. 既知の制約 / M1 で見送った点

- ターミナルは未実装のプレースホルダ（M2: node-pty + xterm.js）。
- 状態の永続化（レイアウト/タブ/URL の復元）は未実装（M4）。現状は毎起動クリーン。
- ネイティブビューは DOM の上に重なるため、ブラウザ領域に重なる DOM の
  モーダル/メニューを出す場合はビューの一時退避が必要（未対応）。
- タブ名は自動採番のみ（リネーム未対応）。

## 5. 実行方法

```bash
npm install
npm run dev      # electron-vite dev（HMR 付き）
npm run build    # 本番ビルド
npm start        # ビルド済みをプレビュー起動（= electron-vite preview）
```
