#!/bin/sh
#
# R-006 Spike: MacBook 内蔵キーボードで Karabiner 経由の remap を確認する。
#
# 対象マシンに開発環境が無い前提で書いてある。**macOS 標準のコマンドしか使わない。**
# Node も pnpm も Nix も Xcode Command Line Tools も要らない。
#
#   curl -fsSL https://raw.githubusercontent.com/salan70/cornix-bonsai/main/spikes/r-006-macos-keyboard/verify-on-macbook.sh -o verify.sh
#   less verify.sh          # 実行前に中身を読む
#   sh verify.sh
#
# 既定では **読み取りと一時ディレクトリへの書き出しだけ** を行う。
# `--install-asset` を付けたときに限り Karabiner の import 用ライブラリへ 1 ファイル置く。
# **`~/.config/karabiner/karabiner.json` は決して変更しない。**
# 実機 firmware への write、flash、bootloader 操作は一切行わない。
#
# 判断の結果は docs/decisions/0022-macos-keyboard-management.md にある。

set -eu

ASSET_NAME="cornix-bonsai-r006.json"
INSTALL_ASSET=0
OUT_DIR=""

usage() {
	cat <<'USAGE'
使い方: sh verify-on-macbook.sh [オプション]

  --install-asset   Karabiner の import 用ライブラリへ asset を置く
                    (~/.config/karabiner/assets/complex_modifications/)
                    karabiner.json は変更しない
  --out DIR         生成物の出力先 (既定: mktemp -d で作る一時ディレクトリ)
  -h, --help        この使い方を表示する
USAGE
}

while [ $# -gt 0 ]; do
	case "$1" in
	--install-asset) INSTALL_ASSET=1 ;;
	--out)
		shift
		[ $# -gt 0 ] || { echo "--out には DIR が要る" >&2; exit 2; }
		OUT_DIR="$1"
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "未知のオプション: $1" >&2
		usage >&2
		exit 2
		;;
	esac
	shift
done

note() { printf '  %s\n' "$*"; }
head2() { printf '\n%s\n' "$*"; }
ok() { printf '  [ok]   %s\n' "$*"; }
warn() { printf '  [warn] %s\n' "$*"; }
ng() { printf '  [NG]   %s\n' "$*"; }

printf 'Cornix Bonsai R-006 — MacBook 内蔵キーボードの動作確認\n'

# ---------------------------------------------------------------- 1. 環境
head2 '1. 環境'

OS_VERSION="$(sw_vers -productVersion 2>/dev/null || echo unknown)"
OS_MAJOR="${OS_VERSION%%.*}"
ARCH="$(uname -m)"
MODEL="$(sysctl -n hw.model 2>/dev/null || echo unknown)"

note "macOS   : $OS_VERSION"
note "arch    : $ARCH"
note "model   : $MODEL"

# Karabiner は Intel / Apple Silicon の両方を対象にしているが、macOS の
# バージョンで必要な Karabiner の系列が変わる。
case "$OS_MAJOR" in
1[3-9] | 2[0-9] | 3[0-9])
	note "必要な Karabiner: 15.x 系 (DriverKit)"
	NEEDS_DRIVERKIT=1
	;;
11 | 12)
	warn "macOS $OS_MAJOR では Karabiner 15.x を使えない。v14.13.0 が必要"
	NEEDS_DRIVERKIT=0
	;;
10)
	warn "macOS $OS_VERSION では v13.7.0 が必要 (10.15.6 以降)"
	NEEDS_DRIVERKIT=0
	;;
*)
	warn "macOS のバージョンを判定できない: $OS_VERSION"
	NEEDS_DRIVERKIT=0
	;;
esac

case "$MODEL" in
MacBook*) ok "MacBook である。内蔵キーボードの確認ができる" ;;
*) warn "MacBook ではない ($MODEL)。内蔵キーボードが無いと手順 5 を確認できない" ;;
esac

