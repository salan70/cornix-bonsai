import { deepStrictEqual, strictEqual, rejects } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { NOT_IMPLEMENTED_COMMANDS, WRITE_COMMANDS } from "../core/apply/commands.ts";
import { parseDefinition, toPhysicalLayout } from "../core/definition/parse.ts";
import type { KeyboardDefinition } from "../core/definition/types.ts";
import { diffDocuments } from "../core/diff/diff.ts";
import type { WriteTarget } from "../core/apply/targets.ts";
import { encodeVialKeycode } from "../core/keycode/wire.ts";
import { parseVil } from "../core/vil/parse.ts";
import type { VilDocument } from "../core/vil/types.ts";
import {
  DeviceIoError,
  VIAL_REPORT_SIZE,
  VialSession,
  encodeWriteCommand,
  readVialDevice,
  writeAndVerify,
} from "./protocol.ts";
import { MockHidDevice } from "./mock.ts";

test("single-entry write command は5種類だけを組み立てる", () => {
  const cases: readonly [WriteTarget, readonly number[], readonly number[]][] = [
    [{ kind: "key", layer: 1, row: 2, col: 3 }, [0x1234], [0x05, 1, 2, 3, 0x12, 0x34]],
    [
      { kind: "encoder", layer: 1, index: 2, direction: 1 },
      [0x1234],
      [0xfe, 0x04, 1, 2, 1, 0x12, 0x34],
    ],
    [
      { kind: "tapDance", index: 4 },
      [1, 2, 3, 4, 500],
      [0xfe, 0x0d, 0x02, 4, 1, 0, 2, 0, 3, 0, 4, 0, 0xf4, 0x01],
    ],
    [
      { kind: "combo", index: 4 },
      [1, 2, 3, 4, 5],
      [0xfe, 0x0d, 0x04, 4, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0],
    ],
    [{ kind: "setting", qsid: 7 }, [500], [0xfe, 0x0b, 7, 0, 0xf4, 0x01]],
  ];
  for (const [target, values, expected] of cases)
    deepStrictEqual(encodeWriteCommand(target, values), expected);
  strictEqual(WRITE_COMMANDS.key.id, 0x05);
  strictEqual(
    NOT_IMPLEMENTED_COMMANDS.some((command) => command.startsWith("0x13")),
    true,
  );
});

test("write後のackではなく同一entryの再read値を返す", async () => {
  const device = new MockHidDevice(async (request) => {
    const response = new Uint8Array(32);
    if (request[0] === 0x04) {
      response[4] = 0x12;
      response[5] = 0x34;
    }
    return response;
  });
  const session = new VialSession(device);
  const observed = await writeAndVerify(
    session,
    { kind: "key", layer: 0, row: 0, col: 0 },
    [0x1234],
  );
  session.close();
  deepStrictEqual(observed, [0x1234]);
});

test("responseが無い場合はtimeoutとしてabortできる", async () => {
  const device = new MockHidDevice(() => undefined);
  const session = new VialSession(device, { timeoutMs: 5 });
  await rejects(
    session.request([0x01], "timeout test"),
    (error: unknown) => error instanceof DeviceIoError && error.reason === "timeout",
  );
  session.close();
});

test("Vial input reportが32 byteでなければprotocol errorにする", async () => {
  const device = new MockHidDevice(() => new Uint8Array(31));
  const session = new VialSession(device, { timeoutMs: 100 });
  await rejects(
    session.request([0x01], "invalid report test"),
    (error: unknown) => error instanceof DeviceIoError && error.reason === "protocol",
  );
  session.close();
});

test("disconnectは古いrequestを再利用せず明示的に失敗させる", async () => {
  const device = new MockHidDevice(() => undefined);
  const session = new VialSession(device, { timeoutMs: 1000 });
  const pending = session.request([0x01], "disconnect test");
  await new Promise((resolve) => setTimeout(resolve, 0));
  device.disconnect();
  await rejects(
    pending,
    (error: unknown) => error instanceof DeviceIoError && error.reason === "disconnected",
  );
  session.close();
});

