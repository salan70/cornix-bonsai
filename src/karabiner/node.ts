/**
 * `karabiner.json` を読み書きする Node adapter。
 *
 * `~/.config/karabiner/karabiner.json` は **workspace の外**にある。`NodeWorkspaceStore` は
 * path を `root` からの相対で解決するため使えない。`node:fs/promises` を直接叩く
 * （`cli/main.ts` の `render` / `export vil` に前例がある）。
 *
 * `src/core/mac-keymap/` は filesystem に触らない。Karabiner 側の境界はこの module で、
 * OS 自身への問い合わせは `src/mac/keyboard-type.ts` が持つ。
 *
 */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { KarabinerConfig } from "../core/mac-keymap/karabiner.ts";

const execFileAsync = promisify(execFile);

/** Karabiner-Elements が入れる CLI。lint はここからしか呼べない。 */
export const KARABINER_CLI =
  "/Library/Application Support/org.pqrs/Karabiner-Elements/bin/karabiner_cli";

/**
 * Karabiner が観測しているデバイスの一覧。root 所有だが読み取りは誰でもできる。
 *
 * ANSI / JIS を示す field は無い（ADR 0024）。ここから取れるのは**どのデバイスが居るか**
 * だけで、`devices` へ書く identifiers の出どころとして使う（ADR 0026）。
 */
export const KARABINER_DEVICES_PATH =
  "/Library/Application Support/org.pqrs/tmp/karabiner_grabber_devices.json";

/** 観測されたキーボード 1 台。`devices` へ書ける情報だけを取り出す。 */
export interface ObservedKeyboard {
  readonly product: string | undefined;
  readonly manufacturer: string | undefined;
  /** 内蔵キーボードは vendor / product id を申告せず、これでしか指せない。 */
  readonly builtIn: boolean;
  readonly vendorId: number | undefined;
  readonly productId: number | undefined;
}

/**
 * 観測されたキーボードを読む。ファイルが無ければ `undefined`。
 *
 * pointing device と、Karabiner 自身の仮想キーボード（`is_virtual_device`）は外す。
 * 仮想キーボードは Karabiner の出力側で、ここへ登録すると自分の出力を食う。
 *
 * @doc docs/specs/mac-keymap.md#readobservedkeyboards
 */
export async function readObservedKeyboards(
  path: string = KARABINER_DEVICES_PATH,
): Promise<readonly ObservedKeyboard[] | undefined> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} を JSON として読めない: ${message(error)}`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${path} が配列ではない`);

  const keyboards: ObservedKeyboard[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const identifiers = record.device_identifiers;
    if (typeof identifiers !== "object" || identifiers === null) continue;
    const ids = identifiers as Record<string, unknown>;
    if (ids.is_keyboard !== true) continue;
    if (ids.is_virtual_device === true) continue;
    keyboards.push({
      product: typeof record.product === "string" ? record.product : undefined,
      manufacturer: typeof record.manufacturer === "string" ? record.manufacturer : undefined,
      builtIn: record.is_built_in_keyboard === true,
      vendorId: typeof ids.vendor_id === "number" ? ids.vendor_id : undefined,
      productId: typeof ids.product_id === "number" ? ids.product_id : undefined,
    });
  }
  return keyboards;
}

/** Karabiner が読む設定ファイルの既定の場所。 */
export function defaultKarabinerConfigPath(): string {
  return join(homedir(), ".config", "karabiner", "karabiner.json");
}

/**
 * `karabiner.json` を読む。テキストも一緒に返す。
 *
 * backup は**読んだテキストをそのまま**書き戻す。再 serialize すると Karabiner 独自の
 * 整形が落ち、復元しても元のファイルと同じにならない（ADR 0022）。
 */
export async function readKarabinerConfig(
  path: string,
): Promise<{ readonly config: KarabinerConfig; readonly text: string }> {
  const text = await readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} を JSON として読めない: ${message(error)}`);
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as KarabinerConfig).profiles)
  ) {
    throw new Error(`${path} に profiles が無い`);
  }
  return { config: parsed as KarabinerConfig, text };
}

/**
 * temp へ書いてから rename で置き換える。
 *
 * Karabiner は設定ファイルの親ディレクトリを watch して自動 reload するため、
 * 途中まで書けたファイルを見せない。rename は同じ filesystem でなければ atomic に
 * ならないので、temp は**置き換え先と同じディレクトリ**に作る。
 */
export async function writeFileAtomic(path: string, text: string): Promise<void> {
  const directory = await mkdtemp(join(dirname(path), ".cornix-"));
  const temporary = join(directory, "karabiner.json");
  try {
    await writeFile(temporary, text, "utf8");
    await rename(temporary, path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * complex_modifications の asset を `karabiner_cli` で lint する。
 *
 * `karabiner_cli` は **エラーがあっても exit code 0 を返す**。判定は出力が `: ok` で
 * 終わるかどうかで行う。Karabiner が入っていない環境では `undefined` を返す。
 * CI の macOS runner には入っていない（ADR 0022）。
 */
export async function lintComplexModifications(
  path: string,
): Promise<{ readonly ok: boolean; readonly output: string } | undefined> {
  try {
    const { stdout, stderr } = await execFileAsync(KARABINER_CLI, [
      "--lint-complex-modifications",
      path,
    ]);
    const output = `${stdout}${stderr}`.trim();
    return { ok: output.endsWith(": ok"), output };
  } catch (error) {
    if (isMissingBinary(error)) return undefined;
    const output = errorOutput(error);
    return { ok: false, output };
  }
}

function isMissingBinary(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: string }).code === "ENOENT"
  );
}

function errorOutput(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const { stdout, stderr } = error as { stdout?: string; stderr?: string };
  const output = `${stdout ?? ""}${stderr ?? ""}`.trim();
  return output === "" ? message(error) : output;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