# ------------------------------------------------------ 2. Karabiner の導入
head2 '2. Karabiner-Elements の導入状況'

KCLI=""
for candidate in \
	"/Library/Application Support/org.pqrs/Karabiner-Elements/bin/karabiner_cli" \
	"/Applications/Karabiner-Elements.app/Contents/Library/bin/karabiner_cli"; do
	if [ -x "$candidate" ]; then
		KCLI="$candidate"
		break
	fi
done

if [ -d /Applications/Karabiner-Elements.app ]; then
	KVERSION="$(defaults read /Applications/Karabiner-Elements.app/Contents/Info.plist CFBundleShortVersionString 2>/dev/null || echo unknown)"
	ok "Karabiner-Elements.app あり (version $KVERSION)"
else
	ng "Karabiner-Elements.app が無い"
	note "https://karabiner-elements.pqrs.org/ から導入する"
fi

if [ -n "$KCLI" ]; then
	ok "karabiner_cli: $KCLI"
else
	warn "karabiner_cli が見つからない。手順 4 の lint を飛ばす"
fi

if [ "$NEEDS_DRIVERKIT" -eq 1 ]; then
	if systemextensionsctl list 2>/dev/null | grep -q 'org.pqrs.*activated enabled'; then
		ok "DriverKit extension が activated enabled"
	else
		ng "DriverKit extension が有効でない"
		note "システム設定 → 一般 → ログイン項目と機能拡張 で承認する"
	fi
else
	note "この macOS は kext 方式のため systemextensionsctl では確認しない"
fi

if pgrep -f karabiner_console_user_server >/dev/null 2>&1; then
	ok "core service が起動している"
	CORE_RUNNING=1
else
	warn "core service が起動していない。Karabiner-Elements.app を起動すると手順 3 が動く"
	CORE_RUNNING=0
fi

# --------------------------------------------- 3. 内蔵キーボードの識別
head2 '3. 内蔵キーボードの識別 (Open Question 1)'
note 'ADR 0022 は device_if の is_built_in_keyboard: true で内蔵キーボードだけを'
note '対象にすると決めている。実際にどう見えるかをここで観測する。'
printf '\n'

DEVICES_SEEN=0
if [ -n "$KCLI" ] && [ "$CORE_RUNNING" -eq 1 ]; then
	if DEVICES="$("$KCLI" --list-connected-devices 2>&1)"; then
		printf '%s\n' "$DEVICES" | sed 's/^/    /'
		DEVICES_SEEN=1
		if printf '%s' "$DEVICES" | grep -q '"is_built_in_keyboard": *true'; then
			ok 'is_built_in_keyboard: true の device がある'
		else
			ng 'is_built_in_keyboard: true の device が無い'
			note 'この Karabiner の版が該当フィールドを出さない可能性もある'
		fi
	else
		warn "--list-connected-devices が失敗した: $DEVICES"
	fi
fi

if [ "$DEVICES_SEEN" -eq 0 ]; then
	warn 'karabiner_cli から device 一覧を取れなかった'
	note 'Karabiner-Elements.app を起動してから再実行すると is_built_in_keyboard を直接確認できる'
	note 'ここでは ioreg で HID device の名前だけ代替表示する:'
	PRODUCTS="$(ioreg -c IOHIDDevice -r -l 2>/dev/null |
		sed -n 's/.*"Product" = "\(.*\)".*/\1/p' | sort -u)"
	if [ -n "$PRODUCTS" ]; then
		printf '%s\n' "$PRODUCTS" | sed 's/^/    /'
		if printf '%s' "$PRODUCTS" | grep -qi 'internal keyboard'; then
			ok 'Apple Internal Keyboard らしき device がある'
		else
			warn '内蔵キーボードらしき device 名が見つからない'
		fi
	else
		warn 'ioreg からも device 名を取れなかった'
	fi
fi

