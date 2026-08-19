# D-002 Spike: `keymap.yaml`の候補schema

Git管理するdesired stateのschemaを決めるための使い捨てコードです。本実装ではありません。
判断の結果は`docs/decisions/0009-keymap-yaml-schema.md`にあります。

**実機もbrowserも不要です。**

## 実行

```bash
nix develop -c node spikes/d-002-keymap-yaml/self-check.mjs
```

## 構成

| file             | 役割                                            |
| ---------------- | ----------------------------------------------- |
| `candidates.mjs` | 候補schema 3案のemitter                         |
| `self-check.mjs` | 代表fixtureでの比較と、引用規則が要ることの確認 |

## 比較する軸

3案とも**載せる情報は同じ**（`VilDocument`の可逆な射影）にして、差を並べ方だけに絞ります。
schemaの表現力ではなく、Git diffの読みやすさとAIによる安全な編集だけを比較するためです。

| 案  | 並べ方                                            |
| --- | ------------------------------------------------- |
| A   | raw JSONの構造をそのままblock styleのYAMLへ写す   |
| B   | layerごとのblock、rowをflow sequenceで1行に置く   |
| C   | 位置をkeyにして1キー1行に置く（`L0.r0.c0: KC_A`） |

## 結果（`fixtures/cornix-lp/baseline.vil`）

| 案  | 全体行数 | 1キー変更のdiff行数 | layer追加のdiff行数 |
| --- | -------- | ------------------- | ------------------- |
| A   | 659      | 2                   | 65                  |
| B   | 99       | 2                   | 9                   |
| C   | 569      | 2                   | 56                  |

1キー変更のdiffは3案とも2行で差がつきません。差がつくのは**全体行数**で、案Bが案A・案Cの
6分の1以下になります。案Bだけがrowを1行に保つため、diffのhunkに物理配列の格子が残ります。

## 引用規則

`edge-cases.vil`に含まれるhex表記のkeycode`"0x1234"`は、引用しないとYAMLが整数`4660`として
読みます。keycode文字列は**必ず引用**します。物理キー無しの`-1`は数値のまま置き、
`KC_NO`（キーはあるが未割り当て）と区別します。
