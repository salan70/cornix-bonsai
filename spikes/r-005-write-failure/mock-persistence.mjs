// R-005 Spike: R-003 の mock device に write と「永続化」を足したもの。使い捨てコードであり本実装ではない。
//
// 参照した実装（tag rmk-v0.8.2）:
//   rmk/src/host/via/mod.rs      ... DynamicKeymapSetKeyCode(0x05) / SetBuffer(0x13) /
//                                    MacroSetBuffer(0x0F) / EepromReset(0x0A) / BootloaderJump(0x0B)
//   rmk/src/host/via/vial.rs     ... SetEncoder(0xFE 0x04) / SetBehaviorSetting(0xFE 0x0B) /
//                                    DynamicEntryOp の MorseSet(0x02) / ComboSet(0x04)
//   rmk/src/host/via/vial_lock.rs... unlock 状態（write 系は一切参照しない）
//   rmk/src/storage/mod.rs       ... FLASH_CHANNEL を受ける storage task、store_item、check_enable
//   rmk/src/channel.rs           ... FLASH_CHANNEL の容量（rmk-config の flash_channel_size = 4）
//
// RMK の構造をそのまま写している点が肝。
//   1. via task は「RAM を更新」→「FLASH_CHANNEL へ送る」→「応答を返す」の順で動く
//   2. flash への書き込みは別 task が非同期に行い、失敗しても host へは返らない
//   3. したがって応答も write 後の再 read も、flash に載ったことを意味しない
// この Spike はその乖離を再現し、再 read で検出できる失敗と検出できない失敗を切り分ける。

import { createMockDevice } from "../r-003-vial-read-flow/mock-device.mjs";

const MSG_LEN = 32;

// ViaCommand（rmk-types/src/protocol/vial.rs）
const VIA_SET_KEYBOARD_VALUE = 0x03;
const VIA_GET_KEYCODE = 0x04;
const VIA_SET_KEYCODE = 0x05;
const VIA_EEPROM_RESET = 0x0a;
const VIA_BOOTLOADER_JUMP = 0x0b;
const VIA_MACRO_SET_BUFFER = 0x0f;
const VIA_KEYMAP_SET_BUFFER = 0x13;
const VIA_KEYMAP_SET_ENCODER = 0x15;
const VIA_VIAL_PREFIX = 0xfe;

// VialCommand
const VIAL_SET_ENCODER = 0x04;
const VIAL_GET_UNLOCK_STATUS = 0x05;
const VIAL_UNLOCK_START = 0x06;
const VIAL_UNLOCK_POLL = 0x07;
const VIAL_LOCK = 0x08;
const VIAL_SETTINGS_SET = 0x0b;
const VIAL_DYNAMIC_ENTRY_OP = 0x0d;

// VialDynamic
const DYNAMIC_MORSE_SET = 0x02;
const DYNAMIC_COMBO_SET = 0x04;

// rmk-config の flash_channel_size 既定値。SetBuffer の try_send はこの本数で溢れる。
export const FLASH_CHANNEL_SIZE = 4;

const clone = (v) => structuredClone(v);

/**
 * R-003 の mock を包んで、RAM（= read が返す値）と flash（= 再起動後に残る値）を分けて持つ device。
 *
 * faults で注入できるもの:
 *   flashStalled  ... storage task が動かない。FLASH_CHANNEL が詰まると
 *                     `send().await` する command は応答を返せなくなる（backpressure）
 *   flashError    ... store_item がエラーを返す。op は捨てられるが応答は正常に返る
 *   disconnectAt  ... n 往復目以降、応答も例外も返さない（R-004 で実測した永久 pending）
 *   locked        ... vial lock 状態。RMK では write 系が一切参照しない
 */