test("full readはdefinition pageからcapacities/keymap/behavior/settingsを復元する", async () => {
  const definitionText = await readFile(
    new URL("../../fixtures/cornix-lp/vial-definition-v1.12.json", import.meta.url),
    "utf8",
  );
  const baselineText = await readFile(
    new URL("../../fixtures/cornix-lp/baseline.vil", import.meta.url),
    "utf8",
  );
  const definition = parseDefinition(definitionText);
  const baseline = parseVil(baselineText);
  const physical = toPhysicalLayout(definition);
  const definitionBytes = new TextEncoder().encode(definitionText);
  const layers = 2;
  const values = new Uint8Array(layers * definition.matrix.rows * definition.matrix.cols * 2);
  const firstKey = physical.keys[0];
  if (firstKey === undefined) throw new Error("fixture definition has no physical key");
  writeBe16(
    values,
    keymapOffset(
      layers,
      definition.matrix.rows,
      definition.matrix.cols,
      0,
      firstKey.row,
      firstKey.col,
    ),
    encodeVialKeycode("KC_A", 6),
  );
  const device = createVialMock({
    definitionBytes,
    baseline,
    layers,
    values,
    rows: definition.matrix.rows,
    cols: definition.matrix.cols,
    macroCount: 0,
  });
  const session = new VialSession(device, { timeoutMs: 100 });
  const result = await readVialDevice(session, async (compressed) => {
    deepStrictEqual([...compressed], [...definitionBytes]);
    return definitionText;
  });
  session.close();
  strictEqual(result.keyboardUid, baseline.uid);
  strictEqual(result.capacities.layerCount, layers);
  strictEqual(result.capacities.tapDanceCount, baseline.tapDance.length);
  strictEqual(result.capacities.comboCount, baseline.combo.length);
  strictEqual(result.document.layout[0]?.[firstKey.row]?.[firstKey.col], "KC_A");
  strictEqual(result.document.layout[0]?.[0]?.[definition.matrix.cols - 1], -1);
  strictEqual(result.document.encoderLayout.length, layers);
  strictEqual(result.supportedQsids.length, Object.keys(baseline.settings).length);
});

test("baseline全layerのfull readはbaselineとの差分を1件も出さない", async () => {
  const { device, baseline, definition } = await createBaselineFixture();
  const session = new VialSession(device, { timeoutMs: 100 });
  const result = await readVialDevice(session, async () => definition.text);
  session.close();

  // `layouts.labels`があるCornix LPでは実機のlayout_optionsをreadする（R-003）。
  strictEqual(result.document.layoutOptions, baseline.layoutOptions);
  strictEqual(result.capacities.layerCount, baseline.layout.length);
  deepStrictEqual(diffDocuments(baseline, result.document, definition.parsed).entries, []);
});

/** baseline `.vil` をそのまま返す mock device 一式。 */
async function createBaselineFixture(): Promise<{
  readonly device: MockHidDevice;
  readonly baseline: VilDocument;
  readonly definition: { readonly text: string; readonly parsed: KeyboardDefinition };
}> {
  const definitionText = await readFile(
    new URL("../../fixtures/cornix-lp/vial-definition-v1.12.json", import.meta.url),
    "utf8",
  );
  const baseline = parseVil(
    await readFile(new URL("../../fixtures/cornix-lp/baseline.vil", import.meta.url), "utf8"),
  );
  const parsed = parseDefinition(definitionText);
  const layers = baseline.layout.length;
  const rows = parsed.matrix.rows;
  const cols = parsed.matrix.cols;
  const values = new Uint8Array(layers * rows * cols * 2);
  for (let layer = 0; layer < layers; layer++) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const keycode = baseline.layout[layer]?.[row]?.[col];
        if (typeof keycode !== "string") continue;
        writeBe16(
          values,
          keymapOffset(layers, rows, cols, layer, row, col),
          encodeVialKeycode(keycode, 6),
        );
      }
    }
  }
  return {
    device: createVialMock({
      definitionBytes: new TextEncoder().encode(definitionText),
      baseline,
      layers,
      values,
      rows,
      cols,
      macroCount: baseline.macro.length,
    }),
    baseline,
    definition: { text: definitionText, parsed },
  };
}

interface VialMockOptions {
  readonly definitionBytes: Uint8Array;
  readonly baseline: VilDocument;
  readonly layers: number;
  readonly values: Uint8Array;
  readonly rows: number;
  readonly cols: number;
  readonly macroCount: number;
}

