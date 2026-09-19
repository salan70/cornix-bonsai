#!/usr/bin/env node
import { webcrypto } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { parseDefinition } from "../core/definition/parse.ts";
import { canonicalDefinitionText } from "../core/definition/identity.ts";
import { diffDocuments } from "../core/diff/diff.ts";
import { analyzeReachability } from "../core/validation/reachability.ts";
import { validateKeymap } from "../core/validation/validate.ts";
import { parseVil } from "../core/vil/parse.ts";
import { serializeVil } from "../core/vil/serialize.ts";
import { parseKeymapYaml } from "../core/keymap-yaml/parse.ts";
import { serializeKeymapYaml } from "../core/keymap-yaml/serialize.ts";
import { planMacApply, verifyMacApply } from "../core/mac-keymap/apply.ts";
import { generateKarabinerAsset } from "../core/mac-keymap/generate.ts";
import { addMacDevice } from "../core/mac-keymap/edit.ts";
import { serializeMacKeymapYaml } from "../core/mac-keymap/serialize.ts";
import { validateMacKeymap } from "../core/mac-keymap/validate.ts";
import type { MacKeyboardLayout, MacKeymapDocument } from "../core/mac-keymap/types.ts";
import { detectBuiltInLayout } from "../mac/keyboard-type.ts";
import { readMacKeymapFor } from "../workspace/mac-keymap-file.ts";
import {
  defaultKarabinerConfigPath,
  KARABINER_DEVICES_PATH,
  lintComplexModifications,
  readKarabinerConfig,
  readObservedKeyboards,
  writeFileAtomic,
} from "../karabiner/node.ts";
import { renderPdf, renderSvg } from "../render/keyboard.ts";
import {
  backupPath,
  definitionDigest,
  definitionPath,
  generatedPath,
  macKeymapPath,
  readDefinitionBinding,
  WORKSPACE_LAYOUT,
} from "../workspace/layout.ts";
import { parseLabelsYaml, EMPTY_LABELS } from "../workspace/labels.ts";
import { CORNIX_LP_V112_SETTINGS } from "../workspace/settings.ts";
import { NodeWorkspaceStore } from "../workspace/node.ts";

interface LoadedWorkspace {
  readonly root: string;
  readonly store: NodeWorkspaceStore;
  readonly keymapText: string;
  readonly parsed: ReturnType<typeof parseKeymapYaml>;
  readonly definitionText: string;
  readonly definition: ReturnType<typeof parseDefinition>;
  readonly labels: ReturnType<typeof parseLabelsYaml>;
}

