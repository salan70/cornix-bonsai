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
import { parseMacKeymapYaml } from "../core/mac-keymap/parse.ts";
import { validateMacKeymap } from "../core/mac-keymap/validate.ts";
import type { MacKeymapDocument } from "../core/mac-keymap/types.ts";
import {
  defaultKarabinerConfigPath,
  lintComplexModifications,
  readKarabinerConfig,
  writeFileAtomic,
} from "../karabiner/node.ts";
import { renderPdf, renderSvg } from "../render/keyboard.ts";
import {
  backupPath,
  definitionDigest,
  definitionPath,
  generatedPath,
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
  const document = await loadMacKeymap(root);
  if (sub === "generate") return await macGenerate(root, document, args);
  if (sub === "diff") return await macDiff(document, args);
  if (sub === "apply") return await macApply(root, document, args);
  throw new Error("cornix mac generate|diff|apply が必要");
}

async function loadMacKeymap(root: string): Promise<MacKeymapDocument> {
  const store = new NodeWorkspaceStore(root);
  const text = required(
    await store.readText(WORKSPACE_LAYOUT.macKeymap),
    WORKSPACE_LAYOUT.macKeymap,
  );
  return parseMacKeymapYaml(text);
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
    `cornix validate|analyze|diff|render|export vil\n  --workspace <dir>\n  diff --against <file.vil>\n  render --format svg|pdf --out <file> --layer <n>\n  import vil <file.vil> --definition <definition.json>\n  mac generate --out <file>\n  mac diff --karabiner <karabiner.json>\n  mac apply --karabiner <karabiner.json> --confirm <fingerprint>`,
  );
}

if (import.meta.main) process.exitCode = await main();