/** baseline `.vil` と definition をそのまま配る Vial device の mock。 */
function createVialMock(options: VialMockOptions): MockHidDevice {
  const { definitionBytes, baseline, layers, values, rows, cols, macroCount } = options;
  const settings = Object.entries(baseline.settings).map(
    ([qsid, value]) => [Number(qsid), value] as const,
  );
  return new MockHidDevice(async (request) => {
    const response = new Uint8Array(VIAL_REPORT_SIZE);
    switch (request[0]) {
      case 0x01:
        writeBe16(response, 1, baseline.viaProtocol);
        break;
      case 0xfe:
        if (request[1] === 0x00) {
          writeLe32(response, 0, baseline.vialProtocol);
          writeLe64(response, 4, BigInt(baseline.uid));
        } else if (request[1] === 0x01) writeLe32(response, 0, definitionBytes.length);
        else if (request[1] === 0x02) {
          const offset = readLe32(request, 2) * VIAL_REPORT_SIZE;
          response.set(definitionBytes.slice(offset, offset + VIAL_REPORT_SIZE), 0);
        } else if (request[1] === 0x03) {
          const layer = request[2] ?? 0;
          const index = request[3] ?? 0;
          const encoder = baseline.encoderLayout[layer]?.[index] ?? ["KC_NO", "KC_NO"];
          writeBe16(response, 0, encodeVialKeycode(encoder[0] ?? "KC_NO", 6));
          writeBe16(response, 2, encodeVialKeycode(encoder[1] ?? "KC_NO", 6));
        } else if (request[1] === 0x09) {
          response.fill(0xff);
          const cursor = readLe16(request, 2);
          settings
            .filter(([qsid]) => qsid > cursor)
            .forEach(([qsid], index) => writeLe16(response, index * 2, qsid));
        } else if (request[1] === 0x0a) {
          const value = settings.find(([qsid]) => qsid === readLe16(request, 2))?.[1] ?? 0;
          writeLe16(response, 1, value);
        } else if (request[1] === 0x0d && request[2] === 0x00) {
          response[0] = baseline.tapDance.length;
          response[1] = baseline.combo.length;
        } else if (request[1] === 0x0d && request[2] === 0x01) {
          const entry = baseline.tapDance[request[3] ?? 0] ?? [
            "KC_NO",
            "KC_NO",
            "KC_NO",
            "KC_NO",
            200,
          ];
          entry
            .slice(0, 4)
            .forEach((value, index) =>
              writeLe16(response, 1 + index * 2, encodeVialKeycode(String(value), 6)),
            );
          writeLe16(response, 9, Number(entry[4] ?? 200));
        } else if (request[1] === 0x0d && request[2] === 0x03) {
          const entry = baseline.combo[request[3] ?? 0] ?? [
            "KC_NO",
            "KC_NO",
            "KC_NO",
            "KC_NO",
            "KC_NO",
          ];
          entry.forEach((value, index) =>
            writeLe16(response, 1 + index * 2, encodeVialKeycode(value, 6)),
          );
        }
        break;
      case 0x02:
        writeBe32(response, 2, baseline.layoutOptions);
        break;
      case 0x04:
        response.set(
          values.slice(
            keymapOffset(layers, rows, cols, request[1] ?? 0, request[2] ?? 0, request[3] ?? 0),
            keymapOffset(layers, rows, cols, request[1] ?? 0, request[2] ?? 0, request[3] ?? 0) + 2,
          ),
          4,
        );
        break;
      case 0x05: {
        // 実機と同じく、writeした値を同一entryの再readとfull readの双方へ反映する。
        const offset = keymapOffset(
          layers,
          rows,
          cols,
          request[1] ?? 0,
          request[2] ?? 0,
          request[3] ?? 0,
        );
        values[offset] = request[4] ?? 0;
        values[offset + 1] = request[5] ?? 0;
        break;
      }
      case 0x0c:
        response[1] = macroCount;
        break;
      case 0x0d:
        writeBe16(response, 1, 0);
        break;
      case 0x11:
        response[1] = layers;
        break;
      case 0x12: {
        const offset = readBe16(request, 1);
        response.set(values.slice(offset, offset + (request[3] ?? 0)), 4);
        break;
      }
      case 0x0e:
        break;
    }
    return response;
  });
}

function keymapOffset(
  layers: number,
  rows: number,
  cols: number,
  layer: number,
  row: number,
  col: number,
): number {
  return (layer * rows * cols + row * cols + col) * 2;
}
function writeBe16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}
function writeBe32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >> 24) & 0xff;
  bytes[offset + 1] = (value >> 16) & 0xff;
  bytes[offset + 2] = (value >> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
function writeLe16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}
function writeLe32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
function writeLe64(bytes: Uint8Array, offset: number, value: bigint): void {
  for (let index = 0; index < 8; index++)
    bytes[offset + index] = Number((value >> BigInt(index * 8)) & 0xffn);
}
function readBe16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}
function readLe16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}
function readLe32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  );
}
