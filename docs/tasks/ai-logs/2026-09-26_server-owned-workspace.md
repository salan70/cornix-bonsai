# Web UI の workspace 選択をやめ、keysync リポジトリに固定する

2026-09-26。
Mac 内蔵キーボードの運用手順を説明するなかで、「Web UI で keysync リポジトリを選ぶ」手順に理由が無いと利用者が指摘した。

## Fact

- `just ui` のサーバーは起動時に workspace を決めている（`$KEYSYNC_WORKSPACE` > repository root）。
- Web UI はそれと無関係に、File System Access API で選んだ directory を読み書きしていた。Mac 適用は digest で同じファイルかを確かめていた。
- `~/Projects` 配下に `keymap.yaml` は 1 つも無く、Cornix LP の設定は dotfiles の `.vil` で運用されている。
- Vite 7 の設定ファイルから `src/server/api.ts` を import すると、`import.meta.dirname` は元ファイルの位置で解決された。`just dev` の API が repository root を返すことを curl で確認した。
- 更新した UI を port 5188 のスクラッチサーバーで配信し、headless Chrome で確認した。起動すると directory を選ばずに workspace が開き、header に `keysync` と「この Mac」が出た。API の無い静的配信では「ローカルサーバーに接続できない」の入口が出た。
- 既存の `just ui`（port 5178）は起動中だったため止めていない。

## Decision

ADR 0038 に記録した。
Cornix LP と Mac の workspace を keysync リポジトリに固定し、Web UI はサーバーの workspace API でファイルを読み書きする。
CLI の全サブコマンドも同じ既定を使う。

## Inference

- Mac 適用の digest 照合は、別 directory を選ぶ事故が無くなっても、保存途中や外部変更後の古い画面からの適用を止める役目が残る。

## 追記: workspace を dotfiles へ移す

`mac-keyboard.ansi.yaml` を keysync リポジトリで commit するか相談され、利用者は dotfiles で管理する運用を選んだ。
未設定時の挙動は、エラーで止める案を利用者が選んだ。

- Fact: dotfiles は `config/<app>/` に設定を置き、zsh の `zshrc.d/` は `~/.config/zsh/` から dotfiles の実体へ symlink されている。`${(%):-%x}:A` で dotfiles の位置が求まることを確かめた。
- Decision: ADR 0039 に記録した。`$KEYSYNC_WORKSPACE` を必須にし、keysync リポジトリの root から `mac-keyboard.ansi.yaml` を外した。
- dotfiles 側は `config/keysync/` を作り、適用済みの `mac-keyboard.ansi.yaml` と Karabiner のバックアップを移した。`30-tools.zsh` が `KEYSYNC_WORKSPACE` を export する。dotfiles は利用者の指示で commit していない。

## Open Question

- 利用者の Cornix LP の `keymap.yaml` はまだ無い。実機の full read か `just keysync import vil` で dotfiles の workspace に作るかは利用者が決める。
