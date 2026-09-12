# コミットメッセージの @layer が GitHub メンション化した件の対処

作業日: 2026-09-12。

旧 9a186f7 のコミットメッセージに含まれる「@layer」（CSS の at-rule 名）が、
GitHub 上で無関係な organization `layer` へのメンションとしてリンク化されていた。

## 調査（Fact / Inference）

- Fact: GitHub の `layer` は個人ではなく organization。
- Fact: 該当コミットは件名に加え、本文のバッククォート内にも `@layer ...` を含んでいた。
  コミットメッセージは Markdown として描画されないため、バッククォートでは
  メンションのリンク化を抑止できない。
- Fact: 裸の @token を含むコミットは履歴全体でこの 1 件のみ（push 済み履歴を全走査）。
- Inference: GitHub の通知は user / team メンションに送られる仕組みのため、
  非メンバーによる組織名の裸メンションで個々のメンバーへ通知が飛んだ可能性は低い
  （GitHub は明文化しておらず断定はできない）。残る実害はコミットページ上の
  無関係なリンク表示のみ。

## 対処（Decision）

履歴を書き換えた。`git commit-tree` で対象コミットのメッセージのみ修正し
（「@layer」→「CSS layer規則」等）、後続 8 コミットを author / committer の
名前・メール・日時を保持したまま再構築して force-push した。
旧 head a6490e2 → 新 head a2e87bd。tree は全コミットで旧履歴と完全一致。

- 書き換えでも送信済み通知（あれば）は取り消せない。旧オブジェクトは SHA 直打ちでは
  当面 GitHub 上に残る。
- 他マシンの clone は divergence するため `git fetch && git reset --hard origin/main`
  が必要（MacBook 側）。

## 再発予防（Decision）

pre-commit の commit-msg ステージに `tools/check-commit-msg.sh` を追加し、
裸の @token（直前が非単語文字の `@英数字`）を含むコミットメッセージを拒否する。
メールアドレス（`user@host`）と comment 行（`#` 始まり）は対象外。
`just setup` に `--hook-type commit-msg` を追加した。
