import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { diffDocuments, type DiffEntry } from "../core/diff/diff.ts";
import { setEncoderAssignment, setKeyAssignment } from "../core/model/edit.ts";
import { buildKeymapView } from "../core/model/keymap-view.ts";
import {
  abortApply,
  createApplyPlan,
  createValidatedApplyInput,
  confirmApply,
  recordVerifyResult,
  type ApplyState,
} from "../core/apply/plan.ts";
import type { WriteTarget } from "../core/apply/targets.ts";
import { evaluateApplyGate } from "../core/validation/gate.ts";
import { validateApplyKeymap, validateKeymap } from "../core/validation/validate.ts";
import { createDiagnostic, type Severity } from "../core/validation/types.ts";
import { parseDefinition } from "../core/definition/parse.ts";
import { canonicalDefinitionText } from "../core/definition/identity.ts";
import { parseKeymapYaml } from "../core/keymap-yaml/parse.ts";
import { serializeKeymapYaml } from "../core/keymap-yaml/serialize.ts";
import { parseVil } from "../core/vil/parse.ts";
import { serializeVil } from "../core/vil/serialize.ts";
import { DeviceIoError } from "../device/protocol.ts";
import { WebHidAdapter, type ReadDeviceResult, type WebHidConnection } from "../device/webhid.ts";
import {
  backupPath,
  definitionDigest,
  definitionPath,
  readDefinitionBinding,
  WORKSPACE_LAYOUT,
} from "../workspace/layout.ts";
import {
  planBindingMigration,
  planWorkspaceInit,
  writeWorkspacePlan,
  type BindingMigration,
} from "../workspace/bootstrap.ts";
import {
  EMPTY_LABELS,
  parseLabelsYaml,
  serializeLabelsYaml,
  type WorkspaceLabels,
} from "../workspace/labels.ts";
import { parseAcknowledgements, serializeAcknowledgements } from "../workspace/acknowledgements.ts";
import { CORNIX_LP_V112_SETTINGS } from "../workspace/settings.ts";
import { createSaveQueue, type SaveQueue } from "../workspace/save-queue.ts";
import type { WorkspaceConflictToken } from "../workspace/types.ts";
import { BrowserWorkspaceStore, pickWorkspace, restoreWorkspace } from "./browser-workspace.ts";
import type { Selection, Tab } from "./types.ts";
import type { PickTarget } from "./keycode-compose.ts";
import { AppHeader } from "./components/AppHeader.tsx";
import {
  applyTheme,
  browserSystemDark,
  browserThemeStorage,
  loadThemePreference,
  saveThemePreference,
  subscribeToSystemTheme,
  type ThemePreference,
} from "./theme.ts";
import { ApplyDialog } from "./components/ApplyDialog.tsx";
import { Behaviors } from "./components/Behaviors.tsx";
import { diagnosticSelection, DiagnosticsPanel } from "./components/DiagnosticsPanel.tsx";
import { KeymapTab } from "./components/KeymapTab.tsx";
import { KeyPanel } from "./components/KeyPanel.tsx";
import { Overview } from "./components/Overview.tsx";
import { References } from "./components/References.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { WorkspaceRecovery } from "./components/WorkspaceRecovery.tsx";
import "./styles.css";

const themeStorage = browserThemeStorage();
const initialThemePreference = loadThemePreference(themeStorage);
applyTheme(document.documentElement, initialThemePreference, browserSystemDark());

interface WorkspaceModel {
  readonly store: BrowserWorkspaceStore;
  readonly document: ReturnType<typeof parseKeymapYaml>["document"];
  readonly binding: ReturnType<typeof parseKeymapYaml>["binding"];
  readonly definition: ReturnType<typeof parseDefinition>;
  readonly labels: WorkspaceLabels;
  readonly acknowledged: readonly string[];
  readonly token: WorkspaceConflictToken | undefined;
  readonly labelsToken: WorkspaceConflictToken | undefined;
}

type WorkspaceProbe =
  | { readonly kind: "ready"; readonly model: WorkspaceModel }
  | { readonly kind: "missing-keymap" }
  | { readonly kind: "legacy-binding"; readonly migration: BindingMigration }
  | { readonly kind: "unresolved"; readonly reason: string };