/** @doc docs/specs/workspace-cli.md#cli */
export async function main(argv = process.argv.slice(2)): Promise<number> {
  if (argv[0] === "--") argv = argv.slice(1);
  const [command, ...rest] = argv;
  if (command === undefined || command === "help" || command === "--help") {
    printHelp();
    return 0;
  }
  const args = parseArgs(rest);
  const root = resolve(String(args.workspace ?? process.cwd()));
  try {
    if (command === "import" && args._[0] === "vil")
      return await importVil(root, String(args._[1] ?? ""), args);
    // mac 系は keymap.yaml も definition も要らない。loadWorkspace の手前で分ける（ADR 0022）。
    if (command === "mac") return await mac(root, args);
    const workspace = await loadWorkspace(root);
    switch (command) {
      case "validate":
        return validate(workspace);
      case "analyze":
        return analyze(workspace);
      case "diff":
        return await diff(workspace, String(args.against ?? ""));
      case "render":
        return await render(workspace, args);
      case "export":
        if (args._[0] === "vil") return await exportVil(workspace, args);
        break;
      default:
        throw new Error(`未知の command: ${command}`);
    }
    throw new Error(`${command} の引数が不正`);
  } catch (error) {
    console.error(`cornix: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function validate(workspace: LoadedWorkspace): number {
  const result = validateKeymap(workspace.parsed.document, workspace.definition);
  console.log(
    JSON.stringify({ summary: result.summary, diagnostics: result.diagnostics }, null, 2),
  );
  return result.summary.error > 0 ? 1 : 0;
}

function analyze(workspace: LoadedWorkspace): number {
  const result = validateKeymap(workspace.parsed.document, workspace.definition);
  const reachability = analyzeReachability(workspace.parsed.document);
  console.log(
    JSON.stringify(
      {
        summary: result.summary,
        diagnostics: result.diagnostics,
        reachableLayers: [...reachability.reachable].sort((a, b) => a - b),
        edges: reachability.edges,
      },
      null,
      2,
    ),
  );
  return result.summary.error > 0 ? 1 : 0;
}

async function diff(workspace: LoadedWorkspace, against: string): Promise<number> {
  if (against === "") throw new Error("cornix diff --against <file.vil> が必要");
  const before = parseVil(await readFile(resolve(workspace.root, against), "utf8"));
  const result = diffDocuments(before, workspace.parsed.document, workspace.definition, {
    settings: { labels: CORNIX_LP_V112_SETTINGS },
  });
  console.log(JSON.stringify(result, mapReplacer, 2));
  return 0;
}

async function render(workspace: LoadedWorkspace, args: ParsedArgs): Promise<number> {
  const format = String(args.format ?? "svg");
  const layer = args.layer === undefined ? 0 : Number(args.layer);
  const output = String(args.out ?? `${format === "pdf" ? "keymap.pdf" : "keymap.svg"}`);
  if (format === "svg")
    await writeFile(
      resolve(workspace.root, output),
      renderSvg(workspace.parsed.document, workspace.definition, {
        layer,
        labels: workspace.labels,
      }),
      "utf8",
    );
  else if (format === "pdf")
    await writeFile(
      resolve(workspace.root, output),
      renderPdf(workspace.parsed.document, workspace.definition, {
        layer,
        labels: workspace.labels,
      }),
    );
  else throw new Error(`未対応の render format: ${format}`);
  console.log(output);
  return 0;
}

async function exportVil(workspace: LoadedWorkspace, args: ParsedArgs): Promise<number> {
  const output = String(args.out ?? "keymap.vil");
  await writeFile(resolve(workspace.root, output), serializeVil(workspace.parsed.document), "utf8");
  console.log(output);
  return 0;
}

async function importVil(root: string, input: string, args: ParsedArgs): Promise<number> {
  if (input === "") throw new Error("cornix import vil <file.vil> が必要");
  const definitionFile = String(args.definition ?? "");
  if (definitionFile === "")
    throw new Error(".vil importには --definition <definition.json> が必要");
  const document = parseVil(await readFile(resolve(root, input), "utf8"));
  // workspaceへはcanonical表現で置く。実機readが保存するbytesと同じ規則にして、
  // 同じdefinitionが整形の違いだけで別digestにならないようにする。
  const definitionText = canonicalDefinitionText(
    await readFile(resolve(root, definitionFile), "utf8"),
  );
  const digest = await definitionDigest(definitionText, webcrypto);
  const definitionRel = definitionPath(digest);
  const store = new NodeWorkspaceStore(root);
  await store.writeText(definitionRel, definitionText);
  await store.writeText(
    WORKSPACE_LAYOUT.keymap,
    serializeKeymapYaml(document, {
      keyboardUid: document.uid,
      keyboardName: parseDefinition(definitionText).name,
      definitionPath: definitionRel,
      definitionDigest: digest,
    }),
  );
  console.log(WORKSPACE_LAYOUT.keymap);
  return 0;
}

/**
 * MacBook 内蔵キーボードの生成・差分・適用。
 *
 * 適用は CLI だけが行う。Browser UI は `cornix/generated/` への書き出しまで（ADR 0022）。
 */
async function mac(root: string, args: ParsedArgs): Promise<number> {
  const sub = args._[0];
  const loaded = await loadMacKeymap(root, args);
  if (sub === "generate") return await macGenerate(root, loaded.document, args);
  if (sub === "diff") return await macDiff(loaded.document, args);
  if (sub === "apply") return await macApply(root, loaded.document, args);
  if (sub === "devices") return await macDevices(root, loaded, args);
  throw new Error("cornix mac generate|diff|apply|devices が必要");
}

/** `--layout` の明示指定。検出できない環境と、別配列の設定を触りたいときの入口。 */
function layoutArg(args: ParsedArgs): MacKeyboardLayout | undefined {
  const value = args.layout;
  if (value === undefined) return undefined;
  if (value !== "ansi" && value !== "jis") throw new Error(`--layout が未対応: ${String(value)}`);
  return value;
}

/**
 * 実行中の Mac の内蔵配列に対応する設定を読む。
 *
 * 設定は物理配列ごとに分かれている（ADR 0027）。どれを使うかは宣言ではなく
 * **実行しているマシン**が決める。`--layout` があればそちらを優先し、検出できなければ
 * 明示指定を要求する。黙って既定の配列へ倒すと、別配列のマシンへ間違った
 * `keyboard_type_v2` を書き込む。
 */
async function loadMacKeymap(
  root: string,
  args: ParsedArgs,
): Promise<{
  readonly layout: MacKeyboardLayout;
  readonly path: string;
  readonly document: MacKeymapDocument;
}> {
  const layout = layoutArg(args) ?? (await detectBuiltInLayout());
  if (layout === undefined) {
    throw new Error("内蔵キーボードの配列を検出できない。--layout ansi|jis を指定する");
  }
  const file = await readMacKeymapFor(new NodeWorkspaceStore(root), layout);
  if (file === undefined) {
    throw new Error(`${macKeymapPath(layout)} が見つからない（配列: ${layout}）`);
  }
  return { layout, path: file.path, document: file.document };
}

/** `--add` が受ける `<vendor_id>:<product_id>`。10 進の整数 2 つだけを受ける。 */
function parseDeviceArg(value: string): { readonly vendorId: number; readonly productId: number } {
  const match = /^([0-9]+):([0-9]+)$/.exec(value);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`--add は <vendor_id>:<product_id> の形（${value} が渡された）`);
  }
  return { vendorId: Number(match[1]), productId: Number(match[2]) };
}

/**
 * 適用先デバイスの一覧と登録。
 *
 * `--add` が無ければ観測されたキーボードを出して終わる。`mac apply` と同じで、
 * **見てから明示的に指定したときだけ**書き込む。内蔵キーボードは vendor / product id を
 * 申告しないため一覧に id が出ない。既定で対象なので登録も要らない。
 *
 * Cornix LP のような他のキーボードもここに並ぶ。登録すると Mac の keymap がその実機の
 * firmware keymap と二重に効くので、product を見て選ぶ必要がある（ADR 0022 の隔離）。
 */
async function macDevices(
  root: string,
  loaded: {
    readonly layout: MacKeyboardLayout;
    readonly path: string;
    readonly document: MacKeymapDocument;
  },
  args: ParsedArgs,
): Promise<number> {
  // `--karabiner` と同じく、既定の場所以外も指せるようにする。
  const observed = await readObservedKeyboards(
    args.devices === undefined ? undefined : String(args.devices),
  );
  const add = args.add === undefined ? undefined : parseDeviceArg(String(args.add));

  if (add !== undefined) {
    const next = addMacDevice(loaded.document, add);
    await new NodeWorkspaceStore(root).writeText(loaded.path, serializeMacKeymapYaml(next));
    console.log(
      JSON.stringify(
        { path: loaded.path, layout: loaded.layout, devices: next.devices, added: add },
        null,
        2,
      ),
    );
    return 0;
  }

  const registered = new Set(
    loaded.document.devices.flatMap((device) =>
      "builtIn" in device ? [] : [`${device.vendorId}:${device.productId}`],
    ),
  );
  const list = (observed ?? []).map((keyboard) => {
    const id =
      keyboard.vendorId === undefined || keyboard.productId === undefined
        ? undefined
        : `${keyboard.vendorId}:${keyboard.productId}`;
    return {
      product: keyboard.product ?? null,
      manufacturer: keyboard.manufacturer ?? null,
      builtIn: keyboard.builtIn,
      identifier: id ?? null,
      registered: keyboard.builtIn
        ? loaded.document.devices.some((device) => "builtIn" in device)
        : id !== undefined && registered.has(id),
      add: id === undefined ? null : `cornix mac devices --layout ${loaded.layout} --add ${id}`,
    };
  });
  console.log(
    JSON.stringify(
      {
        source:
          observed === undefined
            ? null
            : args.devices === undefined
              ? KARABINER_DEVICES_PATH
              : String(args.devices),
        layout: loaded.layout,
        path: loaded.path,
        devices: loaded.document.devices,
        observed: list,
      },
      null,
      2,
    ),
  );
  return 0;
}

/** complex_modifications の asset を書き出す。Karabiner が入っていれば lint も通す。 */
async function macGenerate(
  root: string,
  document: MacKeymapDocument,
  args: ParsedArgs,
): Promise<number> {
  const result = validateMacKeymap(document);
  const output = String(args.out ?? generatedPath("karabiner-complex-modifications.json"));
  if (result.summary.error > 0) {
    console.log(
      JSON.stringify({ summary: result.summary, diagnostics: result.diagnostics }, null, 2),
    );
    return 1;
  }
  const { asset } = generateKarabinerAsset(document);
  await new NodeWorkspaceStore(root).writeText(output, `${JSON.stringify(asset, null, 2)}\n`);
  const lint = await lintComplexModifications(join(root, output));
  console.log(
    JSON.stringify(
      { output, summary: result.summary, diagnostics: result.diagnostics, lint: lint ?? null },
      null,
      2,
    ),
  );
  return lint !== undefined && !lint.ok ? 1 : 0;
}

/** 所有 profile の構造 diff を出す。karabiner.json は読むだけ。 */
async function macDiff(document: MacKeymapDocument, args: ParsedArgs): Promise<number> {
  const path = karabinerPath(args);
  const { config } = await readKarabinerConfig(path);
  const plan = planMacApply(config, document);
  console.log(
    JSON.stringify(
      {
        karabiner: path,
        summary: plan.validation.summary,
        diagnostics: plan.diagnostics,
        fingerprint: plan.fingerprint,
        diff: plan.diff,
      },
      null,
      2,
    ),
  );
  return plan.validation.summary.error > 0 ? 1 : 0;
}

/**
 * 所有 profile を置き換える。
 *
 * `--confirm` が無いうちは diff と fingerprint を出して終わる。人間が中身を見てから
 * 同じ fingerprint を渡したときだけ書き込む（ADR 0022 の Apply フロー）。
 */
async function macApply(
  root: string,
  document: MacKeymapDocument,
  args: ParsedArgs,
): Promise<number> {
  const path = karabinerPath(args);
  const { config, text } = await readKarabinerConfig(path);
  const plan = planMacApply(config, document);
  if (plan.validation.summary.error > 0) {
    console.log(
      JSON.stringify({ summary: plan.validation.summary, diagnostics: plan.diagnostics }, null, 2),
    );
    throw new Error("error のある desired state は適用しない");
  }

  const confirmed = args.confirm === undefined ? undefined : String(args.confirm);
  if (confirmed === undefined) {
    console.log(
      JSON.stringify(
        {
          karabiner: path,
          diagnostics: plan.diagnostics,
          diff: plan.diff,
          fingerprint: plan.fingerprint,
          confirm: `cornix mac apply --confirm ${plan.fingerprint}`,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  if (confirmed !== plan.fingerprint) {
    throw new Error(`fingerprint が一致しない: expected=${plan.fingerprint} actual=${confirmed}`);
  }

  // backup は読んだテキストをそのまま置く。再 serialize すると Karabiner 独自の整形が落ちる。
  const backup = backupPath(new Date(), { prefix: "karabiner-", extension: "json" });
  await new NodeWorkspaceStore(root).writeText(backup, text);
  await writeFileAtomic(path, `${JSON.stringify(plan.next, null, 4)}\n`);

  const { config: observed } = await readKarabinerConfig(path);
  const verified = verifyMacApply(observed, plan.profile);
  console.log(
    JSON.stringify(
      { karabiner: path, backup, diagnostics: plan.diagnostics, verify: verified },
      null,
      2,
    ),
  );
  return verified.ok ? 0 : 1;
}

function karabinerPath(args: ParsedArgs): string {
  return args.karabiner === undefined
    ? defaultKarabinerConfigPath()
    : resolve(String(args.karabiner));
}

async function loadWorkspace(root: string): Promise<LoadedWorkspace> {
  const store = new NodeWorkspaceStore(root);
  const keymapText = required(
    await store.readText(WORKSPACE_LAYOUT.keymap),
    WORKSPACE_LAYOUT.keymap,
  );
  const parsed = parseKeymapYaml(keymapText);
  const definitionText = await readDefinitionBinding(
    store,
    parsed.binding.definitionPath,
    parsed.binding.definitionDigest,
    webcrypto,
  );
  const definition = parseDefinition(definitionText);
  const labelsText = await store.readText(WORKSPACE_LAYOUT.labels);
  return {
    root,
    store,
    keymapText,
    parsed,
    definitionText,
    definition,
    labels: labelsText === undefined ? EMPTY_LABELS : parseLabelsYaml(labelsText),
  };
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const result: ParsedArgs = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === undefined) continue;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        result[key] = next;
        index++;
      } else result[key] = true;
    } else result._.push(token);
  }
  return result;
}

type ParsedArgs = { _: string[]; [key: string]: string | boolean | string[] | undefined };
function required(value: string | undefined, name: string): string {
  if (value === undefined) throw new Error(`${name} が見つからない`);
  return value;
}
function mapReplacer(_key: string, value: unknown): unknown {
  return value instanceof Map ? Object.fromEntries(value) : value;
}
function printHelp(): void {
  console.log(
    `cornix validate|analyze|diff|render|export vil\n  --workspace <dir>\n  diff --against <file.vil>\n  render --format svg|pdf --out <file> --layer <n>\n  import vil <file.vil> --definition <definition.json>\n  mac generate --out <file>\n  mac diff --karabiner <karabiner.json>\n  mac apply --karabiner <karabiner.json> --confirm <fingerprint>\n  mac devices [--devices <observed.json>] [--add <vendor_id>:<product_id>]\n  mac ... --layout ansi|jis （既定は実行中のMacの内蔵配列を検出）`,
  );
}

if (import.meta.main) process.exitCode = await main();
