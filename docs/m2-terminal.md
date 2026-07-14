# M2 — ターミナル統合

> 目的: ブラウザペインと並ぶもう一方の柱、ターミナルを node-pty + xterm.js で実装する。
> ログインシェルをそのまま起動し、1ペイン内で複数セッション（ペイン内タブ）を持てるようにする。
> 最終更新: 2026-06-30

---

## 1. 実装したもの / 検証結果

| 機能 | 状態 |
|------|------|
| node-pty によるログインシェル起動（`$SHELL -l`、cwd=home、`xterm-256color`） | ✅ zsh ログインシェルで確認 |
| xterm.js + FitAddon による描画・リサイズ追従 | ✅ |
| 実I/O（キー入力 → pty、pty出力 → 描画） | ✅ `uname` / `pwd` / コマンド置換を確認 |
| タブ切替でターミナルが消えない（スクロールバック保持・再生） | ✅ 往復後もマーカー出力が残存 |
| **ペイン内セッションタブ（複数シェル）**: 追加 / 切替 / 閉じる | ✅ |
| セッションごとに独立したスクロールバック | ✅ session-1 / session-2 を相互に保持 |
| 最後のセッションを閉じるとペインも閉じる | ✅ |
| ウィンドウ/アプリ終了で全 pty を kill | ✅ |

## 2. アーキテクチャ

```
main/pty.ts          1セッション=1 pty（node-pty）。Map<sessionId, {proc, buffer, attached}>
  term:create        ログインシェルを spawn（冪等）。出力は 256KB のリングバッファに蓄積
  term:attach        backlog を一括送信し、以後ライブ配信を開始（attached=true）
  term:detach        ライブ配信停止（pty とバッファは生存）
  term:input/resize/destroy
  term:data / term:exit  → renderer へ送信
preload/index.ts     window.ibe.term（生の pty ハンドルは渡さない）
renderer/
  hooks/useTerminals.ts  全タブの「セッションID集合」を diff し pty を create/destroy
                         （ライフサイクルはマウントから独立 = useBrowserViews と同思想）
  components/TerminalPane.tsx   セッションタブの帯 + アクティブセッションの TerminalView
  components/TerminalView.tsx   1つの xterm。sessionId を key にして切替時に remount
```

### なぜ pty を main に置くか
renderer は `sandbox: true` / `nodeIntegration: false`。ネイティブアドオン（node-pty）は
Node ランタイムを必要とするため main プロセスに置く。renderer へは preload の
narrow bridge 経由でのみ操作を公開する（最小権限）。

### スクロールバックの保持と「アタッチ後のみライブ配信」
- pty 出力は常に main 側のリングバッファ（256KB）へ蓄積。
- `attach` 前はライブ配信しない。`attach` 時にバッファ全体を1回送って画面を再構成し、
  以後ライブ配信する。これによりタブ/セッション切替（xterm の unmount→remount）でも
  取りこぼし・二重表示が起きない。

## 3. ネイティブモジュール（node-pty）の扱い

- main バンドルでは `externalizeDepsPlugin()` で node-pty を **external** に（Vite でバンドルしない）。
- `postinstall` で `electron-rebuild -f -w node-pty` を実行し、Electron の ABI 向けにビルド。
  コントリビューターは `npm install` だけでネイティブビルドまで揃う。手動再ビルドは `npm run rebuild`。

## 4. ハマりどころ（記録）

- **エフェクト順序**: pty 生成（`useTerminals` の `useLayoutEffect`）は xterm の attach
  （`TerminalView` の `useEffect`）より前に走る必要がある。React は全 layout effect を
  全 passive effect より先に実行するため、生成=layout / attach=passive とすることで
  「生成 → attach」の順序が保証される（M1 のブラウザビルドと同型の問題）。

## 5. 既知の制約 / 見送り

- セッションのリネーム・並び替えは未対応（番号表示のみ）。
- pty のスクロールバックは 256KB 上限（超過分は切り捨て）。xterm 側の表示行数は既定。
- 状態の永続化（M4）は未対応。ターミナルのプロセスは仕様どおり復元対象外
  （レイアウト/タブ/URL のみ M4 で復元予定）。
- シェル統合（cwd 検知・OSC 7 等）は未実装。

## 6. 動作確認の要点（再現手順）

1. `npm install && npm start`
2. 右側ターミナルでコマンド実行（例: `uname -sm`）→ 出力されること。
3. タブ ＋ で新ワークスペース → 戻る → スクロールバックが残ること。
4. ターミナル toolbar の ＋ でセッション追加 → 別シェルが起動。
5. セッションタブを行き来 → それぞれの履歴が独立して保持されること。
6. セッション ✕ で閉じる → pty が破棄され、残りのセッションに切り替わること。
