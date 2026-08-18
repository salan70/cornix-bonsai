// R-003 Spike: RMK 0.8.x 側の Vial 応答を再現する mock device。使い捨てコードであり本実装ではない。
//
// 参照した実装（tag rmk-v0.8.2）:
//   rmk/src/host/via/mod.rs   ... VIA コマンド (0x01, 0x02, 0x0C..0x12)
//   rmk/src/host/via/vial.rs  ... Vial コマンド (0xFE 0x00..0x0D)
// vial-gui 側の decode と独立に、firmware 側の byte 並べ方だけをここへ写している。
// 両者を突き合わせることで endianness や offset の食い違いを検出するのが狙い。

import { spawnSync } from "node:child_process";

const MSG_LEN = 32;

// ViaCommand
const VIA_GET_PROTOCOL_VERSION = 0x01;
const VIA_GET_KEYBOARD_VALUE = 0x02;
const VIA_MACRO_GET_COUNT = 0x0c;
const VIA_MACRO_GET_BUFFER_SIZE = 0x0d;
const VIA_MACRO_GET_BUFFER = 0x0e;
const VIA_GET_LAYER_COUNT = 0x11;
const VIA_KEYMAP_GET_BUFFER = 0x12;
const VIA_VIAL_PREFIX = 0xfe;

// ViaKeyboardInfo
const VIA_LAYOUT_OPTIONS = 0x02;

// VialCommand
const VIAL_GET_KEYBOARD_ID = 0x00;
const VIAL_GET_SIZE = 0x01;
const VIAL_GET_DEFINITION = 0x02;
const VIAL_GET_ENCODER = 0x03;
const VIAL_SETTINGS_QUERY = 0x09;
const VIAL_SETTINGS_GET = 0x0a;
const VIAL_DYNAMIC_ENTRY_OP = 0x0d;

// VialDynamic
const DYNAMIC_GET_NUMBER_OF_ENTRIES = 0x00;
const DYNAMIC_MORSE_GET = 0x01;
const DYNAMIC_COMBO_GET = 0x03;

// rmk-types/src/protocol/vial.rs の SettingKey (rmk-v0.8.2)。
// integer は LE u16、boolean は 1 byte で返る。
export const RMK_SETTING_KEYS = [
  { qsid: 0x02, kind: "u16", name: "ComboTimeout" },
  { qsid: 0x06, kind: "u16", name: "OneShotTimeout" },
  { qsid: 0x07, kind: "u16", name: "MorseTimeout" },
  { qsid: 0x12, kind: "u16", name: "TapInterval" },
  { qsid: 0x13, kind: "u16", name: "TapCapslockInterval" },
  { qsid: 0x16, kind: "bool", name: "PermissiveHold" },
  { qsid: 0x17, kind: "bool", name: "HoldOnOtherKeyPress" },
  { qsid: 0x1a, kind: "bool", name: "UnilateralTap" },
  { qsid: 0x1b, kind: "u16", name: "PriorIdleTime" },
];

function xz(input) {
  const r = spawnSync("xz", ["-9", "-c"], { input, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`xz failed: ${r.stderr}`);
  return r.stdout;
}

// 決定的な擬似乱数。seed を変えても結果が壊れないことを確かめるために使う。
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
}