type WorkspaceIssue =
  | { readonly kind: "missing-keymap"; readonly store: BrowserWorkspaceStore }
  | {
      readonly kind: "legacy-binding";
      readonly store: BrowserWorkspaceStore;
      readonly migration: BindingMigration;
    }
  | { readonly kind: "unresolved"; readonly store: BrowserWorkspaceStore; readonly reason: string };

function App(): React.JSX.Element {
  const [workspace, setWorkspace] = useState<WorkspaceModel | undefined>();
  const [issue, setIssue] = useState<WorkspaceIssue | undefined>();
  const [tab, setTab] = useState<Tab>("Keymap");
  const [layer, setLayer] = useState(0);
  const [selection, setSelection] = useState<Selection | undefined>();
  const [pickTarget, setPickTarget] = useState<PickTarget>("whole");
  const [device, setDevice] = useState<WebHidConnection | undefined>();
  const [deviceRead, setDeviceRead] = useState<ReadDeviceResult | undefined>();
  const [deviceDefinitionDigest, setDeviceDefinitionDigest] = useState<string | undefined>();
  const [status, setStatus] = useState("workspaceを選択してください");
  const [progress, setProgress] = useState<string | undefined>();
  const [lastReadRoundTrips, setLastReadRoundTrips] = useState(0);
  const [applyRoundTrips, setApplyRoundTrips] = useState(0);
  const [acknowledged, setAcknowledged] = useState<readonly string[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyState, setApplyState] = useState<ApplyState | undefined>();
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticFilter, setDiagnosticFilter] = useState<Severity | undefined>();
  const [themePreference, setThemePreference] = useState<ThemePreference>(initialThemePreference);
  const editorRef = useRef<HTMLInputElement>(null);
  const applyCancellation = useRef(false);
  const saveQueue = useRef<SaveQueue | undefined>(undefined);
  const labelsSaveQueue = useRef<SaveQueue | undefined>(undefined);

  useEffect(() => {
    const applyCurrentTheme = (systemDark: boolean): void => {
      applyTheme(document.documentElement, themePreference, systemDark);
    };
    applyCurrentTheme(browserSystemDark());
    return subscribeToSystemTheme(themePreference, (systemDark) => applyCurrentTheme(systemDark));
  }, [themePreference]);

  function changeThemePreference(preference: ThemePreference): void {
    setThemePreference(preference);
    saveThemePreference(themeStorage, preference);
  }

  function adoptWorkspace(model: WorkspaceModel): void {
    saveQueue.current = createSaveQueue({
      store: model.store,
      path: WORKSPACE_LAYOUT.keymap,
      token: model.token,
      onSaved: () => setStatus("keymap.yamlへ保存した"),
      onError: (error) => setStatus(message(error)),
    });
    labelsSaveQueue.current = createSaveQueue({
      store: model.store,
      path: WORKSPACE_LAYOUT.labels,
      token: model.labelsToken,
      onSaved: () => setStatus("cornix/labels.yamlへ保存した"),
      onError: (error) => setStatus(message(error)),
    });
    setWorkspace(model);
    setAcknowledged(model.acknowledged);
  }

  async function adoptStore(store: BrowserWorkspaceStore, okStatus: string): Promise<void> {
    const probe = await probeStore(store);
    if (probe.kind === "ready") {
      setIssue(undefined);
      adoptWorkspace(probe.model);
      setStatus(okStatus);
      return;
    }
    setWorkspace(undefined);
    saveQueue.current = undefined;
    labelsSaveQueue.current = undefined;
    setIssue({ ...probe, store });
    setStatus(issueSummary(probe));
  }

  useEffect(() => {
    void restoreWorkspace().then((store) =>
      store === undefined ? undefined : adoptStore(store, "前回のworkspaceへ復帰した"),
    );
  }, []);

  useEffect(() => {
    if (device === undefined) return;
    return device.onDisconnect(() => {
      invalidateDevice();
      setStatus("deviceが切断された。再接続してfull readからやり直してください");
    });
  }, [device]);

  const validation = useMemo(
    () =>
      workspace === undefined
        ? undefined
        : validateKeymap(workspace.document, workspace.definition),
    [workspace],
  );
  const view = useMemo(
    () =>
      workspace === undefined
        ? undefined
        : buildKeymapView(workspace.document, workspace.definition),
    [workspace],
  );
  const changed = useMemo(() => {
    if (workspace === undefined || deviceRead === undefined) return [];
    return diffDocuments(deviceRead.document, workspace.document, workspace.definition, {
      settings: { labels: CORNIX_LP_V112_SETTINGS },
    }).entries;
  }, [deviceRead, workspace]);
  const applyGate = useMemo(() => {
    if (workspace === undefined || deviceRead === undefined || changed.length === 0)
      return undefined;
    const targets = changed
      .map(toWriteTarget)
      .filter((target): target is WriteTarget => target !== undefined);
    const validationResult = validateApplyKeymap(
      workspace.document,
      workspace.definition,
      {
        keyboardUid: deviceRead.keyboardUid,
        capacities: deviceRead.capacities,
        supportedQsids: deviceRead.supportedQsids,
      },
      { path: workspace.binding.definitionPath, digest: workspace.binding.definitionDigest },
      targets,
    );
    const definitionMismatch = deviceDefinitionDigest !== workspace.binding.definitionDigest;
    const diagnostics = definitionMismatch
      ? Object.freeze([
          ...validationResult.evidence.diagnostics,
          createDiagnostic(
            "compatibility/definition-mismatch",
            "error",
            { kind: "document" },
            deviceDefinitionDigest === undefined
              ? "実機definitionのdigestを取得できていないためApplyできない"
              : `実機definitionがworkspace bindingと異なる（workspace=${workspace.binding.definitionDigest} device=${deviceDefinitionDigest}）`,
            {
              workspace: workspace.binding.definitionDigest,
              device: deviceDefinitionDigest ?? "missing",
            },
          ),
        ])
      : validationResult.evidence.diagnostics;
    if (targets.length === changed.length)
      return evaluateApplyGate({ ...validationResult.evidence, diagnostics }, acknowledged);
    const unsupported = createDiagnostic(
      "apply/unsupported-change",
      "error",
      { kind: "document" },
      `実機write未対応の差分が${changed.length - targets.length}件あるためApplyできない`,
      { count: changed.length - targets.length },
    );
    return evaluateApplyGate(
      { ...validationResult.evidence, diagnostics: Object.freeze([...diagnostics, unsupported]) },
      acknowledged,
    );
  }, [acknowledged, changed, deviceDefinitionDigest, deviceRead, workspace]);

  async function openWorkspace(): Promise<void> {
    try {
      await adoptStore(await pickWorkspace(), "workspaceを開いた");
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function reload(): Promise<void> {
    const store = workspace?.store ?? issue?.store;
    if (store === undefined) return;
    try {
      await adoptStore(store, "keymap.yamlを再読み込みした");
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function initializeWorkspace(store: BrowserWorkspaceStore): Promise<void> {
    try {
      const connection = device ?? (await acquireDevice());
      if (connection === undefined) return;
      const result = await connection.read((event) => {
        setLastReadRoundTrips(event.count);
        setProgress(`${event.label} (${event.count})`);
      });
      const plan = await planWorkspaceInit(
        result.document,
        result.definitionText,
        globalThis.crypto,
      );
      await writeWorkspacePlan(store, plan);
      setDeviceDefinitionDigest(plan.definitionDigest);
      setDeviceRead(result);
      await adoptStore(store, "実機のfull readからworkspaceを作成した");
    } catch (error) {
      setStatus(message(error));
    } finally {
      setProgress(undefined);
    }
  }

  async function migrateBinding(
    issued: Extract<WorkspaceIssue, { kind: "legacy-binding" }>,
  ): Promise<void> {
    try {
      await writeWorkspacePlan(issued.store, issued.migration);
      await adoptStore(issued.store, "definition bindingを新しいdigest規則へ移行した");
    } catch (error) {
      setStatus(message(error));
    }
  }

  function save(document = workspace?.document): void {
    if (workspace === undefined || document === undefined) return;
    setWorkspace({ ...workspace, document });
    try {
      saveQueue.current?.enqueue(serializeKeymapYaml(document, workspace.binding));
    } catch (error) {
      setStatus(message(error));
    }
  }

  function editLabel(keycode: string, value: string): void {
    if (workspace === undefined) return;
    const keycodes = new Map(workspace.labels.keycodes);
    if (value === "") keycodes.delete(keycode);
    else keycodes.set(keycode, value);
    const labels: WorkspaceLabels = { ...workspace.labels, keycodes };
    setWorkspace({ ...workspace, labels });
    try {
      labelsSaveQueue.current?.enqueue(serializeLabelsYaml(labels));
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function acquireDevice(): Promise<WebHidConnection | undefined> {
    const adapter = new WebHidAdapter();
    const next = (await adapter.reacquire()) ?? (await adapter.request());
    if (next === undefined) {
      setStatus("Vial deviceが選択されなかった");
      return undefined;
    }
    invalidateDevice();
    setDevice(next);
    return next;
  }

  async function connect(): Promise<void> {
    try {
      if ((await acquireDevice()) !== undefined) setStatus("接続済み");
    } catch (error) {
      setStatus(message(error));
    }
  }

  function invalidateDevice(): void {
    setDevice(undefined);
    setDeviceRead(undefined);
    setDeviceDefinitionDigest(undefined);
    setLastReadRoundTrips(0);
    setApplyRoundTrips(0);
    setApplyOpen(false);
    setApplyState(undefined);
  }

  async function disconnect(): Promise<void> {
    try {
      await device?.close();
      invalidateDevice();
      setStatus("切断した");
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function readDeviceInto(connection: WebHidConnection): Promise<boolean> {
    const result = await connection.read((event) => {
      setLastReadRoundTrips(event.count);
      setProgress(`${event.label} (${event.count})`);
    });
    const definitionText = canonicalDefinitionText(result.definitionText);
    const digest = await definitionDigest(definitionText, globalThis.crypto);
    let mismatch = false;
    if (workspace !== undefined) {
      await workspace.store.writeText(definitionPath(digest), definitionText);
      if (
        workspace.binding.definitionDigest !== digest ||
        workspace.document.uid !== result.keyboardUid
      )
        mismatch = true;
    }
    setDeviceDefinitionDigest(digest);
    setDeviceRead(result);
    return mismatch;
  }

  async function readDevice(): Promise<void> {
    if (device === undefined) return;
    setApplyOpen(false);
    setApplyState(undefined);
    try {
      const mismatch = await readDeviceInto(device);
      setStatus(
        mismatch
          ? "実機のfull readは完了したが、definitionまたはUIDがworkspaceと異なる。desired stateは上書きしていない"
          : "実機のfull readが完了した",
      );
    } catch (error) {
      setStatus(message(error));
    } finally {
      setProgress(undefined);
    }
  }

  function createConfirmationState(
    gate: NonNullable<typeof applyGate>,
    snapshot: ReadDeviceResult["snapshot"],
  ): ApplyState | undefined {
    if (!gate.allowed) return undefined;
    return {
      phase: "awaitingConfirmation",
      plan: createApplyPlan(createValidatedApplyInput(gate, snapshot)),
    };
  }

  async function openApply(): Promise<void> {
    if (
      workspace === undefined ||
      device === undefined ||
      deviceRead === undefined ||
      changed.length === 0
    )
      return;
    try {
      applyCancellation.current = false;
      const backupText = serializeVil(deviceRead.document);
      await workspace.store.writeText(backupPath(), backupText);
      await workspace.store.writeText(WORKSPACE_LAYOUT.latestBackup, backupText);
      const gate = applyGate;
      if (gate === undefined) return;
      setApplyOpen(true);
      setApplyState(gate.allowed ? createConfirmationState(gate, deviceRead.snapshot) : undefined);
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function apply(): Promise<void> {
    if (
      workspace === undefined ||
      device === undefined ||
      deviceRead === undefined ||
      applyState?.phase !== "awaitingConfirmation"
    )
      return;
    try {
      applyCancellation.current = false;
      setApplyRoundTrips(0);
      const gate = applyGate;
      if (gate === undefined) return;
      const plan = createApplyPlan(createValidatedApplyInput(gate, deviceRead.snapshot));
      let current = confirmApply(plan, applyState.plan.fingerprint);
      setApplyState(current);
      let completedRoundTrips = 0;
      for (const operation of plan.operations) {
        if (current.phase !== "writing") break;
        try {
          let operationRoundTrips = 0;
          const observed = await device.writeAndVerify(
            operation.target,
            operation.after,
            (event) => {
              operationRoundTrips = event.count;
              setApplyRoundTrips(completedRoundTrips + event.count);
              setProgress(`${event.label} (${event.count})`);
            },
          );
          current = recordVerifyResult(current, observed);
          completedRoundTrips += operationRoundTrips;
        } catch (error) {
          if (!(error instanceof DeviceIoError)) throw error;
          current = abortApply(
            current,
            error.reason === "timeout"
              ? "timeout"
              : error.reason === "disconnected"
                ? "disconnected"
                : "protocol-error",
          );
        }
        if (applyCancellation.current && current.phase === "writing")
          current = abortApply(current, "user-cancelled");
        setApplyState(current);
        if (current.phase === "aborted") break;
      }
      if (current.phase !== "completed") {
        setStatus("Applyを中断した。再接続後にfull readからやり直してください");
        return;
      }
      try {
        await readDeviceInto(device);
        setStatus("実機に反映した（電源断後の永続化は未確認）");
      } catch (error) {
        setStatus(
          `実機に反映したが、反映後のfull readに失敗した: ${message(error)}。再接続してfull readからやり直してください`,
        );
      }
    } catch (error) {
      setStatus(message(error));
    } finally {
      setProgress(undefined);
    }
  }

  function cancelApply(): void {
    applyCancellation.current = true;
    if (applyState?.phase === "writing") {
      setApplyState((current) =>
        current?.phase === "writing" ? abortApply(current, "user-cancelled") : current,
      );
      setStatus("Applyを中断した。進行中のI/Oの完了を待っています");
      return;
    }
    setApplyOpen(false);
  }

  async function restoreBackup(): Promise<void> {
    if (workspace === undefined) return;
    try {
      const text = await workspace.store.readText(WORKSPACE_LAYOUT.latestBackup);
      if (text === undefined) throw new Error("最新のbackupが見つからない");
      setWorkspace({ ...workspace, document: parseVil(text) });
      setStatus("最新backupをdesiredへ読み込んだ。内容を確認してApplyまたは保存してください");
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function acknowledge(ids: readonly string[]): Promise<boolean> {
    if (workspace === undefined) return false;
    try {
      const next = [...new Set(ids)].sort();
      await workspace.store.writeText(
        WORKSPACE_LAYOUT.acknowledgements,
        serializeAcknowledgements(next),
      );
      setAcknowledged(next);
      setWorkspace({ ...workspace, acknowledged: next });
      return true;
    } catch (error) {
      setStatus(message(error));
      return false;
    }
  }

  async function acknowledgeForApply(ids: readonly string[]): Promise<void> {
    if (!(await acknowledge(ids))) return;
    const gate = applyGate;
    if (gate === undefined || deviceRead === undefined) {
      setApplyState(undefined);
      return;
    }
    const nextGate = evaluateApplyGate(gate.evidence, [...new Set(ids)].sort());
    if (!nextGate.allowed) {
      setApplyState(undefined);
      return;
    }
    try {
      setApplyState(createConfirmationState(nextGate, deviceRead.snapshot));
    } catch (error) {
      setApplyState(undefined);
      setStatus(message(error));
    }
  }

  function openDiagnostics(filter: Severity): void {
    setDiagnosticFilter(filter);
    setDiagnosticsOpen(true);
  }

  function selectDiagnostic(subject: Parameters<typeof diagnosticSelection>[0]): void {
    const next = diagnosticSelection(subject);
    if (next.layer !== undefined) setLayer(next.layer);
    setSelection(next.selection);
    setDiagnosticsOpen(false);
  }

  function editKey(keycode: string): void {
    if (workspace === undefined || selection?.kind !== "key") return;
    try {
      save(
        setKeyAssignment(
          workspace.document,
          { layer, row: selection.row, col: selection.col },
          keycode,
        ),
      );
    } catch (error) {
      setStatus(message(error));
    }
  }

  function editEncoder(keycode: string): void {
    if (workspace === undefined || selection?.kind !== "encoder") return;
    try {
      save(
        setEncoderAssignment(
          workspace.document,
          { layer, index: selection.index, direction: selection.direction === "ccw" ? 0 : 1 },
          keycode,
        ),
      );
    } catch (error) {
      setStatus(message(error));
    }
  }

  function editTapDance(index: number, field: number, value: string): void {
    if (workspace === undefined) return;
    const current = workspace.document.tapDance[index];
    if (current === undefined || field < 0 || field > 4) return;
    const next = [...current] as [string, string, string, string, number];
    if (field === 4) {
      const timeout = Number(value);
      if (!Number.isInteger(timeout) || timeout < 0 || timeout > 0xffff) {
        setStatus("Tap Dance timeoutは0〜65535の整数が必要");
        return;
      }
      next[4] = timeout;
    } else next[field] = value;
    save({
      ...workspace.document,
      tapDance: workspace.document.tapDance.map((entry, entryIndex) =>
        entryIndex === index ? next : entry,
      ),
    });
  }

  function editCombo(index: number, field: number, value: string): void {
    if (workspace === undefined) return;
    const current = workspace.document.combo[index];
    if (current === undefined || field < 0 || field > 4) return;
    const next = [...current] as [string, string, string, string, string];
    next[field] = value;
    save({
      ...workspace.document,
      combo: workspace.document.combo.map((entry, entryIndex) =>
        entryIndex === index ? next : entry,
      ),
    });
  }

  function editSetting(qsid: number, value: string): void {
    if (workspace === undefined) return;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) {
      setStatus("settingは0〜65535の整数が必要");
      return;
    }
    save({
      ...workspace.document,
      settings: { ...workspace.document.settings, [String(qsid)]: parsed },
    });
  }

  return (
    <div className="app-shell">
      <AppHeader
        workspaceName={workspace?.store.directory.name}
        device={device}
        onOpenWorkspace={() => void openWorkspace()}
        onReload={() => void reload()}
        onRestoreBackup={() => void restoreBackup()}
        onConnect={() => void connect()}
        onDisconnect={() => void disconnect()}
        onRead={() => void readDevice()}
        themePreference={themePreference}
        onThemePreferenceChange={changeThemePreference}
        canReload={workspace !== undefined}
      />
      <nav className="tabs" aria-label="main tabs">
        {(["Keymap", "Overview", "Behaviors", "References"] as const).map((name) => (
          <button className={tab === name ? "active" : ""} onClick={() => setTab(name)} key={name}>
            {name}
          </button>
        ))}
      </nav>
      {workspace === undefined ? (
        <main className="empty-state">
          <h1>workspaceから始める</h1>
          <p>keymap.yamlを含むディレクトリを開くか、実機readで初期状態を取得します。</p>
          <button className="primary" onClick={() => void openWorkspace()}>
            Workspaceを開く
          </button>
          {issue === undefined ? null : (
            <WorkspaceRecovery
              issue={issue}
              busy={progress !== undefined}
              onInitialize={() => void initializeWorkspace(issue.store)}
              onMigrate={() =>
                issue.kind === "legacy-binding" ? void migrateBinding(issue) : undefined
              }
              onRetry={() => void reload()}
            />
          )}
        </main>
      ) : (
        <main className="main-content">
          {tab === "Keymap" && view !== undefined ? (
            <KeymapTab
              view={view}
              definition={workspace.definition}
              layer={layer}
              setLayer={setLayer}
              selection={selection}
              setSelection={setSelection}
              labels={workspace.labels}
              pickTarget={pickTarget}
              onPickTarget={setPickTarget}
              onEditKey={editKey}
              onEditEncoder={editEncoder}
              diagnosticSubjects={
                validation === undefined
                  ? []
                  : validation.diagnostics.map((diagnostic) => diagnostic.subject)
              }
              onFocusEditor={() => {
                editorRef.current?.focus();
                editorRef.current?.select();
              }}
              panel={
                diagnosticsOpen ? (
                  <DiagnosticsPanel
                    diagnostics={validation?.diagnostics ?? []}
                    filter={diagnosticFilter}
                    onClose={() => setDiagnosticsOpen(false)}
                    onSelect={selectDiagnostic}
                  />
                ) : (
                  <KeyPanel
                    view={view}
                    definition={workspace.definition}
                    layer={layer}
                    selection={selection}
                    labels={workspace.labels}
                    editorRef={editorRef}
                    pickTarget={pickTarget}
                    onPickTarget={setPickTarget}
                    onEditKey={editKey}
                    onEditEncoder={editEncoder}
                    onEditLabel={editLabel}
                  />
                )
              }
            />
          ) : null}
          {tab === "Overview" ? (
            <Overview
              document={workspace.document}
              definition={workspace.definition}
              labels={workspace.labels}
              view={view!}
            />
          ) : null}
          {tab === "Behaviors" ? (
            <Behaviors
              document={workspace.document}
              labels={workspace.labels}
              onTapDance={editTapDance}
              onCombo={editCombo}
              onSetting={editSetting}
            />
          ) : null}
          {tab === "References" ? (
            <References
              diagnostics={validation?.diagnostics ?? []}
              document={workspace.document}
              labels={workspace.labels}
            />
          ) : null}
        </main>
      )}
      <StatusBar
        summary={validation?.summary ?? { error: 0, warning: 0, information: 0 }}
        changedCount={changed.length}
        status={progress ?? status}
        canApply={changed.length > 0 && deviceRead !== undefined}
        onApply={() => void openApply()}
        onSeverity={openDiagnostics}
      />
      {applyOpen ? (
        <ApplyDialog
          state={applyState}
          changed={changed}
          gate={applyGate}
          labels={workspace?.labels ?? EMPTY_LABELS}
          acknowledged={acknowledged}
          backupRoundTrips={lastReadRoundTrips}
          roundTrips={applyRoundTrips}
          roundTripTotal={
            applyState?.phase === "writing"
              ? applyState.plan.operations.length * 2
              : applyState?.phase === "completed"
                ? applyState.verified.length * 2
                : 0
          }
          onAcknowledge={(ids) => void acknowledgeForApply(ids)}
          onCancel={cancelApply}
          onApply={() => void apply()}
        />
      ) : null}
    </div>
  );
}

async function probeStore(store: BrowserWorkspaceStore): Promise<WorkspaceProbe> {
  let parsed: ReturnType<typeof parseKeymapYaml>;
  try {
    const keymapText = await store.readText(WORKSPACE_LAYOUT.keymap);
    if (keymapText === undefined) return { kind: "missing-keymap" };
    parsed = parseKeymapYaml(keymapText);
  } catch (error) {
    return { kind: "unresolved", reason: message(error) };
  }
  let definitionText: string;
  try {
    definitionText = await readDefinitionBinding(
      store,
      parsed.binding.definitionPath,
      parsed.binding.definitionDigest,
      globalThis.crypto,
    );
  } catch (error) {
    const migration = await planBindingMigration(
      store,
      parsed.document,
      parsed.binding,
      globalThis.crypto,
    ).catch(() => undefined);
    if (migration !== undefined) return { kind: "legacy-binding", migration };
    return { kind: "unresolved", reason: message(error) };
  }
  try {
    const labelsText = await store.readText(WORKSPACE_LAYOUT.labels);
    return {
      kind: "ready",
      model: {
        store,
        document: parsed.document,
        binding: parsed.binding,
        definition: parseDefinition(definitionText),
        labels: labelsText === undefined ? EMPTY_LABELS : parseLabelsYaml(labelsText),
        acknowledged: parseAcknowledgements(
          await store.readText(WORKSPACE_LAYOUT.acknowledgements),
        ),
        token: (await store.stat(WORKSPACE_LAYOUT.keymap)) ?? undefined,
        labelsToken: (await store.stat(WORKSPACE_LAYOUT.labels)) ?? undefined,
      },
    };
  } catch (error) {
    return { kind: "unresolved", reason: message(error) };
  }
}

function issueSummary(probe: Exclude<WorkspaceProbe, { kind: "ready" }>): string {
  switch (probe.kind) {
    case "missing-keymap":
      return "このdirectoryにkeymap.yamlが無い";
    case "legacy-binding":
      return "definition bindingが古いdigest規則のままになっている";
    case "unresolved":
      return "workspaceを読み込めなかった";
  }
}

function toWriteTarget(entry: DiffEntry): WriteTarget | undefined {
  const subject = entry.subject;
  switch (subject.kind) {
    case "key":
      return subject.layer < 0
        ? undefined
        : { kind: "key", layer: subject.layer, row: subject.row, col: subject.col };
    case "encoder":
      return {
        kind: "encoder",
        layer: subject.layer,
        index: subject.index,
        direction: subject.direction === "ccw" ? 0 : 1,
      };
    case "tapDance":
      return { kind: "tapDance", index: subject.index };
    case "combo":
      return { kind: "combo", index: subject.index };
    case "setting":
      return { kind: "setting", qsid: subject.qsid };
    default:
      return undefined;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
