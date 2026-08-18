# 実装仕様

コードと1:1で対応する実装仕様を置きます。DocBridgeでコードと双方向にリンクし、
実装と仕様の乖離をCIで検出します。

## Notion・ADRとの使い分け

| 置き場所          | 責務                                                 |
| ----------------- | ---------------------------------------------------- |
| Notion            | 現在の仕様・方針・調査進捗（プロダクト観点の全体像） |
| `docs/decisions/` | 確定した重要判断とその理由（ADR、更新しない記録）    |
| `docs/specs/`     | コードと対応する実装仕様（コードと同時に更新する）   |

同じ内容をNotionと`docs/specs/`へ詳細に複製しないでください。`docs/specs/`には
実装の振る舞い・入出力・制約など、コードと突き合わせて検証できる粒度だけを書きます。

## リンクの張り方

コード側に`@doc`、Markdown側に`@code`のアンカーを張ります。

```ts
/**
 * @doc docs/specs/keymap-validation.md#layer-reachability
 */
export function validateLayerReachability() {
  // ...
}
```

```md
<!-- @code src/core/validation/layer.ts#validateLayerReachability -->

## Layer Reachability

Baseレイヤーから到達できないレイヤーを検出する。
```

## 運用

```bash
just docbridge-check   # リンク切れ検証（CIでも実行）
just docbridge-audit   # 未ドキュメントのsymbol・未リンクのsectionを監査
```

リンクの追加・維持は`docbridge`スキルを使います。導入・リンク候補の洗い出し・アノテーション・
レビュー・related-gateの処理まで、スキル内のタスクルーターが振り分けます。
