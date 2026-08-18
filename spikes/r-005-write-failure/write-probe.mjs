// R-005 Spike: 差分 write の command 列を組み立てる。使い捨てコードであり本実装ではない。
//
// 参照した実装:
//   vial-gui v0.7.1 src/main/python/protocol/keyboard_comm.py
//     set_key / set_encoder / restore_layout ... 1 entry ずつ送る差分 write。retries=20
//   rmk-v0.8.2 rmk/src/host/via/mod.rs, vial.rs ... firmware 側の解釈
//
// 方針（ADR 0003）:
//   - 全 buffer write（0x13 DynamicKeymapSetBuffer）は使わない。
//     RMK では read(0x12) が offset を byte 単位 + BE で扱うのに対し
//     write(0x13) は offset を entry 単位 + LE で扱う。組み立て可能ではあるが、
//     読み書きで意味が変わるため経路として採らない。ここでも実装しない。
//   - reset 系（0x0A EepromReset / 0x0B BootloaderJump）は実装しない。実機へ送らない。

import { VialSession } from "../r-004-webhid-macos/probe.mjs";

const CMD = {
  GET_KEYCODE: 0x04,
  SET_KEYCODE: 0x05,
  VIAL_PREFIX: 0xfe,
};
const VIAL = {
  GET_ENCODER: 0x03,
  SET_ENCODER: 0x04,
  GET_UNLOCK_STATUS: 0x05,
  SETTINGS_GET: 0x0a,
  SETTINGS_SET: 0x0b,
  DYNAMIC_ENTRY_OP: 0x0d,
};
const DYNAMIC = {
  MORSE_GET: 0x01,
  MORSE_SET: 0x02,
  COMBO_GET: 0x03,
  COMBO_SET: 0x04,
};

const be16 = (v) => [(v >> 8) & 0xff, v & 0xff];
const le16 = (v) => [v & 0xff, (v >> 8) & 0xff];
const readBe16 = (d, i) => (d[i] << 8) | d[i + 1];
const readLe16 = (d, i) => d[i] | (d[i + 1] << 8);

// --- command 組み立て ---------------------------------------------------------

// keymap 1 entry。keycode は BE（rmk: BigEndian::read_u16(&output_data[4..6])）。
export const setKeycodeCmd = (layer, row, col, keycode) => [
  CMD.SET_KEYCODE,
  layer,
  row,
  col,
  ...be16(keycode),
];
export const getKeycodeCmd = (layer, row, col) => [CMD.GET_KEYCODE, layer, row, col];

// encoder 1 方向。direction は 1 が clockwise（vial-gui の 0 = CCW と対応）。keycode は BE。
export const setEncoderCmd = (layer, index, direction, keycode) => [
  CMD.VIAL_PREFIX,
  VIAL.SET_ENCODER,
  layer,
  index,
  direction,
  ...be16(keycode),
];
export const getEncoderCmd = (layer, index) => [CMD.VIAL_PREFIX, VIAL.GET_ENCODER, layer, index];

// tap dance（RMK では morse）1 件。値は LE。timeout は hold と gap の両方へ入る。
export const setTapDanceCmd = (index, { tap, hold, doubleTap, holdAfterTap, timeout }) => [
  CMD.VIAL_PREFIX,
  VIAL.DYNAMIC_ENTRY_OP,
  DYNAMIC.MORSE_SET,
  index,
  ...le16(tap),
  ...le16(hold),
  ...le16(doubleTap),
  ...le16(holdAfterTap),
  ...le16(timeout),
];
export const getTapDanceCmd = (index) => [
  CMD.VIAL_PREFIX,
  VIAL.DYNAMIC_ENTRY_OP,
  DYNAMIC.MORSE_GET,
  index,
];

// combo 1 件。入力 4 + 出力 1 を LE で並べる。
export const setComboCmd = (index, actions, output) => [
  CMD.VIAL_PREFIX,
  VIAL.DYNAMIC_ENTRY_OP,
  DYNAMIC.COMBO_SET,
  index,
  ...actions.flatMap(le16),
  ...le16(output),
];
export const getComboCmd = (index) => [
  CMD.VIAL_PREFIX,
  VIAL.DYNAMIC_ENTRY_OP,
  DYNAMIC.COMBO_GET,
  index,
];

// settings 1 件。qsid も値も LE。
export const setSettingCmd = (qsid, value) => [
  CMD.VIAL_PREFIX,
  VIAL.SETTINGS_SET,
  ...le16(qsid),
  ...le16(value),
];
export const getSettingCmd = (qsid) => [CMD.VIAL_PREFIX, VIAL.SETTINGS_GET, ...le16(qsid)];

export const getUnlockStatusCmd = () => [CMD.VIAL_PREFIX, VIAL.GET_UNLOCK_STATUS];

// --- 差分 write --------------------------------------------------------------

