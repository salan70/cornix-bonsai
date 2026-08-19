# D-004 Spike: workspaceとlocalhost service

Browserとworkspaceの間にlocal serviceが要るかを判断するための使い捨てコードです。
本実装ではありません。判断の結果は`docs/decisions/0007-workspace-layout.md`にあります。

**実機は不要です。**

## 実行

offline（browserも不要）。配置規則とdefinitionの対応づけを検証します。

```bash
nix develop -c node spikes/d-004-workspace/self-check.mjs
```

browser（**ユーザーが操作します**）。File System Access APIの権限復帰を確認します。

```bash
nix develop -c node spikes/d-004-workspace/serve.mjs
# http://localhost:8177/d-004-workspace/index.html を Chromium 系 browser で開く
```

公開rootを`spikes/`に置いているのはR-004 / R-005 と同じ理由で、
`/`でindex.htmlを返すと相対importが解決できなくなるためです。

## 構成

| file             | 役割                                                     |
| ---------------- | -------------------------------------------------------- |
| `workspace.mjs`  | 配置規則、definitionのcontent-addressing、対応づけの検証 |
| `self-check.mjs` | 実機もbrowserも要らない検証                              |
| `serve.mjs`      | browser probe用の静的server（公開rootは`spikes/`）       |
| `index.html`     | browser probe。手順0〜4のボタンを人間が押す              |

## 確かめること

手順3が核心です。**リロード後に、ディレクトリを選び直さずに読み書きできるか。**
できるなら、file watchingとworkspace APIのためだけにlocal Node serviceを置く理由が消えます。

手順4は、AIエージェントやCLIが同じディレクトリを直接編集したときに、
browser側がその変更を読めるかの確認です。

## 手動確認の記録欄

実行したら結果をここへ追記してください。

- 手順0（環境）:
- 手順1（ディレクトリ選択）:
- 手順3（リロード後の権限）:
- 手順4（外部変更の読み取り）:
