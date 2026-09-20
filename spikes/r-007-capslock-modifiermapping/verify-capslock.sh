#!/bin/sh
#
# R-007 Spike: Caps Lock の modifier mapping と Karabiner の前後関係を確かめる。
#
# **このスクリプトは ~/.config/karabiner/karabiner.json を一時的に書き換える。**
# Karabiner engine は実物のこのファイルしか読まないため、probe profile を入れる経路が
# ほかに無い。開始時に backup を取り、終了時と中断時に必ず復元する。
#
# 実機 firmware への write、flash、bootloader 操作は一切行わない。
# 触るのは karabiner.json と、Karabiner が選択している profile だけ。
#
# 判断の背景は spikes/r-007-capslock-modifiermapping/README.md と ADR 0028 にある。

set -eu

CONFIG="$HOME/.config/karabiner/karabiner.json"
CLI="/Library/Application Support/org.pqrs/Karabiner-Elements/bin/karabiner_cli"
PROBE="R-007 probe"
BACKUP=""
ORIGINAL_PROFILE=""

restore() {
	if [ -n "$ORIGINAL_PROFILE" ]; then
		"$CLI" --select-profile "$ORIGINAL_PROFILE" >/dev/null 2>&1 || true
	fi
	if [ -n "$BACKUP" ] && [ -f "$BACKUP" ]; then
		cp "$BACKUP" "$CONFIG"
		printf '復元した: %s -> %s\n' "$BACKUP" "$CONFIG"
	fi
}
trap restore EXIT INT TERM

[ -x "$CLI" ] || { printf 'karabiner_cli が無い: %s\n' "$CLI" >&2; exit 1; }
[ -f "$CONFIG" ] || { printf 'karabiner.json が無い: %s\n' "$CONFIG" >&2; exit 1; }

printf '== 現在の modifier mapping ==\n'
defaults -currentHost read -g com.apple.keyboard.modifiermapping.0-0-0 2>/dev/null \
	|| printf '(未設定)\n'
printf 'Src 30064771129 = Caps Lock / Dst 30064771300 = 右 Control\n\n'

ORIGINAL_PROFILE="$("$CLI" --show-current-profile-name)"
printf '現在の profile: %s\n' "$ORIGINAL_PROFILE"

BACKUP="$(mktemp -t karabiner-r007)"
cp "$CONFIG" "$BACKUP"
printf 'backup: %s\n\n' "$BACKUP"

# probe profile を足す。既存の profile には触らない。
/usr/bin/python3 - "$CONFIG" "$PROBE" <<'PY'
import json, sys

path, name = sys.argv[1], sys.argv[2]
with open(path) as handle:
    config = json.load(handle)


def rule(key_code, to_key):
    return {
        "description": f"R-007 {key_code}",
        "manipulators": [
            {
                "type": "basic",
                "from": {"key_code": key_code, "modifiers": {"optional": ["any"]}},
                "to": [{"key_code": to_key}],
                "conditions": [
                    {"type": "device_if", "identifiers": [{"is_built_in_keyboard": True}]}
                ],
            }
        ],
    }


probe = {
    "name": name,
    "complex_modifications": {
        "rules": [rule("caps_lock", "f18"), rule("right_control", "f19")]
    },
    "virtual_hid_keyboard": {"keyboard_type_v2": "ansi"},
}
config["profiles"] = [p for p in config["profiles"] if p.get("name") != name] + [probe]
with open(path, "w") as handle:
    json.dump(config, handle, indent=4)
    handle.write("\n")
print(f"probe profile を足した: {name}")
PY

"$CLI" --select-profile "$PROBE"
printf '\n== 観測 ==\n'
cat <<'STEPS'
Karabiner-EventViewer を開き、以下を順に確認して記録する。

1. 内蔵キーボードの物理 Caps Lock を押す
   → F18 が出れば Karabiner は caps_lock を見ている
   → F19 が出れば Karabiner は right_control を見ている
   → どちらも出なければ mapping が Karabiner より後段にある
2. EventViewer の pre / post 両ペインで同じ打鍵の生 usage を控える
3. Ctrl+p / b / f / n のカーソル移動が生きているか確かめる
4. Cornix LP を接続し、Caps タップが影響を受けないか確かめる
5. 物理の右 Control を持つキーボードで 1 と区別が付くか確かめる

確認が済んだら Enter を押す。karabiner.json と profile を元へ戻す。
STEPS
printf '\n続けるには Enter: '
read -r _
