/**
 * Vial/VIA protocol の report transport と read/write primitive。
 *
 * この module は WebHID API を直接参照しない。browser adapter は `HidDeviceLike` を
 * 実装へ渡し、mock は同じ契約で wire の並びを検証する。write command は
 * `WRITE_COMMANDS` にある単一 entry の5種類だけを組み立てる。
 */

import { parseDefinition, toPhysicalLayout } from "../core/definition/parse.ts";
import type { KeyboardDefinition } from "../core/definition/types.ts";
import { hasLayoutLabels } from "../core/model/layout-options.ts";
import {
  WRITE_COMMANDS,
  ROUND_TRIP_TIMEOUT_MS,
  type WriteCommandKind,
} from "../core/apply/commands.ts";
import { targetKey, type WriteTarget } from "../core/apply/targets.ts";
import type { DeviceSnapshot } from "../core/apply/plan.ts";
import type { Capacities } from "../core/keycode/table.ts";
import {
  decodeVialKeycode,
  encodeVialKeycode,
  type WireDecodeCapacities,
} from "../core/keycode/wire.ts";
import type { VilDocument } from "../core/vil/types.ts";

export const VIAL_USAGE_PAGE = 0xff60;
export const VIAL_USAGE = 0x61;
export const VIAL_REPORT_ID = 0x00;
export const VIAL_REPORT_SIZE = 32;

export interface HidDeviceLike {
  readonly opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: Uint8Array): Promise<void>;
  addEventListener(type: "inputreport" | "disconnect", listener: (event: unknown) => void): void;
  removeEventListener(type: "inputreport" | "disconnect", listener: (event: unknown) => void): void;
}

export interface RoundTripProgress {
  readonly count: number;
  readonly label: string;
  readonly total?: number;
}

export interface VialSessionOptions {
  readonly timeoutMs?: number;
  readonly onProgress?: (progress: RoundTripProgress) => void;
}

export class DeviceIoError extends Error {
  readonly reason: "timeout" | "disconnected" | "protocol";

  constructor(message: string, reason: "timeout" | "disconnected" | "protocol") {
    super(message);
    this.reason = reason;
  }
}

/** @doc docs/specs/device-adapter.md#report-session */
export class VialSession {
  private readonly device: HidDeviceLike;
  private readonly options: VialSessionOptions;
  private pending:
    | { resolve: (value: Uint8Array) => void; reject: (error: Error) => void }
    | undefined;
  private count = 0;
  private readonly onInput = (event: unknown): void => {
    const data = extractInputReport(event);
    if (this.pending === undefined) return;
    const pending = this.pending;
    this.pending = undefined;
    if (data === undefined) {
      pending.reject(new DeviceIoError("Vial input reportが0x00/32 byteではない", "protocol"));
      return;
    }
    pending.resolve(data);
  };
  private readonly onDisconnect = (): void => {
    const pending = this.pending;
    this.pending = undefined;
    pending?.reject(new DeviceIoError("device が切断された", "disconnected"));
  };

  constructor(device: HidDeviceLike, options: VialSessionOptions = {}) {
    this.device = device;
    this.options = options;
    device.addEventListener("inputreport", this.onInput);
    device.addEventListener("disconnect", this.onDisconnect);
  }