# ------------------------------------------------ 4. asset の生成と lint
head2 '4. asset の生成と lint'

if [ -z "$OUT_DIR" ]; then
	OUT_DIR="$(mktemp -d /tmp/cornix-r006.XXXXXX)"
fi
mkdir -p "$OUT_DIR"
ASSET_PATH="$OUT_DIR/$ASSET_NAME"

# 生成器の出力 (spikes/r-006-macos-keyboard/generate.mjs) をそのまま埋め込んである。
# self-check.mjs がこの JSON と生成器の出力の一致を検査するので、ずれない。
cat >"$ASSET_PATH" <<'CORNIX_ASSET_JSON'
{"title":"Cornix Bonsai","rules":[{"description":"Cornix Bonsai layer 3","manipulators":[{"type":"basic","from":{"key_code":"i","modifiers":{"optional":["any"]}},"to":[{"key_code":"8"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_3","value":1}]},{"type":"basic","from":{"key_code":"o","modifiers":{"optional":["any"]}},"to":[{"key_code":"9"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_3","value":1}]},{"type":"basic","from":{"key_code":"u","modifiers":{"optional":["any"]}},"to":[{"key_code":"7"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_3","value":1}]}]},{"description":"Cornix Bonsai layer 2","manipulators":[{"type":"basic","from":{"key_code":"1","modifiers":{"optional":["any"]}},"to":[{"key_code":"f1"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_2","value":1}]},{"type":"basic","from":{"key_code":"2","modifiers":{"optional":["any"]}},"to":[{"key_code":"f2"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_2","value":1}]},{"type":"basic","from":{"key_code":"q","modifiers":{"optional":["any"]}},"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_2","value":1}]}]},{"description":"Cornix Bonsai layer 1","manipulators":[{"type":"basic","from":{"key_code":"a","modifiers":{"optional":["any"]}},"to":[{"key_code":"home"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_1","value":1}]},{"type":"basic","from":{"key_code":"d","modifiers":{"optional":["any"]}},"to":[{"key_code":"delete_forward"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_1","value":1}]},{"type":"basic","from":{"key_code":"e","modifiers":{"optional":["any"]}},"to":[{"key_code":"end"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_1","value":1}]},{"type":"basic","from":{"key_code":"h","modifiers":{"optional":["any"]}},"to":[{"key_code":"left_arrow"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_1","value":1}]},{"type":"basic","from":{"key_code":"j","modifiers":{"optional":["any"]}},"to":[{"key_code":"down_arrow"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_1","value":1}]},{"type":"basic","from":{"key_code":"k","modifiers":{"optional":["any"]}},"to":[{"key_code":"up_arrow"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_1","value":1}]},{"type":"basic","from":{"key_code":"l","modifiers":{"optional":["any"]}},"to":[{"key_code":"right_arrow"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_1","value":1}]}]},{"description":"Cornix Bonsai layer 0","manipulators":[{"type":"basic","from":{"key_code":"caps_lock","modifiers":{"optional":["any"]}},"to":[{"key_code":"left_control","lazy":true}],"to_if_alone":[{"key_code":"escape"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]}]},{"type":"basic","from":{"key_code":"japanese_eisuu","modifiers":{"optional":["any"]}},"to":[{"set_variable":{"name":"cornix_layer_2","value":1}}],"to_after_key_up":[{"set_variable":{"name":"cornix_layer_2","value":0}}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]}]},{"type":"basic","from":{"key_code":"japanese_kana","modifiers":{"optional":["any"]}},"to":[{"set_variable":{"name":"cornix_layer_1","value":1}}],"to_after_key_up":[{"set_variable":{"name":"cornix_layer_1","value":0}}],"to_if_alone":[{"key_code":"japanese_kana"}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]}]},{"type":"basic","from":{"key_code":"right_command","modifiers":{"optional":["any"]}},"to":[{"set_variable":{"name":"cornix_layer_3","value":0}}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_if","name":"cornix_layer_3","value":1}]},{"type":"basic","from":{"key_code":"right_command","modifiers":{"optional":["any"]}},"to":[{"set_variable":{"name":"cornix_layer_3","value":1}}],"conditions":[{"type":"device_if","identifiers":[{"is_built_in_keyboard":true}]},{"type":"variable_unless","name":"cornix_layer_3","value":1}]}]}]}

CORNIX_ASSET_JSON

ok "書き出した: $ASSET_PATH"

if [ -n "$KCLI" ]; then
	# --format-json は独自整形 (4 space、1 行に収まる object は 1 行) で
	# ファイルを in-place 書き換えする。ADR 0022 が「テキストで diff を取らない」と
	# 決めた根拠そのものなので、ここで実際に整形させて見せる。
	"$KCLI" --format-json "$ASSET_PATH" >/dev/null 2>&1 || true
	ok 'karabiner_cli --format-json で整形した (4 space になっていることを確認できる)'

	if LINT="$("$KCLI" --lint-complex-modifications "$ASSET_PATH" 2>&1)"; then
		ok "lint: $LINT"
	else
		ng "lint 失敗: $LINT"
	fi
else
	warn 'karabiner_cli が無いため lint と整形を飛ばした'
fi

printf '\n  先頭 20 行:\n'
sed -n '1,20p' "$ASSET_PATH" | sed 's/^/    /'

# ------------------------------------------------------- asset の導入
if [ "$INSTALL_ASSET" -eq 1 ]; then
	head2 'asset の導入'
	DEST_DIR="$HOME/.config/karabiner/assets/complex_modifications"
	mkdir -p "$DEST_DIR"
	cp "$ASSET_PATH" "$DEST_DIR/$ASSET_NAME"
	ok "置いた: $DEST_DIR/$ASSET_NAME"
	note 'karabiner.json は変更していない。有効化は GUI から行う'
	note "取り消す場合: rm \"$DEST_DIR/$ASSET_NAME\""
fi

# ------------------------------------------------------- 5. 手動確認
head2 '5. 手動で確認すること'

cat <<'MANUAL'
  ここから先は人間の操作が要る。**先に専用 profile を作ること。**
  現在の profile へ直接入れると普段の設定と混ざる。

  0. Karabiner-Elements.app → Profiles → Add profile → 名前を付けて選択する
  1. Complex Modifications → Add rule → "Cornix Bonsai" の 4 rule を Enable
     (--install-asset を付けずに実行した場合は、上に出た asset を
      ~/.config/karabiner/assets/complex_modifications/ へ自分でコピーする)

  確認する挙動 (すべて内蔵キーボードで行う):

  [1] mod-tap        caps lock を単押し → Esc / 押しながら他キー → Ctrl
  [2] layer 1 (LT)   かなキーを単押し → かな / 押しながら h j k l → ← ↓ ↑ →
  [3] layer 2 (MO)   英数キーを押しながら 1 / 2 → F1 / F2、q は無反応
  [4] layer 3 (TG)   右 command を単押しで切替 → u i o が 7 8 9 になる
                     もう一度押すと戻る
  [5] device スコープ Cornix LP を USB か BLE で繋ぎ、**Cornix LP 側では
                     上記が一切起きない**ことを確認する

  さらに、確認が終わったあとに:

  [6] Karabiner を起動したまま karabiner.json が外部から置換されたときの挙動。
      Cornix Bonsai は temp + rename での atomic 置換を予定している。
      Karabiner は親ディレクトリを FSEvents で watch しているので壊れないはずだが未検証。

  結果は docs/decisions/0022-macos-keyboard-management.md の Open Question へ反映する。

  後始末:
    - 作った profile を削除する
    - rm ~/.config/karabiner/assets/complex_modifications/cornix-bonsai-r006.json
MANUAL

printf '\n出力先: %s\n' "$OUT_DIR"
