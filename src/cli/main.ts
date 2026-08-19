#!/usr/bin/env node
import { webcrypto } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { parseDefinition } from "../core/definition/parse.ts";
import { diffDocuments } from "../core/diff/diff.ts";
import { analyzeReachability } from "../core/validation/reachability.ts";
import { validateKeymap } from "../core/validation/validate.ts";
import { parseVil } from "../core/vil/parse.ts";
import { serializeVil } from "../core/vil/serialize.ts";
import { parseKeymapYaml } from "../core/keymap-yaml/parse.ts";
import { serializeKeymapYaml } from "../core/keymap-yaml/serialize.ts";
import { renderPdf, renderSvg } from "../render/keyboard.ts";
import { definitionPath, WORKSPACE_LAYOUT, sha256Hex } from "../workspace/layout.ts";
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
  const definitionBytes = await readFile(resolve(root, definitionFile));
  const digest = await sha256Hex(definitionBytes, webcrypto);
  const definitionRel = definitionPath(digest);
  const store = new NodeWorkspaceStore(root);
  await store.writeBytes(definitionRel, new Uint8Array(definitionBytes));
  await store.writeText(
    WORKSPACE_LAYOUT.keymap,
    serializeKeymapYaml(document, {
      keyboardUid: document.uid,
      keyboardName: parseDefinition(definitionBytes.toString("utf8")).name,
      definitionPath: definitionRel,
      definitionDigest: digest,
    }),
  );
  console.log(WORKSPACE_LAYOUT.keymap);
  return 0;
}

async function loadWorkspace(root: string): Promise<LoadedWorkspace> {
  const store = new NodeWorkspaceStore(root);
  const keymapText = required(
    await store.readText(WORKSPACE_LAYOUT.keymap),
    WORKSPACE_LAYOUT.keymap,
  );
  const parsed = parseKeymapYaml(keymapText);
  const definitionText = required(
    await store.readText(parsed.binding.definitionPath),
    parsed.binding.definitionPath,
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
    `cornix validate|analyze|diff|render|export vil\n  --workspace <dir>\n  diff --against <file.vil>\n  render --format svg|pdf --out <file> --layer <n>\n  import vil <file.vil> --definition <definition.json>`,
  );
}

if (import.meta.main) process.exitCode = await main();