export function createPersistentMockDevice({ faults = {}, ...options } = {}) {
  const mock = createMockDevice(options);
  const ram = mock.state;
  const rows = ram.rows;
  const cols = ram.cols;

  // flash は sequential-storage の item 単位で持つ。key は RMK の get_*_key に対応させる。
  //   0x1000 + layer*ROW*COL + row*COL + col ... KeymapConfig
  //   0x4000 + idx + NUM_ENCODER*layer      ... EncoderKeys
  //   0x7000 + idx                          ... MorseData
  //   0x3000 + idx                          ... ComboData
  // RMK は初回起動時に initialize_storage_with_config で既定 keymap を全件書くため、
  // flash の初期状態は RAM と同じ内容になる。
  const flash = new Map();
  const firmwareDefaults = {
    keymap: Uint16Array.from(ram.keymap),
    encoders: clone(ram.encoders),
    morses: clone(ram.morses),
    combos: clone(ram.combos),
    settings: new Map(ram.settings),
  };
  const keymapKey = (layer, row, col) => 0x1000 + layer * rows * cols + row * cols + col;
  const encoderKey = (idx, layer) => 0x4000 + idx + ram.encoders[0].length * layer;
  const morseKey = (idx) => 0x7000 + idx;
  const comboKey = (idx) => 0x3000 + idx;
  for (let layer = 0; layer < ram.layers; layer++) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = layer * rows * cols + row * cols + col;
        flash.set(keymapKey(layer, row, col), ram.keymap[i]);
      }
    }
  }
  ram.encoders.forEach((layer, l) =>
    layer.forEach((e, i) => flash.set(encoderKey(i, l), { ...e })),
  );
  ram.morses.forEach((m, i) => flash.set(morseKey(i), { ...m }));
  ram.combos.forEach((c, i) => flash.set(comboKey(i), clone(c)));
  const flashSettings = new Map(ram.settings);
  let flashMacro = null; // macro は 1 item にまとめて入る（StorageKeys::MacroData）
  let storageEnabled = true;

  // FLASH_CHANNEL。storage task が drain するまで溜まる。
  const queue = [];
  const events = [];
  const state = {
    unlocked: false,
    bootloader: false,
    roundTrips: 0,
    droppedOps: 0,
    failedOps: 0,
    panicked: false,
  };

  function note(kind, payload) {
    events.push({ n: state.roundTrips, kind, ...payload });
  }

  // `FLASH_CHANNEL.send().await` 相当。満杯なら storage task が 1 件処理するまで待つ =
  // storage task が止まっていれば応答自体が返らない。
  function sendFlash(op) {
    if (queue.length < FLASH_CHANNEL_SIZE) {
      queue.push(op);
      if (!faults.flashStalled) drain();
      return true;
    }
    if (faults.flashStalled) {
      note("blocked", { op: op.kind });
      return false; // 応答を返さない（呼び出し側で永久 pending にする）
    }
    drain();
    queue.push(op);
    return true;
  }

  // `FLASH_CHANNEL.try_send()` 相当。満杯なら黙って捨てる（error! を出すだけ）。
  function trySendFlash(op) {
    if (queue.length >= FLASH_CHANNEL_SIZE) {
      state.droppedOps += 1;
      note("dropped", { op: op.kind });
      return;
    }
    queue.push(op);
    if (!faults.flashStalled) drain();
  }

  /** storage task を 1 周ぶん動かす。実機では via task と並行に走る。 */
  function drain() {
    while (queue.length > 0) {
      const op = queue.shift();
      if (faults.flashError?.(op)) {
        // print_storage_error して FLASH_OPERATION_FINISHED.signal(false) するだけ。
        // host へは何も返らない。
        state.failedOps += 1;
        note("storeItemFailed", { op: op.kind, key: op.key });
        continue;
      }
      op.apply();
    }
  }

  function setKeycode(layer, row, col, keycode) {
    const i = layer * rows * cols + row * cols + col;
    if (layer >= ram.layers || row >= rows || col >= cols) {
      note("silentNoop", { command: "SetKeyCode", layer, row, col });
      return true;
    }
    ram.keymap[i] = keycode; // RAM は即時反映
    return sendFlash({
      kind: "KeymapKey",
      key: keymapKey(layer, row, col),
      apply: () => flash.set(keymapKey(layer, row, col), keycode),
    });
  }

  function send(msg) {
    if (msg.length !== MSG_LEN) {
      // BLE では RMK が長さ 32 以外の packet を捨てる（rmk/src/ble/mod.rs）。応答も返らない。
      note("shortPacketDropped", { length: msg.length });
      return null;
    }
    state.roundTrips += 1;
    if (state.panicked) return null; // panic 後は応答が返らない
    if (faults.disconnectAt && state.roundTrips >= faults.disconnectAt) {
      note("disconnected", {});
      return null; // 応答も例外も返さない（R-004 実測の永久 pending）
    }

    const out = Uint8Array.from(msg);
    const odv = new DataView(out.buffer);
    const inp = new Uint8Array(out); // RMK: input_data = output_data
    const dv = new DataView(inp.buffer);

    switch (out[0]) {
      case VIA_SET_KEYBOARD_VALUE: {
        if (out[1] === 0x02) {
          // LayoutOptions。RAM には反映されない（GetKeyboardValue は常に 0 を返す）
          if (!sendFlash({ kind: "LayoutOptions", key: 0x2, apply: () => {} })) return null;
        }
        return inp;
      }
      case VIA_GET_KEYCODE: {
        // 1 keycode だけ読む。RMK は RAM 上の keymap を BE で返す（= flash の内容ではない）。
        const layer = out[1];
        const row = out[2];
        const col = out[3];
        const i = layer * rows * cols + row * cols + col;
        dv.setUint16(4, ram.keymap[i] ?? 0, false);
        return inp;
      }
      case VIA_SET_KEYCODE: {
        // keycode は BE。FLASH_CHANNEL が詰まっていれば応答自体が返らない。
        if (!setKeycode(out[1], out[2], out[3], odv.getUint16(4, false))) return null;
        return inp;
      }
      case VIA_KEYMAP_SET_BUFFER: {
        // read（0x12）は offset を byte 単位で見て BE で返すのに対し、
        // write は offset を entry 単位で見て LE で読む。同じ offset を使うと
        // 2 倍ずれた位置へ byte が入れ替わった値が入る。
        const offset = odv.getUint16(1, false);
        const size = out[3];
        for (let i = 0; i < size; i++) {
          if (4 + i * 2 + 2 > MSG_LEN) {
            // RMK は size を entry 数として扱い、32 byte の report を超えて読みにいく。
            // Rust の slice index は範囲外で panic するため、firmware ごと落ちる。
            // VIA / vial-gui の size は byte 数（<= 28）なので、その値をそのまま送ると踏む。
            note("firmwarePanic", { command: "DynamicKeymapSetBuffer(0x13)", size });
            state.panicked = true;
            return null;
          }
          const idx = offset + i;
          if (idx >= ram.keymap.length) break;
          const keycode = odv.getUint16(4 + i * 2, true); // LE
          ram.keymap[idx] = keycode;
          const layer = Math.floor(idx / (rows * cols));
          const rest = idx % (rows * cols);
          const row = Math.floor(rest / cols);
          const col = rest % cols;
          trySendFlash({
            kind: "KeymapKey",
            key: keymapKey(layer, row, col),
            apply: () => flash.set(keymapKey(layer, row, col), keycode),
          });
        }
        return inp;
      }
      case VIA_KEYMAP_SET_ENCODER: {
        // RMK: "Keymap set encoder -- not supported"。応答は echo のまま返る。
        note("ignoredCommand", { command: "DynamicKeymapSetEncoder(0x15)" });
        return inp;
      }
      case VIA_MACRO_SET_BUFFER: {
        const offset = odv.getUint16(1, false);
        const size = out[3];
        const buffer = new Uint8Array(ram.macroSpaceSize);
        if (offset === 0) {
          // 先頭 packet で macro cache 全体が 0 で初期化される。
          // 途中で中断すると、残りは 0 のまま flash へ載る。
          ram.macroBuffer = buffer;
        }
        const current = ram.macroBuffer ?? buffer;
        current.set(out.subarray(4, 4 + size), offset);
        ram.macroBuffer = current;
        const snapshot = Uint8Array.from(current);
        if (
          !sendFlash({
            kind: "Macro",
            key: 0x4,
            apply: () => {
              flashMacro = snapshot;
            },
          })
        )
          return null;
        return inp;
      }
      case VIA_EEPROM_RESET: {
        // sequential_storage::erase_all。次回起動時に check_enable が false になり、
        // firmware 既定の keymap で storage が作り直される。
        if (
          !sendFlash({
            kind: "Reset",
            key: null,
            apply: () => {
              flash.clear();
              flashSettings.clear();
              flashMacro = null;
              storageEnabled = false;
            },
          })
        )
          return null;
        note("eepromReset", {});
        return inp;
      }
      case VIA_BOOTLOADER_JUMP: {
        // RMK は unlock 状態を確認せず即座に bootloader へ飛ぶ。応答は返らない。
        state.bootloader = true;
        note("bootloaderJump", {});
        return null;
      }
      case VIA_VIAL_PREFIX:
        switch (out[1]) {
          case VIAL_GET_UNLOCK_STATUS: {
            inp.fill(0xff);
            inp[0] = state.unlocked ? 1 : 0;
            inp[1] = 0;
            return inp;
          }
          case VIAL_UNLOCK_START:
          case VIAL_UNLOCK_POLL: {
            // 実機では unlock key を物理的に押し続ける必要がある。ここでは押されていない前提。
            inp[0] = state.unlocked ? 1 : 0;
            inp[1] = 1;
            return inp;
          }
          case VIAL_LOCK: {
            state.unlocked = false;
            return inp;
          }
          case VIAL_SET_ENCODER: {
            const layer = out[2];
            const index = out[3];
            const clockwise = out[4];
            const keycode = odv.getUint16(5, false); // BE
            const encoder = ram.encoders[layer]?.[index];
            if (!encoder) {
              // 範囲外は何もせず、応答だけ返る（成功と区別できない）。
              note("silentNoop", { command: "SetEncoder", layer, index });
              return inp;
            }
            if (clockwise === 1) encoder.cw = keycode;
            else encoder.ccw = keycode;
            const snapshot = { ...encoder };
            if (
              !sendFlash({
                kind: "Encoder",
                key: encoderKey(index, layer),
                apply: () => flash.set(encoderKey(index, layer), snapshot),
              })
            )
              return null;
            return inp;
          }
          case VIAL_SETTINGS_SET: {
            const qsid = odv.getUint16(2, true);
            const def = ram.settings.has(qsid);
            if (!def) {
              // SettingKey::None は何もしない。返り値も変わらない。
              note("silentNoop", { command: "SetBehaviorSetting", qsid });
              return inp;
            }
            const value = odv.getUint16(4, true);
            ram.settings.set(qsid, value);
            if (
              !sendFlash({
                kind: "BehaviorConfig",
                key: 0x3,
                apply: () => flashSettings.set(qsid, value),
              })
            )
              return null;
            // RMK は return code を書かない。input_data[0] は 0xFE（echo）のまま返る。
            return inp;
          }
          case VIAL_DYNAMIC_ENTRY_OP:
            switch (out[2]) {
              case DYNAMIC_MORSE_SET: {
                inp[0] = 0; // 範囲外でも 0（成功）が返る。RMK は bounds check の前に書いている
                const idx = out[3];
                const m = ram.morses[idx];
                if (!m) {
                  note("silentNoop", { command: "MorseSet", idx });
                  return inp;
                }
                m.tap = odv.getUint16(4, true);
                m.hold = odv.getUint16(6, true);
                m.doubleTap = odv.getUint16(8, true);
                m.holdAfterTap = odv.getUint16(10, true);
                m.timeout = odv.getUint16(12, true);
                const snapshot = { ...m };
                if (
                  !sendFlash({
                    kind: "Morse",
                    key: morseKey(idx),
                    apply: () => flash.set(morseKey(idx), snapshot),
                  })
                )
                  return null;
                return inp;
              }
              case DYNAMIC_COMBO_SET: {
                inp[0] = 0;
                const idx = out[3];
                const c = ram.combos[idx];
                if (!c) {
                  note("silentNoop", { command: "ComboSet", idx });
                  return inp;
                }
                c.actions = [
                  odv.getUint16(4, true),
                  odv.getUint16(6, true),
                  odv.getUint16(8, true),
                  odv.getUint16(10, true),
                ];
                c.output = odv.getUint16(12, true);
                const snapshot = clone(c);
                if (
                  !sendFlash({
                    kind: "Combo",
                    key: comboKey(idx),
                    apply: () => flash.set(comboKey(idx), snapshot),
                  })
                )
                  return null;
                return inp;
              }
              default:
                return mock.send(out);
            }
          default:
            return mock.send(out);
        }
      default:
        return mock.send(out);
    }
  }

  /**
   * 電源断 → 再起動。RAM を捨て、flash から作り直す（rmk/src/storage/mod.rs の new + read_keymap）。
   * storage が無効化されていれば erase_all して firmware 既定値で初期化し直す。
   */
  function reboot() {
    queue.length = 0; // 未処理の flash op は電源断で消える
    if (!storageEnabled) {
      note("storageReinitialized", {});
      flash.clear();
      flashSettings.clear();
      flashMacro = null;
      for (let layer = 0; layer < ram.layers; layer++) {
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const i = layer * rows * cols + row * cols + col;
            flash.set(keymapKey(layer, row, col), firmwareDefaults.keymap[i]);
          }
        }
      }
      firmwareDefaults.encoders.forEach((layer, l) =>
        layer.forEach((e, i) => flash.set(encoderKey(i, l), { ...e })),
      );
      firmwareDefaults.morses.forEach((m, i) => flash.set(morseKey(i), { ...m }));
      firmwareDefaults.combos.forEach((c, i) => flash.set(comboKey(i), clone(c)));
      for (const [k, v] of firmwareDefaults.settings) flashSettings.set(k, v);
      storageEnabled = true;
    }
    for (let layer = 0; layer < ram.layers; layer++) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = layer * rows * cols + row * cols + col;
          ram.keymap[i] = flash.get(keymapKey(layer, row, col)) ?? firmwareDefaults.keymap[i];
        }
      }
    }
    ram.encoders.forEach((layer, l) =>
      layer.forEach((e, i) => {
        const stored = flash.get(encoderKey(i, l));
        if (stored) {
          e.cw = stored.cw;
          e.ccw = stored.ccw;
        }
      }),
    );
    ram.morses.forEach((m, i) => Object.assign(m, flash.get(morseKey(i)) ?? m));
    ram.combos.forEach((c, i) => Object.assign(c, flash.get(comboKey(i)) ?? c));
    for (const [k, v] of flashSettings) ram.settings.set(k, v);
    if (flashMacro) ram.macroBuffer = Uint8Array.from(flashMacro);
    state.bootloader = false;
    state.unlocked = false;
  }

  return {
    send,
    reboot,
    drain,
    state,
    events,
    ram,
    flash,
    flashSettings,
    queue,
    /** 実機の read で観測できる値（= RAM 由来）。 */
    readKeycode: (layer, row, col) => ram.keymap[layer * rows * cols + row * cols + col],
    /** 再起動後に残る値（= flash 由来）。実機では read で直接は観測できない。 */
    storedKeycode: (layer, row, col) => flash.get(keymapKey(layer, row, col)),
  };
}
