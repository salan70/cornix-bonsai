/**
 * Browser workspace の読み込み。Cornix と Mac を独立に畳み、どちらか一方の不調で
 * 他方の編集を止めない。
 */

import { parseDefinition } from "../core/definition/parse.ts";
import { parseKeymapYaml } from "../core/keymap-yaml/parse.ts";
import { parseAcknowledgements } from "../workspace/acknowledgements.ts";
import { planBindingMigration, type BindingMigration } from "../workspace/bootstrap.ts";
import { readDefinitionBinding, WORKSPACE_LAYOUT } from "../workspace/layout.ts";
import { EMPTY_LABELS, parseLabelsYaml, type WorkspaceLabels } from "../workspace/labels.ts";
import type { WorkspaceConflictToken, WorkspaceFileStore } from "../workspace/types.ts";
import { probeMacKeymaps, type MacWorkspaceByLayout } from "./mac-workspace.ts";
import type { EditTarget } from "./types.ts";

/** Browser の具象 store と test fake が共有する面。 */
export type UiWorkspaceStore = WorkspaceFileStore & {
  readonly directory: { readonly name: string };
};

export type CornixWorkspaceState =
  | {
      readonly kind: "ready";
      readonly document: ReturnType<typeof parseKeymapYaml>["document"];
      readonly binding: ReturnType<typeof parseKeymapYaml>["binding"];
      readonly definition: ReturnType<typeof parseDefinition>;
      readonly token: WorkspaceConflictToken | undefined;
    }
  | { readonly kind: "missing" }
  | { readonly kind: "error"; readonly reason: string }
  | { readonly kind: "legacy-binding"; readonly migration: BindingMigration };

export interface WorkspaceModel {
  readonly store: UiWorkspaceStore;
  readonly cornix: CornixWorkspaceState;
  readonly labels: WorkspaceLabels;
  readonly labelsToken: WorkspaceConflictToken | undefined;
  readonly acknowledged: readonly string[];
  readonly mac: MacWorkspaceByLayout;
}

export type WorkspaceProbe =
  | { readonly kind: "ready"; readonly model: WorkspaceModel }
  | { readonly kind: "unresolved"; readonly reason: string };

export type WorkspaceIssue =
  | { readonly kind: "missing-keymap"; readonly store: UiWorkspaceStore }
  | {
      readonly kind: "legacy-binding";
      readonly store: UiWorkspaceStore;
      readonly migration: BindingMigration;
    }
  | { readonly kind: "unresolved"; readonly store: UiWorkspaceStore; readonly reason: string };

/**
 * directory を開けた時点で workspace として成立させる。
 *
 * `keymap.yaml` の欠落や parse 失敗は `cornix` に閉じ、Mac の読み込みを止めない。
 *
 * @doc docs/specs/ui.md#workspace-recovery
 */
export async function probeStore(store: UiWorkspaceStore): Promise<WorkspaceProbe> {
  try {
    const labelsText = await store.readText(WORKSPACE_LAYOUT.labels);
    return {
      kind: "ready",
      model: {
        store,
        cornix: await probeCornix(store),
        labels: labelsText === undefined ? EMPTY_LABELS : parseLabelsYaml(labelsText),
        labelsToken: (await store.stat(WORKSPACE_LAYOUT.labels)) ?? undefined,
        acknowledged: parseAcknowledgements(
          await store.readText(WORKSPACE_LAYOUT.acknowledgements),
        ),
        mac: await probeMacKeymaps(store),
      },
    };
  } catch (error) {
    return { kind: "unresolved", reason: message(error) };
  }
}

export async function probeCornix(store: UiWorkspaceStore): Promise<CornixWorkspaceState> {
  let parsed: ReturnType<typeof parseKeymapYaml>;
  try {
    const keymapText = await store.readText(WORKSPACE_LAYOUT.keymap);
    if (keymapText === undefined) return { kind: "missing" };
    parsed = parseKeymapYaml(keymapText);
  } catch (error) {
    return { kind: "error", reason: message(error) };
  }
  try {
    const definitionText = await readDefinitionBinding(
      store,
      parsed.binding.definitionPath,
      parsed.binding.definitionDigest,
      globalThis.crypto,
    );
    return {
      kind: "ready",
      document: parsed.document,
      binding: parsed.binding,
      definition: parseDefinition(definitionText),
      token: (await store.stat(WORKSPACE_LAYOUT.keymap)) ?? undefined,
    };
  } catch (error) {
    const migration = await planBindingMigration(
      store,
      parsed.document,
      parsed.binding,
      globalThis.crypto,
    ).catch(() => undefined);
    if (migration !== undefined) return { kind: "legacy-binding", migration };
    return { kind: "error", reason: message(error) };
  }
}

export function cornixIssue(model: WorkspaceModel): WorkspaceIssue | undefined {
  switch (model.cornix.kind) {
    case "ready":
      return undefined;
    case "missing":
      return { kind: "missing-keymap", store: model.store };
    case "legacy-binding":
      return { kind: "legacy-binding", store: model.store, migration: model.cornix.migration };
    case "error":
      return { kind: "unresolved", store: model.store, reason: model.cornix.reason };
  }
}

/** Cornix が使えないときは、ある Mac 設定を先に開く。どちらも無ければ Cornix の復旧へ。 */
export function defaultEditTarget(model: WorkspaceModel): EditTarget {
  if (model.cornix.kind === "ready") return { kind: "cornix" };
  if (model.mac.ansi.kind === "ready") return { kind: "mac", layout: "ansi" };
  if (model.mac.jis.kind === "ready") return { kind: "mac", layout: "jis" };
  return { kind: "cornix" };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
