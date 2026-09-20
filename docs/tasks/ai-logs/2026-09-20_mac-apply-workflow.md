# Mac 内蔵キーボードの運用を 2 コマンドへ畳む

2026-09-20。実運用へ載せる手順を確認する過程で、手数と欠陥の両方が出たため対応した。

## Fact

- 反映までに 5 手あった。`mac generate` → `mac diff` → `mac apply` → `mac apply --confirm`
  → `karabiner_cli --select-profile`
- `just cornix` はリポジトリ root から走るため、すべてに `--workspace` が要った
- **初回 apply は成功しても何も起きなかった。** `planMacApply` の
  `mac-keymap/profile-not-selected` は `before !== undefined && before.selected !== true` で
  判定しており、profile を新規追加する初回は `before === undefined` なので無診断で通る
- 実機（ANSI の MacBook）で generate → diff → apply → verify を scratch コピーに対して
  通し、`karabiner_cli --lint-complex-modifications` が `: ok` を返すことを確認した
- `karabiner_cli` は `--select-profile`、`--show-current-profile-name`、
  `--list-profile-names` を持つ
- 適用前の `~/.config/karabiner/karabiner.json` は `Default profile` 1 つだけで、
  `Cornix Bonsai` は存在しなかった

## Decision

ADR 0028 に記録した。profile 選択を CLI が行い、既定 workspace をこのリポジトリに固定する。
lint を書き込み前のゲートへ移す。選択の要否は「適用後に所有 profile が有効な profile に
なっているか」で判定し、profile が既存かどうかとは独立にする。

## Inference

- dotfiles の `com.apple.keyboard.modifiermapping.0-0-0`（Caps Lock → 右 Control、全キーボード
  対象）と Karabiner の `from` の前後関係は未検証。Karabiner に届くのが `caps_lock` か
  `right_control` かで、書くべき位置が変わる

## Open Question

- 上記の前後関係。Spike R-007 で実測するまで `mac-keyboard.*.yaml` へ `caps_lock` を書かない
- `Default profile` が持っていた `disable_built_in_keyboard_if_exists`（vendor 1278 /
  product 33）は、所有 profile へ切り替えると失われる。利用者が不要と判断したため
  引き継ぎ機構は作っていない
- `just format`（oxfmt）が `src/ui/styles/features/*.css` と `index.html` を書き換え、
  `design-system.test.ts` の「生の px を直値で持たない」不変条件を壊す。今回の作業では
  該当ファイルを revert して回避した。本件とは独立の問題