/**
 * 差分 1 件を write して、同じ entry を読み直す。
 * 読み直しは RAM 上の値しか見えない点に注意（flash に載ったかどうかは判別できない）。
 */
async function applyOne(session, entry) {
  switch (entry.kind) {
    case "keymap": {
      const { layer, row, col, to } = entry;
      await session.request(
        setKeycodeCmd(layer, row, col, to),
        `set keymap ${layer}/${row}/${col}`,
      );
      const back = await session.request(
        getKeycodeCmd(layer, row, col),
        `get keymap ${layer}/${row}/${col}`,
      );
      return readBe16(back, 4);
    }
    case "encoder": {
      const { layer, index, direction, to } = entry;
      await session.request(
        setEncoderCmd(layer, index, direction, to),
        `set encoder ${layer}/${index}/${direction}`,
      );
      const back = await session.request(
        getEncoderCmd(layer, index),
        `get encoder ${layer}/${index}`,
      );
      // RMK は counter_clockwise を先に BE で書く。
      return direction === 1 ? readBe16(back, 2) : readBe16(back, 0);
    }
    case "tapDance": {
      const { index, to } = entry;
      await session.request(setTapDanceCmd(index, to), `set tap dance ${index}`);
      const back = await session.request(getTapDanceCmd(index), `get tap dance ${index}`);
      return {
        tap: readLe16(back, 1),
        hold: readLe16(back, 3),
        doubleTap: readLe16(back, 5),
        holdAfterTap: readLe16(back, 7),
        timeout: readLe16(back, 9),
      };
    }
    case "combo": {
      const { index, to } = entry;
      await session.request(setComboCmd(index, to.actions, to.output), `set combo ${index}`);
      const back = await session.request(getComboCmd(index), `get combo ${index}`);
      return {
        actions: [1, 3, 5, 7].map((i) => readLe16(back, i)),
        output: readLe16(back, 9),
      };
    }
    case "setting": {
      const { qsid, to } = entry;
      await session.request(setSettingCmd(qsid, to), `set setting 0x${qsid.toString(16)}`);
      const back = await session.request(getSettingCmd(qsid), `get setting 0x${qsid.toString(16)}`);
      return back[0] === 0 ? readLe16(back, 1) : null;
    }
    default:
      throw new Error(`未知の diff 種別: ${entry.kind}`);
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 差分列を 1 件ずつ write し、その都度読み直して verify する。
 * 途中で失敗したら止め、「どこまで write 済みか」を返す。
 */
export async function applyDiff(device, entries, { timeoutMs, onProgress } = {}) {
  if (!device.opened) await device.open();
  const session = new VialSession(device, {
    timeoutMs,
    onRoundTrip: (n, label, ms) => onProgress?.({ n, label, ms }),
  });
  const result = { applied: [], mismatched: [], failedAt: null, error: null };
  const started = performance.now();
  try {
    for (const [i, entry] of entries.entries()) {
      const observed = await applyOne(session, entry);
      if (same(observed, entry.to)) result.applied.push(i);
      else result.mismatched.push({ index: i, entry, observed });
    }
  } catch (error) {
    result.failedAt = {
      index: result.applied.length + result.mismatched.length,
      entry: entries[result.applied.length + result.mismatched.length],
    };
    result.error = String(error);
  } finally {
    result.wallClockMs = Math.round((performance.now() - started) * 100) / 100;
    result.roundTrip = session.stats();
    result.stalledAt = session.stalledAt;
    session.close();
  }
  return result;
}

/** 1 entry だけ write する（実機 probe 用。ユーザーが押したときにだけ呼ばれる）。 */
export async function writeSingleKeycode(device, { layer, row, col, keycode, timeoutMs }) {
  return applyDiff(device, [{ kind: "keymap", layer, row, col, to: keycode }], { timeoutMs });
}

/** 1 entry だけ読む。write 前後の比較と、再接続後の再読み込みに使う。 */
export async function readSingleKeycode(device, { layer, row, col, timeoutMs }) {
  if (!device.opened) await device.open();
  const session = new VialSession(device, { timeoutMs });
  try {
    const back = await session.request(
      getKeycodeCmd(layer, row, col),
      `get keymap ${layer}/${row}/${col}`,
    );
    return readBe16(back, 4);
  } finally {
    session.close();
  }
}

/** unlock 状態を読む（read のみ。unlock 操作は行わない）。 */
export async function readUnlockStatus(device, { timeoutMs } = {}) {
  if (!device.opened) await device.open();
  const session = new VialSession(device, { timeoutMs });
  try {
    const back = await session.request(getUnlockStatusCmd(), "vial unlock status");
    return { unlocked: back[0], unlockInProgress: back[1], raw: Array.from(back.subarray(0, 12)) };
  } finally {
    session.close();
  }
}
