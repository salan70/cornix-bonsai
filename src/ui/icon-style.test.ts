import { deepStrictEqual, strictEqual } from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ICON_STYLE,
  ICON_STYLE_STORAGE_KEY,
  applyIconStyle,
  loadIconStyle,
  parseIconStyle,
  saveIconStyle,
} from "./icon-style.ts";

test("アイコンの見た目は未保存・不正値を凹みあり（dish）へフォールバックする", () => {
  strictEqual(DEFAULT_ICON_STYLE, "dish");
  strictEqual(parseIconStyle(undefined), "dish");
  strictEqual(parseIconStyle(null), "dish");
  strictEqual(parseIconStyle("squircle"), "dish");
  strictEqual(loadIconStyle(undefined), "dish");
  strictEqual(loadIconStyle({ getItem: () => "unexpected", setItem: () => undefined }), "dish");
});

test("保存したflat / dishを読み戻せる", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  saveIconStyle(storage, "flat");
  strictEqual(values.get(ICON_STYLE_STORAGE_KEY), "flat");
  strictEqual(loadIconStyle(storage), "flat");
  saveIconStyle(storage, "dish");
  strictEqual(loadIconStyle(storage), "dish");
});

test("選んだ見た目をdocument rootへ反映する", () => {
  const root = { dataset: {} as DOMStringMap };
  applyIconStyle(root, "flat");
  deepStrictEqual(root.dataset, { iconStyle: "flat" });
  applyIconStyle(root, "dish");
  deepStrictEqual(root.dataset, { iconStyle: "dish" });
});

test("Storage例外が発生しても現在の選択を妨げない", () => {
  const failingStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  strictEqual(loadIconStyle(failingStorage), "dish");
  saveIconStyle(failingStorage, "flat");
});