export function createMockDevice({
  definitionJson,
  layers,
  encoderCount,
  morseCount,
  comboCount,
  seed = 0xc0ffee,
}) {
  const rows = definitionJson.matrix.rows;
  const cols = definitionJson.matrix.cols;
  const next = rng(seed);
  const kc = () => next() & 0xffff;

  // keymap は宣言済み (row, col) 以外にも値を入れておく。
  // vial-gui は definition が宣言した位置だけを拾うはずなので、拾ってしまえば検出できる。
  const keymap = new Uint16Array(layers * rows * cols);
  for (let i = 0; i < keymap.length; i++) keymap[i] = kc();

  const encoders = [];
  for (let l = 0; l < layers; l++) {
    const layer = [];
    for (let e = 0; e < encoderCount; e++) layer.push({ ccw: kc(), cw: kc() });
    encoders.push(layer);
  }

  const morses = [];
  for (let i = 0; i < morseCount; i++) {
    morses.push({ tap: kc(), hold: kc(), doubleTap: kc(), holdAfterTap: kc(), timeout: 100 + i });
  }

  const combos = [];
  for (let i = 0; i < comboCount; i++) {
    combos.push({ actions: [kc(), kc(), kc(), kc()], output: kc() });
  }

  const settings = new Map();
  for (const s of RMK_SETTING_KEYS) {
    settings.set(s.qsid, s.kind === "bool" ? next() & 1 : next() & 0x3ff);
  }

  // macro は NUL 区切りで並ぶ。macro_count 本ぶんの NUL を含める。
  const macroCount = 32; // RMK は 32 を固定で返す（mod.rs: DynamicKeymapMacroGetCount）
  const macroBodies = Array.from({ length: macroCount }, () => new Uint8Array(0));
  macroBodies[0] = Uint8Array.from([0x01, 0x02, 0x41, 0x42]);
  macroBodies[5] = Uint8Array.from([0x43]);
  const macroSpaceSize = 512;
  const macroBuffer = new Uint8Array(macroSpaceSize);
  {
    let o = 0;
    for (const body of macroBodies) {
      macroBuffer.set(body, o);
      o += body.length;
      macroBuffer[o++] = 0x00;
    }
  }

  const definitionBytes = xz(Buffer.from(JSON.stringify(definitionJson), "utf8"));
  const layoutOptions = 0;

  const log = [];

  function send(msg) {
    if (msg.length > MSG_LEN) throw new Error(`request is longer than ${MSG_LEN} bytes`);
    // RMK: run_session が output_data をそのまま input_data へ複製してから書き換える。
    const out = new Uint8Array(MSG_LEN);
    out.set(msg);
    const inp = new Uint8Array(out);
    const dv = new DataView(inp.buffer);
    const odv = new DataView(out.buffer);

    switch (out[0]) {
      case VIA_GET_PROTOCOL_VERSION:
        dv.setUint16(1, 9, false); // VIA_PROTOCOL_VERSION
        log.push("via:GetProtocolVersion");
        break;
      case VIA_GET_KEYBOARD_VALUE:
        if (out[1] === VIA_LAYOUT_OPTIONS) {
          dv.setUint32(2, layoutOptions, false);
          log.push("via:GetKeyboardValue(LayoutOptions)");
        }
        break;
      case VIA_MACRO_GET_COUNT:
        inp[1] = macroCount;
        log.push("via:MacroGetCount");
        break;
      case VIA_MACRO_GET_BUFFER_SIZE:
        inp[1] = (macroSpaceSize >> 8) & 0xff;
        inp[2] = macroSpaceSize & 0xff;
        log.push("via:MacroGetBufferSize");
        break;
      case VIA_MACRO_GET_BUFFER: {
        const offset = odv.getUint16(1, false);
        const size = out[3];
        if (size > 28) {
          inp[0] = 0xff;
        } else {
          inp.set(macroBuffer.subarray(offset, offset + size), 4);
        }
        log.push("via:MacroGetBuffer");
        break;
      }
      case VIA_GET_LAYER_COUNT:
        inp[1] = layers;
        log.push("via:GetLayerCount");
        break;
      case VIA_KEYMAP_GET_BUFFER: {
        const offset = odv.getUint16(1, false);
        const size = out[3];
        const start = offset >> 1;
        for (let i = 0; i < size >> 1; i++) {
          dv.setUint16(4 + i * 2, keymap[start + i] ?? 0, false); // RMK は BE で書く
        }
        log.push("via:KeymapGetBuffer");
        break;
      }
      case VIA_VIAL_PREFIX:
        switch (out[1]) {
          case VIAL_GET_KEYBOARD_ID:
            dv.setUint32(0, 6, true); // VIAL_PROTOCOL_VERSION
            dv.setBigUint64(4, KEYBOARD_ID, true);
            log.push("vial:GetKeyboardId");
            break;
          case VIAL_GET_SIZE:
            dv.setUint32(0, definitionBytes.length, true);
            log.push("vial:GetSize");
            break;
          case VIAL_GET_DEFINITION: {
            const page = odv.getUint16(2, true);
            const start = page * MSG_LEN;
            inp.fill(0);
            inp.set(definitionBytes.subarray(start, start + MSG_LEN));
            log.push("vial:GetDefinition");
            break;
          }
          case VIAL_GET_ENCODER: {
            const layer = out[2];
            const index = out[3];
            const e = encoders[layer]?.[index];
            if (e) {
              dv.setUint16(0, e.ccw, false); // RMK は counter_clockwise を先に BE で書く
              dv.setUint16(2, e.cw, false);
            } else {
              inp.fill(0);
            }
            log.push("vial:GetEncoder");
            break;
          }
          case VIAL_SETTINGS_QUERY: {
            inp.fill(0xff);
            const value = odv.getUint16(2, true);
            if (value <= 8) {
              RMK_SETTING_KEYS.forEach((s, i) => dv.setUint16(i * 2, s.qsid, true));
            }
            log.push("vial:SettingsQuery");
            break;
          }
          case VIAL_SETTINGS_GET: {
            inp.fill(0xff);
            const qsid = odv.getUint16(2, true);
            const def = RMK_SETTING_KEYS.find((s) => s.qsid === qsid);
            inp[0] = def ? 0 : 0xff;
            if (def) {
              if (def.kind === "bool") inp[1] = settings.get(qsid) ? 1 : 0;
              else dv.setUint16(1, settings.get(qsid), true);
            }
            log.push("vial:SettingsGet");
            break;
          }
          case VIAL_DYNAMIC_ENTRY_OP: {
            switch (out[2]) {
              case DYNAMIC_GET_NUMBER_OF_ENTRIES:
                inp[0] = morseCount;
                inp[1] = comboCount;
                inp[2] = 0; // key override: RMK 未実装
                // input_data[3] は output_data の複製のまま = 0 → alt repeat key も 0 本
                inp[31] = 1; // caps word
                log.push("vial:Dynamic(GetNumberOfEntries)");
                break;
              case DYNAMIC_MORSE_GET: {
                const m = morses[out[3]];
                inp[0] = 0;
                if (m) {
                  dv.setUint16(1, m.tap, true);
                  dv.setUint16(3, m.hold, true);
                  dv.setUint16(5, m.doubleTap, true);
                  dv.setUint16(7, m.holdAfterTap, true);
                  dv.setUint16(9, m.timeout, true);
                } else {
                  inp.fill(0, 1, 11);
                }
                log.push("vial:Dynamic(MorseGet)");
                break;
              }
              case DYNAMIC_COMBO_GET: {
                const c = combos[out[3]];
                inp[0] = 0;
                if (c) {
                  c.actions.forEach((a, i) => dv.setUint16(1 + i * 2, a, true));
                  dv.setUint16(9, c.output, true);
                } else {
                  inp.fill(0, 1, 11);
                }
                log.push("vial:Dynamic(ComboGet)");
                break;
              }
              default:
                inp.fill(0);
            }
            break;
          }
          default:
            log.push(`vial:unhandled(0x${out[1].toString(16)})`);
        }
        break;
      default:
        inp[0] = 0xff;
        log.push(`via:unhandled(0x${out[0].toString(16)})`);
    }
    return inp;
  }

  return {
    send,
    log,
    state: {
      keymap,
      encoders,
      morses,
      combos,
      settings,
      macroBodies,
      macroCount,
      macroSpaceSize,
      rows,
      cols,
      layers,
    },
  };
}

// fixtures/cornix-lp/baseline.vil の uid。
export const KEYBOARD_ID = 16882930253541522617n;