  async request(bytes: readonly number[], label: string): Promise<Uint8Array> {
    if (this.pending !== undefined)
      throw new DeviceIoError("前のVial requestが完了していない", "protocol");
    if (!this.device.opened) await this.device.open();
    const report = new Uint8Array(VIAL_REPORT_SIZE);
    report.set(bytes.slice(0, VIAL_REPORT_SIZE));
    const timeoutMs = this.options.timeoutMs ?? ROUND_TRIP_TIMEOUT_MS;
    const response = new Promise<Uint8Array>((resolve, reject) => {
      this.pending = { resolve, reject };
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const send = this.device.sendReport(VIAL_REPORT_ID, report).catch((cause: unknown) => {
        const pending = this.pending;
        this.pending = undefined;
        pending?.reject(new DeviceIoError(`sendReport失敗: ${String(cause)}`, "disconnected"));
      });
      timeout = setTimeout(() => {
        const pending = this.pending;
        this.pending = undefined;
        pending?.reject(new DeviceIoError(`timeout ${timeoutMs}ms: ${label}`, "timeout"));
      }, timeoutMs);
      const value = await Promise.race([response, send.then(() => response)]);
      this.count += 1;
      this.options.onProgress?.({ count: this.count, label });
      return value;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      this.pending = undefined;
    }
  }

  close(): void {
    this.device.removeEventListener("inputreport", this.onInput);
    this.device.removeEventListener("disconnect", this.onDisconnect);
  }
}

export interface DeviceReadResult {
  readonly document: VilDocument;
  readonly definition: KeyboardDefinition;
  readonly definitionXz: Uint8Array;
  readonly capacities: Capacities;
  readonly supportedQsids: readonly number[];
  readonly keyboardUid: string;
  readonly vialProtocol: number;
  readonly viaProtocol: number;
}

export type DefinitionDecoder = (compressed: Uint8Array) => Promise<string>;

/** full read。definitionからmatrix/encoder容量を導出し、hard-codeしない。 */
/** @doc docs/specs/device-adapter.md#full-read */
export async function readVialDevice(
  session: VialSession,
  decodeDefinition: DefinitionDecoder,
  onProgress?: (progress: RoundTripProgress) => void,
): Promise<DeviceReadResult> {
  const via = await session.request([0x01], "via protocol version");
  const viaProtocol = readBe16(via, 1);
  const keyboard = await session.request([0xfe, 0x00], "vial keyboard id");
  const vialProtocol = readLe32(keyboard, 0);
  const keyboardUid = readLe64AsDecimal(keyboard, 4);
  const size = readLe32(await session.request([0xfe, 0x01], "vial definition size"), 0);
  const definitionChunks: Uint8Array[] = [];
  for (let page = 0; page * VIAL_REPORT_SIZE < size; page++) {
    const response = await session.request([0xfe, 0x02, ...le32(page)], `definition page ${page}`);
    definitionChunks.push(
      response.slice(0, Math.min(VIAL_REPORT_SIZE, size - page * VIAL_REPORT_SIZE)),
    );
  }
  const definitionXz = concat(definitionChunks);
  const definition = parseDefinition(await decodeDefinition(definitionXz));
  const physical = toPhysicalLayout(definition);
  const layerCount = (await session.request([0x11], "layer count"))[1] ?? 0;
  const macroCount = (await session.request([0x0c], "macro count"))[1] ?? 0;
  const macroSize = readBe16(await session.request([0x0d], "macro buffer size"), 1);
  const dynamic = await session.request([0xfe, 0x0d, 0x00], "dynamic entry count");
  const tapDanceCount = dynamic[0] ?? 0;
  const comboCount = dynamic[1] ?? 0;
  if ((dynamic[2] ?? 0) !== 0 || (dynamic[3] ?? 0) !== 0) {
    throw new DeviceIoError(
      "key override / alt repeat keyはこのadapterでは未対応のためfull readを中断した",
      "protocol",
    );
  }
  const capacities: Capacities = { layerCount, macroCount, tapDanceCount, comboCount };
  const settingsRead = await readSettings(session, vialProtocol);
  const physicalPositions = new Set(physical.keys.map((key) => `${key.row},${key.col}`));
  const keymap = await readKeymap(
    session,
    layerCount,
    definition.matrix.rows,
    definition.matrix.cols,
    physicalPositions,
    vialProtocol,
    capacities,
    onProgress,
  );
  const encoderCount =
    physical.encoders.length === 0
      ? 0
      : Math.max(...physical.encoders.map((entry) => entry.index)) + 1;
  const encoderLayout: string[][][] = [];
  for (let layer = 0; layer < layerCount; layer++) {
    const row: string[][] = [];
    for (let index = 0; index < encoderCount; index++) {
      const response = await session.request(
        [0xfe, 0x03, layer, index],
        `encoder L${layer} #${index}`,
      );
      row.push([
        decodeVialKeycode(readBe16(response, 0), vialProtocol, capacities),
        decodeVialKeycode(readBe16(response, 2), vialProtocol, capacities),
      ]);
    }
    encoderLayout.push(row);
  }
  // vial-guiは`layouts.labels`があればlayout_optionsをreadする（R-003）。個別keyの
  // layout option有無で判断すると、labelsだけを持つCornix LPで`-1`になり偽差分になる。
  const layoutOptions = hasLayoutLabels(definition)
    ? readBe32(await session.request([0x02, 0x02], "layout options"), 2)
    : -1;
  const macro = await readMacroBuffer(session, macroCount, macroSize, onProgress);
  const tapDance = [] as [string, string, string, string, number][];
  for (let index = 0; index < tapDanceCount; index++) {
    const response = await session.request([0xfe, 0x0d, 0x01, index], `tap dance ${index}`);
    tapDance.push([
      decodeVialKeycode(readLe16(response, 1), vialProtocol, capacities),
      decodeVialKeycode(readLe16(response, 3), vialProtocol, capacities),
      decodeVialKeycode(readLe16(response, 5), vialProtocol, capacities),
      decodeVialKeycode(readLe16(response, 7), vialProtocol, capacities),
      readLe16(response, 9),
    ]);
  }
  const combo = [] as [string, string, string, string, string][];
  for (let index = 0; index < comboCount; index++) {
    const response = await session.request([0xfe, 0x0d, 0x03, index], `combo ${index}`);
    combo.push([
      decodeVialKeycode(readLe16(response, 1), vialProtocol, capacities),
      decodeVialKeycode(readLe16(response, 3), vialProtocol, capacities),
      decodeVialKeycode(readLe16(response, 5), vialProtocol, capacities),
      decodeVialKeycode(readLe16(response, 7), vialProtocol, capacities),
      decodeVialKeycode(readLe16(response, 9), vialProtocol, capacities),
    ]);
  }
  return {
    document: {
      version: 1,
      uid: keyboardUid,
      layout: keymap,
      encoderLayout,
      layoutOptions,
      macro,
      vialProtocol,
      viaProtocol,
      tapDance,
      combo,
      keyOverride: [],
      altRepeatKey: [],
      settings: settingsRead.values,
      raw: {
        keyOrder: [
          "version",
          "uid",
          "layout",
          "encoder_layout",
          "layout_options",
          "macro",
          "vial_protocol",
          "via_protocol",
          "tap_dance",
          "combo",
          "key_override",
          "alt_repeat_key",
          "settings",
        ],
        unknown: {},
      },
    },
    definition,
    definitionXz,
    capacities,
    supportedQsids: settingsRead.qsids,
    keyboardUid,
    vialProtocol,
    viaProtocol,
  };
}

/** @doc docs/specs/device-adapter.md#single-entry-write */
export async function writeAndVerify(
  session: VialSession,
  target: WriteTarget,
  after: readonly number[],
): Promise<readonly number[]> {
  const command = encodeWriteCommand(target, after);
  await session.request(command, `write ${targetKey(target)}`);
  return readTarget(session, target);
}

/** @doc docs/specs/device-adapter.md#single-entry-write */
export function encodeWriteCommand(
  target: WriteTarget,
  values: readonly number[],
): readonly number[] {
  switch (target.kind) {
    case "key":
      return [
        WRITE_COMMANDS.key.id,
        target.layer,
        target.row,
        target.col,
        ...be16(requireValue(values, 0)),
      ];
    case "encoder":
      return [
        WRITE_COMMANDS.encoder.id,
        WRITE_COMMANDS.encoder.sub,
        target.layer,
        target.index,
        target.direction,
        ...be16(requireValue(values, 0)),
      ];
    case "tapDance":
      return [
        WRITE_COMMANDS.tapDance.id,
        WRITE_COMMANDS.tapDance.sub,
        0x02,
        target.index,
        ...values.flatMap((value) => le16(value)),
      ];
    case "combo":
      return [
        WRITE_COMMANDS.combo.id,
        WRITE_COMMANDS.combo.sub,
        0x04,
        target.index,
        ...values.flatMap((value) => le16(value)),
      ];
    case "setting":
      return [
        WRITE_COMMANDS.setting.id,
        WRITE_COMMANDS.setting.sub,
        ...le16(target.qsid),
        ...le16(requireValue(values, 0)),
      ];
  }
}

async function readTarget(session: VialSession, target: WriteTarget): Promise<readonly number[]> {
  switch (target.kind) {
    case "key":
      return [
        readBe16(
          await session.request(
            [0x04, target.layer, target.row, target.col],
            `read ${targetKey(target)}`,
          ),
          4,
        ),
      ];
    case "encoder": {
      const response = await session.request(
        [0xfe, 0x03, target.layer, target.index],
        `read ${targetKey(target)}`,
      );
      return [readBe16(response, target.direction === 0 ? 0 : 2)];
    }
    case "tapDance": {
      const response = await session.request(
        [0xfe, 0x0d, 0x01, target.index],
        `read ${targetKey(target)}`,
      );
      return [1, 3, 5, 7].map((offset) => readLe16(response, offset)).concat(readLe16(response, 9));
    }
    case "combo": {
      const response = await session.request(
        [0xfe, 0x0d, 0x03, target.index],
        `read ${targetKey(target)}`,
      );
      return [1, 3, 5, 7, 9].map((offset) => readLe16(response, offset));
    }
    case "setting": {
      const response = await session.request(
        [0xfe, 0x0a, ...le16(target.qsid)],
        `read ${targetKey(target)}`,
      );
      if (response[0] !== 0)
        throw new DeviceIoError(`setting ${target.qsid} が実機で未対応`, "protocol");
      return [readLe16(response, 1)];
    }
  }
}

export function snapshotFromDocument(
  document: VilDocument,
  definition: KeyboardDefinition,
): DeviceSnapshot {
  const values = new Map<string, readonly number[]>();
  const physical = toPhysicalLayout(definition);
  for (let layer = 0; layer < document.layout.length; layer++) {
    for (const key of physical.keys) {
      const value = document.layout[layer]?.[key.row]?.[key.col];
      if (typeof value === "string")
        values.set(targetKey({ kind: "key", layer, row: key.row, col: key.col }), [
          encodeVialKeycode(value, document.vialProtocol),
        ]);
    }
    for (let index = 0; index < (document.encoderLayout[layer]?.length ?? 0); index++) {
      for (const direction of [0, 1] as const) {
        const value = document.encoderLayout[layer]?.[index]?.[direction];
        if (value !== undefined)
          values.set(targetKey({ kind: "encoder", layer, index, direction }), [
            encodeVialKeycode(value, document.vialProtocol),
          ]);
      }
    }
  }
  document.tapDance.forEach((entry, index) =>
    values.set(targetKey({ kind: "tapDance", index }), [
      ...(entry.slice(0, 4) as readonly string[]).map((value) =>
        encodeVialKeycode(value, document.vialProtocol),
      ),
      entry[4],
    ]),
  );
  document.combo.forEach((entry, index) =>
    values.set(
      targetKey({ kind: "combo", index }),
      entry.map((value) => encodeVialKeycode(value, document.vialProtocol)),
    ),
  );
  for (const [qsid, value] of Object.entries(document.settings))
    values.set(targetKey({ kind: "setting", qsid: Number(qsid) }), [value]);
  return { keyboardUid: document.uid, values, readAt: Date.now() };
}

async function readKeymap(
  session: VialSession,
  layers: number,
  rows: number,
  cols: number,
  physical: ReadonlySet<string>,
  protocol: number,
  capacities: WireDecodeCapacities,
  onProgress?: (progress: RoundTripProgress) => void,
): Promise<(string | number)[][][]> {
  const result: (string | number)[][][] = [];
  const bytes = layers * rows * cols * 2;
  const raw = new Uint8Array(bytes);
  for (let offset = 0; offset < bytes; offset += 28) {
    const size = Math.min(28, bytes - offset);
    const response = await session.request(
      [0x12, ...be16(offset), size],
      `keymap buffer @${offset}`,
    );
    raw.set(response.slice(4, 4 + size), offset);
    onProgress?.({ count: offset + size, label: "keymap buffer", total: bytes });
  }
  for (let layer = 0; layer < layers; layer++) {
    const rowsOut: (string | number)[][] = [];
    for (let row = 0; row < rows; row++) {
      const colsOut: (string | number)[] = [];
      for (let col = 0; col < cols; col++) {
        if (!physical.has(`${row},${col}`)) colsOut.push(-1);
        else
          colsOut.push(
            decodeVialKeycode(
              ((raw[(layer * rows * cols + row * cols + col) * 2] ?? 0) << 8) |
                (raw[(layer * rows * cols + row * cols + col) * 2 + 1] ?? 0),
              protocol,
              capacities,
            ),
          );
      }
      rowsOut.push(colsOut);
    }
    result.push(rowsOut);
  }
  return result;
}

async function readMacroBuffer(
  session: VialSession,
  count: number,
  size: number,
  onProgress?: (progress: RoundTripProgress) => void,
): Promise<readonly unknown[]> {
  if (size === 0) return Array.from({ length: count }, () => []);
  const raw: number[] = [];
  for (let offset = 0; offset < size; offset += 28) {
    const chunk = await session.request(
      [0x0e, ...be16(offset), Math.min(28, size - offset)],
      `macro buffer @${offset}`,
    );
    raw.push(...chunk.slice(4, 4 + Math.min(28, size - offset)));
    onProgress?.({
      count: offset + Math.min(28, size - offset),
      label: "macro buffer",
      total: size,
    });
    if (raw.filter((value) => value === 0).length > count) break;
  }
  const entries: number[][] = [];
  let current: number[] = [];
  for (const value of raw) {
    if (value === 0) {
      entries.push(current);
      current = [];
    } else current.push(value);
  }
  while (entries.length < count) entries.push([]);
  return entries.slice(0, count);
}

async function readSettings(
  session: VialSession,
  vialProtocol: number,
): Promise<{
  readonly qsids: readonly number[];
  readonly values: Readonly<Record<string, number>>;
}> {
  if (vialProtocol < 4) return { qsids: [], values: {} };
  const result: number[] = [];
  let cursor = 0;
  do {
    const response = await session.request(
      [0xfe, 0x09, ...le16(cursor)],
      `settings query ${cursor}`,
    );
    let next = 0xffff;
    for (let index = 0; index + 1 < VIAL_REPORT_SIZE; index += 2) {
      const qsid = readLe16(response, index);
      if (qsid === 0xffff) continue;
      result.push(qsid);
      next = Math.max(next === 0xffff ? 0 : next, qsid);
    }
    if (next === 0xffff || next <= cursor) break;
    cursor = next;
  } while (cursor !== 0xffff);
  const qsids = [...new Set(result)].sort((a, b) => a - b);
  const values: Record<string, number> = {};
  for (const qsid of qsids) {
    const response = await session.request([0xfe, 0x0a, ...le16(qsid)], `settings get ${qsid}`);
    if (response[0] === 0) values[String(qsid)] = readLe16(response, 1);
  }
  return { qsids, values };
}

function requireValue(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined || !Number.isInteger(value) || value < 0 || value > 0xffff)
    throw new DeviceIoError("wire value がu16ではない", "protocol");
  return value;
}
function extractInputReport(event: unknown): Uint8Array | undefined {
  if (typeof event !== "object" || event === null) return undefined;
  const reportId = (event as { reportId?: unknown }).reportId;
  if (reportId !== undefined && reportId !== VIAL_REPORT_ID) return undefined;
  const data = (event as { data?: unknown }).data;
  const bytes =
    data instanceof DataView
      ? new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
      : data instanceof Uint8Array
        ? data
        : undefined;
  return bytes?.byteLength === VIAL_REPORT_SIZE ? bytes : undefined;
}
function readBe16(data: Uint8Array, offset: number): number {
  return ((data[offset] ?? 0) << 8) | (data[offset + 1] ?? 0);
}
function readBe32(data: Uint8Array, offset: number): number {
  return (
    (((data[offset] ?? 0) << 24) |
      ((data[offset + 1] ?? 0) << 16) |
      ((data[offset + 2] ?? 0) << 8) |
      (data[offset + 3] ?? 0)) >>>
    0
  );
}
function readLe16(data: Uint8Array, offset: number): number {
  return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);
}
function readLe32(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] ?? 0) |
      ((data[offset + 1] ?? 0) << 8) |
      ((data[offset + 2] ?? 0) << 16) |
      ((data[offset + 3] ?? 0) << 24)) >>>
    0
  );
}
function readLe64AsDecimal(data: Uint8Array, offset: number): string {
  let value = 0n;
  for (let index = 7; index >= 0; index--)
    value = (value << 8n) | BigInt(data[offset + index] ?? 0);
  return value.toString();
}
function be16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}
function le16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}
function le32(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff];
}
function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
