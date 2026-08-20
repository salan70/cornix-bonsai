import { strictEqual, throws } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canonicalDefinitionText } from "./identity.ts";
import { parseDefinition } from "./parse.ts";

test("整形とキー順が違う同じJSONは同じcanonical表現になる", () => {
  const compact = '{"name":"Cornix LP","matrix":{"rows":8,"cols":7},"layouts":{"keymap":[]}}';
  const pretty =
    '{\n\t"layouts": {"keymap": []},\n\t"matrix": {"cols": 7, "rows": 8},\n\t"name": "Cornix LP"\n}';
  strictEqual(canonicalDefinitionText(pretty), canonicalDefinitionText(compact));
});

test("canonical表現はarrayの順序を保ち、内容が違えば別の表現になる", () => {
  strictEqual(canonicalDefinitionText('{"a":[2,1]}'), '{\n  "a": [\n    2,\n    1\n  ]\n}\n');
  strictEqual(
    canonicalDefinitionText('{"a":[1,2]}') === canonicalDefinitionText('{"a":[2,1]}'),
    false,
  );
  throws(() => canonicalDefinitionText("{"), /JSON として読めなかった/);
});

test("canonical表現はdefinitionとして読み直せる", () => {
  const text = readFileSync(
    new URL("../../../fixtures/cornix-lp/vial-definition-v1.12.json", import.meta.url),
    "utf8",
  );
  const canonical = canonicalDefinitionText(text);
  strictEqual(canonicalDefinitionText(canonical), canonical);
  strictEqual(parseDefinition(canonical).name, parseDefinition(text).name);
  strictEqual(
    parseDefinition(canonical).layouts.keymap.length,
    parseDefinition(text).layouts.keymap.length,
  );
});
