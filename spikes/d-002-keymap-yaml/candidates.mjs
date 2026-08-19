// D-002 Spike: keymap.yaml の候補 schema。
// 使い捨てコードです。本実装ではありません。
// 判断の結果は docs/decisions/0009-keymap-yaml-schema.md にあります。
//
// 比較するのは「同じ VilDocument を YAML へ落とす 3 通りの並べ方」だけ。
// 何を載せるか（= 可逆な射影に限る）は 3 案で共通にして、差を並べ方だけに絞る。

/** YAML の scalar 1 個。keycode は必ず引用する（`KC_NO` と YAML の真偽値表記の衝突を避ける）。 */
function scalar(value) {
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function header(doc) {
  return [
    "schema: cornix-bonsai/keymap@1",
    "keyboard:",
    `  uid: ${scalar(doc.uid)}`,
    "vial:",
    `  version: ${doc.version}`,
    `  vialProtocol: ${doc.vialProtocol}`,
    `  viaProtocol: ${doc.viaProtocol}`,
    `  layoutOptions: ${doc.layoutOptions}`,
  ];
}

/** 案A: raw JSON の構造をそのまま block style の YAML にする（機械的な写像）。 */
export function emitA(doc) {
  const lines = [...header(doc), "layout:"];
  doc.layout.forEach((layer) => {
    lines.push("  -");
    layer.forEach((row) => {
      lines.push("    -");
      row.forEach((entry) => lines.push(`      - ${scalar(entry)}`));
    });
  });
  return lines.join("\n") + "\n";
}

/** 案B: layer ごとの block、row を flow sequence で 1 行に置く（格子を保つ）。 */
export function emitB(doc) {
  const lines = [...header(doc), "layers:"];
  doc.layout.forEach((layer, layerIndex) => {
    lines.push(`  # layer ${layerIndex}`);
    layer.forEach((row, rowIndex) => {
      const body = row.map(scalar).join(", ");
      lines.push(`${rowIndex === 0 ? "  - " : "    "}- [${body}]`);
    });
  });
  return lines.join("\n") + "\n";
}

/** 案C: 位置を key にして 1 キー 1 行に置く（最小 diff）。 */
export function emitC(doc) {
  const lines = [...header(doc), "keys:"];
  doc.layout.forEach((layer, layerIndex) => {
    layer.forEach((row, rowIndex) => {
      row.forEach((entry, colIndex) => {
        lines.push(`  L${layerIndex}.r${rowIndex}.c${colIndex}: ${scalar(entry)}`);
      });
    });
  });
  return lines.join("\n") + "\n";
}

export const CANDIDATES = { A: emitA, B: emitB, C: emitC };
