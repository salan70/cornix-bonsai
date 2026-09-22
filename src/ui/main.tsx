import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { diffDocuments, type DiffEntry } from "../core/diff/diff.ts";
import { setEncoderAssignment, setKeyAssignment } from "../core/model/edit.ts";
import { addMacLayer, clearMacAssignment, setMacAssignment } from "../core/mac-keymap/edit.ts";
import { serializeMacKeymapYaml } from "../core/mac-keymap/serialize.ts";
import type { MacKeyboardLayout, MacKeymapDocument } from "../core/mac-keymap/types.ts";
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
import { validateMacKeymap } from "../core/mac-keymap/validate.ts";
import { createDiagnostic, type Severity } from "../core/validation/types.ts";
import { canonicalDefinitionText } from "../core/definition/identity.ts";
import { serializeKeymapYaml } from "../core/keymap-yaml/serialize.ts";
import { parseVil } from "../core/vil/parse.ts";
import { serializeVil } from "../core/vil/serialize.ts";
import { DeviceIoError } from "../device/protocol.ts";
import { WebHidAdapter, type ReadDeviceResult, type WebHidConnection } from "../device/webhid.ts";
import {
  backupPath,
  definitionDigest,
  definitionPath,
  generatedPath,
  macKeymapPath,
  WORKSPACE_LAYOUT,
} from "../workspace/layout.ts";
import { planWorkspaceInit, writeWorkspacePlan } from "../workspace/bootstrap.ts";
import {
  EMPTY_LABELS,
  serializeLabelsYaml,
  updateLayerLabel,
  type WorkspaceLabels,
} from "../workspace/labels.ts";
import { serializeAcknowledgements } from "../workspace/acknowledgements.ts";
import { CORNIX_LP_V112_SETTINGS } from "../workspace/settings.ts";
import { createSaveQueue, type SaveQueue } from "../workspace/save-queue.ts";
import { pickWorkspace, restoreWorkspace } from "./browser-workspace.ts";
import { initialMacKeymapYaml } from "./mac-workspace.ts";
import { pickVilText } from "./browser-files.ts";
import {
  parseBrowserVil,
  renderBrowserPdf,
  renderBrowserSvg,
  serializeBrowserVil,
  generateBrowserKarabinerFromDocument,
} from "./browser-export.ts";
import type { CornixTab, EditTarget, MacTab, Selection } from "./types.ts";
import {
  cornixIssue,
  defaultEditTarget,
  probeStore,
  type UiWorkspaceStore,
  type WorkspaceIssue,
  type WorkspaceModel,
  type WorkspaceProbe,
} from "./workspace-probe.ts";
import type { PickTarget } from "./keycode-compose.ts";
import { AppHeader } from "./components/AppHeader.tsx";
import { EditTargetSelect } from "./components/EditTargetSelect.tsx";
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
import { MacKeymapTab } from "./components/MacKeymapTab.tsx";
import { MacKeyPanel } from "./components/MacKeyPanel.tsx";
import { MacReferences } from "./components/MacReferences.tsx";
import { KeyPanel } from "./components/KeyPanel.tsx";
import { Overview } from "./components/Overview.tsx";
import { References } from "./components/References.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { WorkspaceRecovery } from "./components/WorkspaceRecovery.tsx";
import type { SaveState } from "./components/ui/index.ts";
import "./styles/index.css";

const themeStorage = browserThemeStorage();
const initialThemePreference = loadThemePreference(themeStorage);
const USER_GUIDE_URL =
  "https://github.com/salan70/cornix-bonsai/blob/main/docs/user-guide/README.md";
applyTheme(document.documentElement, initialThemePreference, browserSystemDark());

function App(): React.JSX.Element {
  const [workspace, setWorkspace] = useState<WorkspaceModel | undefined>();
  const [issue, setIssue] = useState<WorkspaceIssue | undefined>();
  const [editTarget, setEditTarget] = useState<EditTarget>({ kind: "cornix" });
  const [cornixTab, setCornixTab] = useState<CornixTab>("Keymap");
  const [macTab, setMacTab] = useState<MacTab>("Keymap");
  const [layer, setLayer] = useState(0);
  const [macLayers, setMacLayers] = useState({ ansi: 0, jis: 0 });
  const [cornixSelection, setCornixSelection] = useState<Selection | undefined>();
  const [macSelections, setMacSelections] = useState<{
    readonly ansi?: Selection;
    readonly jis?: Selection;
  }>({});
  const [cornixPickTarget, setCornixPickTarget] = useState<PickTarget>("whole");
  const [macPickTargets, setMacPickTargets] = useState({
    ansi: "whole" as PickTarget,
    jis: "whole" as PickTarget,
  });
  const [device, setDevice] = useState<WebHidConnection | undefined>();
  const [deviceRead, setDeviceRead] = useState<ReadDeviceResult | undefined>();
  const [deviceDefinitionDigest, setDeviceDefinitionDigest] = useState<string | undefined>();
  const [status, setStatus] = useState("workspaceを選択してください");
  const [cornixSaveState, setCornixSaveState] = useState<SaveState>({ kind: "idle" });
  const [macSaveStates, setMacSaveStates] = useState<Partial<Record<MacKeyboardLayout, SaveState>>>(
    {},
  );
  const [progress, setProgress] = useState<string | undefined>();
  const [lastReadRoundTrips, setLastReadRoundTrips] = useState(0);
  const [applyRoundTrips, setApplyRoundTrips] = useState(0);
  const [acknowledged, setAcknowledged] = useState<readonly string[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyState, setApplyState] = useState<ApplyState | undefined>();
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticFilter, setDiagnosticFilter] = useState<Severity | undefined>();
  const [themePreference, setThemePreference] = useState<ThemePreference>(initialThemePreference);
  const cornixEditorRef = useRef<HTMLInputElement>(null);
  const macEditorRef = useRef<HTMLInputElement>(null);
  const applyCancellation = useRef(false);
  const saveQueue = useRef<SaveQueue | undefined>(undefined);
  const labelsSaveQueue = useRef<SaveQueue | undefined>(undefined);
  const macSaveQueues = useRef<Partial<Record<MacKeyboardLayout, SaveQueue>>>({});

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

  function adoptWorkspace(model: WorkspaceModel, preserveTarget = false): void {
    saveQueue.current =
      model.cornix.kind === "ready"
        ? createSaveQueue({
            store: model.store,
            path: WORKSPACE_LAYOUT.keymap,
            token: model.cornix.token,
            onSaved: () => {
              setCornixSaveState({ kind: "saved" });
              setStatus("keymap.yamlへ保存した");
            },
            onError: (error) => {
              setCornixSaveState({ kind: "error", message: message(error) });
              setStatus(message(error));
            },
          })
        : undefined;
    labelsSaveQueue.current = createSaveQueue({
      store: model.store,
      path: WORKSPACE_LAYOUT.labels,
      token: model.labelsToken,
      onSaved: () => setStatus("cornix/labels.yamlへ保存した"),
      onError: (error) => setStatus(message(error)),
    });
    setCornixSaveState({ kind: "idle" });
    setMacSaveStates({});
    macSaveQueues.current = {};
    for (const layout of ["ansi", "jis"] as const) {
      const state = model.mac[layout];
      if (state.kind !== "ready") continue;
      macSaveQueues.current[layout] = createSaveQueue({
        store: model.store,
        path: state.path,
        token: state.token,
        onSaved: () => {
          setMacSaveStates((current) => ({ ...current, [layout]: { kind: "saved" } }));
          setStatus(`${state.path}へ保存した`);
        },
        onError: (error) => {
          setMacSaveStates((current) => ({
            ...current,
            [layout]: { kind: "error", message: message(error) },
          }));
          setStatus(message(error));
        },
      });
    }
    setWorkspace(model);
    setAcknowledged(model.acknowledged);
    if (!preserveTarget) setEditTarget(defaultEditTarget(model));
  }

  async function adoptStore(
    store: UiWorkspaceStore,
    okStatus: string,
    preserveTarget = false,
  ): Promise<void> {
    const probe = await probeStore(store);
    if (probe.kind === "ready") {
      setIssue(undefined);
      adoptWorkspace(probe.model, preserveTarget);
      setStatus(okStatus);
      return;
    }
    setWorkspace(undefined);
    saveQueue.current = undefined;
    labelsSaveQueue.current = undefined;
    macSaveQueues.current = {};
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

  const cornix = workspace?.cornix.kind === "ready" ? workspace.cornix : undefined;
  const macLayout = editTarget.kind === "mac" ? editTarget.layout : undefined;
  const macState =
    macLayout === undefined || workspace === undefined ? undefined : workspace.mac[macLayout];
  const macLayer = macLayout === undefined ? 0 : macLayers[macLayout];
  const macSelection = macLayout === undefined ? undefined : macSelections[macLayout];
  const macPickTarget = macLayout === undefined ? "whole" : macPickTargets[macLayout];
  const validation = useMemo(
    () => (cornix === undefined ? undefined : validateKeymap(cornix.document, cornix.definition)),
    [cornix],
  );
  const view = useMemo(
    () => (cornix === undefined ? undefined : buildKeymapView(cornix.document, cornix.definition)),
    [cornix],
  );
  const macValidation = useMemo(
    () => (macState?.kind === "ready" ? validateMacKeymap(macState.document) : undefined),
    [macState],
  );
  // Vialのlayer名をMacのlayer番号空間へ誤適用しないため、layer名だけ剥がす。
  const macLabels = useMemo<WorkspaceLabels>(
    () => ({ layers: new Map(), keycodes: workspace?.labels.keycodes ?? new Map() }),
    [workspace],
  );
  const changed = useMemo(() => {
    if (cornix === undefined || deviceRead === undefined) return [];
    return diffDocuments(deviceRead.document, cornix.document, cornix.definition, {
      settings: { labels: CORNIX_LP_V112_SETTINGS },
    }).entries;
  }, [cornix, deviceRead]);
  const applyGate = useMemo(() => {
    if (cornix === undefined || deviceRead === undefined || changed.length === 0) return undefined;
    const targets = changed
      .map(toWriteTarget)
      .filter((target): target is WriteTarget => target !== undefined);
    const validationResult = validateApplyKeymap(
      cornix.document,
      cornix.definition,
      {
        keyboardUid: deviceRead.keyboardUid,
        capacities: deviceRead.capacities,
        supportedQsids: deviceRead.supportedQsids,
      },
      { path: cornix.binding.definitionPath, digest: cornix.binding.definitionDigest },
      targets,
    );
    const definitionMismatch = deviceDefinitionDigest !== cornix.binding.definitionDigest;
    const diagnostics = definitionMismatch
      ? Object.freeze([
          ...validationResult.evidence.diagnostics,
          createDiagnostic(
            "compatibility/definition-mismatch",
            "error",
            { kind: "document" },
            deviceDefinitionDigest === undefined
              ? "実機definitionのdigestを取得できていないためApplyできない"
              : `実機definitionがworkspace bindingと異なる（workspace=${cornix.binding.definitionDigest} device=${deviceDefinitionDigest}）`,
            {
              workspace: cornix.binding.definitionDigest,
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
  }, [acknowledged, changed, cornix, deviceDefinitionDigest, deviceRead]);

  async function openWorkspace(): Promise<void> {
    try {
      await adoptStore(await pickWorkspace(), "workspaceを開いた");
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function importVil(): Promise<void> {
    if (cornix === undefined) return;
    try {
      const document = parseBrowserVil(await pickVilText());
      save(document);
      setStatus(".vilをdesiredへ読み込んだ。validationとdiffを確認してください");
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function exportVil(): Promise<void> {
    if (workspace === undefined || cornix === undefined) return;
    try {
      const path = generatedPath("keymap.vil");
      await workspace.store.writeText(path, serializeBrowserVil(cornix.document));
      setStatus(`${path}へ書き出した`);
    } catch (error) {
      setStatus(message(error));
    }
  }

  /**
   * 編集中の Mac desired state から Karabiner の asset を書き出す。
   *
   * ディスクを再読せず in-memory の document から生成する。保存キューに未 flush の
   * 編集がある瞬間の stale read を構造的に避ける（ADR 0025）。適用は行わない。
   * Browser UI は `cornix/generated/` への書き出しまでで、`karabiner.json` へ触るのは
   * CLI だけ（ADR 0022）。
   */
  async function exportKarabiner(): Promise<void> {
    if (workspace === undefined || macState?.kind !== "ready") return;
    try {
      const { asset, diagnostics, summary } = generateBrowserKarabinerFromDocument(
        macState.document,
      );
      if (asset === undefined) {
        setStatus(
          `${macState.path}にerrorが${summary.error}件ある: ${diagnostics
            .filter((diagnostic) => diagnostic.severity === "error")
            .map((diagnostic) => diagnostic.message)
            .join(" / ")}`,
        );
        return;
      }
      const path = generatedPath("karabiner-complex-modifications.json");
      await workspace.store.writeText(path, asset);
      const rest =
        diagnostics.length === 0
          ? ""
          : `（warning ${summary.warning}件・information ${summary.information}件）`;
      setStatus(`${path}へ書き出した${rest}。適用はcornix mac applyで行う`);
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function exportSvg(): Promise<void> {
    if (workspace === undefined || cornix === undefined) return;
    try {
      const path = generatedPath(`keymap-layer-${layer}.svg`);
      const svg = renderBrowserSvg(cornix.document, cornix.definition, layer, workspace.labels);
      await workspace.store.writeText(path, svg);
      setStatus(`${path}へ書き出した`);
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function exportPdf(): Promise<void> {
    if (workspace === undefined || cornix === undefined) return;
    try {
      const path = generatedPath(`keymap-layer-${layer}.pdf`);
      const pdf = renderBrowserPdf(cornix.document, cornix.definition, layer, workspace.labels);
      await workspace.store.writeBytes(path, pdf);
      setStatus(`${path}へ書き出した`);
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function reload(): Promise<void> {
    const store = workspace?.store ?? issue?.store;
    if (store === undefined) return;
    try {
      await adoptStore(store, "workspaceを再読み込みした", true);
    } catch (error) {
      setStatus(message(error));
    }
  }

  async function initializeWorkspace(store: UiWorkspaceStore): Promise<void> {
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

  function save(document = cornix?.document): void {
    if (workspace === undefined || cornix === undefined || document === undefined) return;
    setWorkspace({ ...workspace, cornix: { ...cornix, document } });
    setCornixSaveState({ kind: "saving" });
    try {
      saveQueue.current?.enqueue(serializeKeymapYaml(document, cornix.binding));
    } catch (error) {
      setCornixSaveState({ kind: "error", message: message(error) });
      setStatus(message(error));
    }
  }

  function retryCornixSave(): void {
    if (cornix === undefined) return;
    save(cornix.document);
  }

  function retryMacSave(): void {
    if (macLayout === undefined || macState?.kind !== "ready") return;
    saveMac(macLayout, macState.document);
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

  function editLayerLabel(layer: number, value: string): void {
    if (workspace === undefined) return;
    const labels = updateLayerLabel(workspace.labels, layer, value);
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
    if (workspace !== undefined && cornix !== undefined) {
      await workspace.store.writeText(definitionPath(digest), definitionText);
      if (cornix.binding.definitionDigest !== digest || cornix.document.uid !== result.keyboardUid)
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
    if (workspace === undefined || cornix === undefined) return;
    try {
      const text = await workspace.store.readText(WORKSPACE_LAYOUT.latestBackup);
      if (text === undefined) throw new Error("最新のbackupが見つからない");
      setWorkspace({ ...workspace, cornix: { ...cornix, document: parseVil(text) } });
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
    if (next.macLayer !== undefined && macLayout !== undefined) {
      setMacLayers((current) => ({ ...current, [macLayout]: next.macLayer ?? current[macLayout] }));
    }
    if (editTarget.kind === "mac") {
      setMacSelections((current) => ({ ...current, [editTarget.layout]: next.selection }));
    } else {
      setCornixSelection(next.selection);
    }
    setDiagnosticsOpen(false);
  }

  function editKey(keycode: string): void {
    if (cornix === undefined || cornixSelection?.kind !== "key") return;
    try {
      save(
        setKeyAssignment(
          cornix.document,
          { layer, row: cornixSelection.row, col: cornixSelection.col },
          keycode,
        ),
      );
    } catch (error) {
      setStatus(message(error));
    }
  }

  function editEncoder(keycode: string): void {
    if (cornix === undefined || cornixSelection?.kind !== "encoder") return;
    try {
      save(
        setEncoderAssignment(
          cornix.document,
          {
            layer,
            index: cornixSelection.index,
            direction: cornixSelection.direction === "ccw" ? 0 : 1,
          },
          keycode,
        ),
      );
    } catch (error) {
      setStatus(message(error));
    }
  }

  function editTapDance(index: number, field: number, value: string): void {
    if (cornix === undefined) return;
    const current = cornix.document.tapDance[index];
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
      ...cornix.document,
      tapDance: cornix.document.tapDance.map((entry, entryIndex) =>
        entryIndex === index ? next : entry,
      ),
    });
  }

  function editCombo(index: number, field: number, value: string): void {
    if (cornix === undefined) return;
    const current = cornix.document.combo[index];
    if (current === undefined || field < 0 || field > 4) return;
    const next = [...current] as [string, string, string, string, string];
    next[field] = value;
    save({
      ...cornix.document,
      combo: cornix.document.combo.map((entry, entryIndex) =>
        entryIndex === index ? next : entry,
      ),
    });
  }

  function editSetting(qsid: number, value: string): void {
    if (cornix === undefined) return;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) {
      setStatus("settingは0〜65535の整数が必要");
      return;
    }
    save({
      ...cornix.document,
      settings: { ...cornix.document.settings, [String(qsid)]: parsed },
    });
  }

  function saveMac(layout: MacKeyboardLayout, document: MacKeymapDocument): void {
    if (workspace === undefined) return;
    const state = workspace.mac[layout];
    if (state.kind !== "ready") return;
    setWorkspace({
      ...workspace,
      mac: { ...workspace.mac, [layout]: { ...state, document } },
    });
    setMacSaveStates((current) => ({ ...current, [layout]: { kind: "saving" } }));
    try {
      macSaveQueues.current[layout]?.enqueue(serializeMacKeymapYaml(document));
    } catch (error) {
      setMacSaveStates((current) => ({
        ...current,
        [layout]: { kind: "error", message: message(error) },
      }));
      setStatus(message(error));
    }
  }

  function editMacKey(targetLayer: number, keyCode: string, value: string): void {
    if (macLayout === undefined || macState?.kind !== "ready") return;
    try {
      saveMac(macLayout, setMacAssignment(macState.document, targetLayer, keyCode, value));
    } catch (error) {
      setStatus(message(error));
    }
  }

  function clearMacKey(targetLayer: number, keyCode: string): void {
    if (macLayout === undefined || macState?.kind !== "ready") return;
    saveMac(macLayout, clearMacAssignment(macState.document, targetLayer, keyCode));
  }

  function addMacLayerChip(targetLayer: number): void {
    if (macLayout === undefined || macState?.kind !== "ready") return;
    saveMac(macLayout, addMacLayer(macState.document, targetLayer));
    setMacLayers((current) => ({ ...current, [macLayout]: targetLayer }));
  }

  async function createMacKeymap(): Promise<void> {
    if (workspace === undefined || macLayout === undefined) return;
    try {
      const path = macKeymapPath(macLayout);
      await workspace.store.writeText(path, initialMacKeymapYaml(macLayout));
      await adoptStore(workspace.store, `${path}を作成した`, true);
    } catch (error) {
      setStatus(message(error));
    }
  }

  function setMacLayer(value: number): void {
    if (macLayout === undefined) return;
    setMacLayers((current) => ({ ...current, [macLayout]: value }));
  }

  function setMacSelection(value: Selection | undefined): void {
    if (macLayout === undefined) return;
    setMacSelections((current) => ({ ...current, [macLayout]: value }));
  }

  function setMacPickTarget(value: PickTarget): void {
    if (macLayout === undefined) return;
    setMacPickTargets((current) => ({ ...current, [macLayout]: value }));
  }

  function renderCornixMain(): React.ReactNode {
    const recovery = cornixIssue(workspace!);
    if (recovery !== undefined) {
      return (
        <WorkspaceRecovery
          issue={recovery}
          busy={progress !== undefined}
          onInitialize={() => void initializeWorkspace(recovery.store)}
          onMigrate={() =>
            recovery.kind === "legacy-binding" ? void migrateBinding(recovery) : undefined
          }
          onRetry={() => void reload()}
        />
      );
    }
    if (cornix === undefined || view === undefined) return null;
    if (cornixTab === "Keymap") {
      return (
        <KeymapTab
          view={view}
          definition={cornix.definition}
          layer={layer}
          setLayer={setLayer}
          selection={cornixSelection}
          setSelection={setCornixSelection}
          labels={workspace!.labels}
          pickTarget={cornixPickTarget}
          onPickTarget={setCornixPickTarget}
          onEditKey={editKey}
          onEditEncoder={editEncoder}
          diagnosticSubjects={
            validation === undefined
              ? []
              : validation.diagnostics.map((diagnostic) => diagnostic.subject)
          }
          onFocusEditor={() => {
            cornixEditorRef.current?.focus();
            cornixEditorRef.current?.select();
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
                definition={cornix.definition}
                layer={layer}
                selection={cornixSelection}
                labels={workspace!.labels}
                editorRef={cornixEditorRef}
                pickTarget={cornixPickTarget}
                onPickTarget={setCornixPickTarget}
                onEditKey={editKey}
                onEditEncoder={editEncoder}
                onEditLabel={editLabel}
                saveState={cornixSaveState}
                onRetrySave={retryCornixSave}
              />
            )
          }
        />
      );
    }
    if (cornixTab === "Overview") {
      return (
        <Overview
          document={cornix.document}
          definition={cornix.definition}
          labels={workspace!.labels}
          view={view}
          exportLayer={layer}
          onExportSvg={() => void exportSvg()}
          onExportPdf={() => void exportPdf()}
          onEditLayerLabel={editLayerLabel}
        />
      );
    }
    if (cornixTab === "Behaviors") {
      return (
        <Behaviors
          document={cornix.document}
          labels={workspace!.labels}
          onTapDance={editTapDance}
          onCombo={editCombo}
          onSetting={editSetting}
        />
      );
    }
    return (
      <References
        diagnostics={validation?.diagnostics ?? []}
        document={cornix.document}
        labels={workspace!.labels}
      />
    );
  }

  function renderMacMain(): React.ReactNode {
    if (macLayout === undefined || workspace === undefined) return null;
    if (macTab === "References") {
      return <MacReferences layout={macLayout} mac={workspace.mac[macLayout]} />;
    }
    return (
      <MacKeymapTab
        layout={macLayout}
        mac={workspace.mac[macLayout]}
        busy={progress !== undefined}
        onCreate={() => void createMacKeymap()}
        layer={macLayer}
        setLayer={setMacLayer}
        selection={macSelection}
        setSelection={setMacSelection}
        labels={macLabels}
        pickTarget={macPickTarget}
        onPickTarget={setMacPickTarget}
        onEdit={editMacKey}
        onAddLayer={addMacLayerChip}
        onExportKarabiner={() => void exportKarabiner()}
        diagnosticSubjects={
          macValidation === undefined
            ? []
            : macValidation.diagnostics.map((diagnostic) => diagnostic.subject)
        }
        onFocusEditor={() => {
          macEditorRef.current?.focus();
          macEditorRef.current?.select();
        }}
        panel={
          diagnosticsOpen ? (
            <DiagnosticsPanel
              diagnostics={macValidation?.diagnostics ?? []}
              filter={diagnosticFilter}
              onClose={() => setDiagnosticsOpen(false)}
              onSelect={selectDiagnostic}
            />
          ) : macState?.kind === "ready" ? (
            <MacKeyPanel
              document={macState.document}
              layer={macLayer}
              selection={macSelection}
              labels={macLabels}
              path={macState.path}
              editorRef={macEditorRef}
              pickTarget={macPickTarget}
              onPickTarget={setMacPickTarget}
              onEdit={editMacKey}
              onClear={clearMacKey}
              saveState={macSaveStates[macLayout] ?? { kind: "idle" }}
              onRetrySave={retryMacSave}
            />
          ) : (
            <></>
          )
        }
      />
    );
  }

  return (
    <div className="app-shell">
      <AppHeader
        workspaceName={workspace?.store.directory.name}
        device={device}
        onOpenWorkspace={() => void openWorkspace()}
        onImportVil={() => void importVil()}
        onExportVil={() => void exportVil()}
        onReload={() => void reload()}
        onRestoreBackup={() => void restoreBackup()}
        onConnect={() => void connect()}
        onDisconnect={() => void disconnect()}
        onRead={() => void readDevice()}
        themePreference={themePreference}
        onThemePreferenceChange={changeThemePreference}
        canReload={workspace !== undefined}
        canEditCornix={cornix !== undefined}
      />
      {workspace === undefined ? null : (
        <EditTargetSelect target={editTarget} mac={workspace.mac} onChange={setEditTarget} />
      )}
      <nav className="tabs" aria-label="main tabs">
        {(editTarget.kind === "cornix"
          ? (["Keymap", "Overview", "Behaviors", "References"] as const)
          : (["Keymap", "References"] as const)
        ).map((name) => (
          <button
            className={
              (editTarget.kind === "cornix" ? cornixTab : macTab) === name ? "is-active" : ""
            }
            onClick={() =>
              editTarget.kind === "cornix"
                ? setCornixTab(name as CornixTab)
                : setMacTab(name as MacTab)
            }
            key={name}
          >
            {name}
          </button>
        ))}
        <a
          className="tabs-guide"
          href={USER_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="利用者ガイドを新しいタブで開く"
        >
          利用者ガイド
        </a>
      </nav>
      {workspace === undefined ? (
        <main className="empty-state">
          <h1>workspaceから始める</h1>
          <p>ディレクトリを開きます。keymap.yamlが無くてもMacキーボードの設定を編集できます。</p>
          <button className="c-btn c-btn--primary" onClick={() => void openWorkspace()}>
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
          {editTarget.kind === "cornix" ? renderCornixMain() : renderMacMain()}
        </main>
      )}
      <StatusBar
        summary={
          (editTarget.kind === "mac" ? macValidation?.summary : validation?.summary) ?? {
            error: 0,
            warning: 0,
            information: 0,
          }
        }
        status={progress ?? status}
        mode={
          editTarget.kind === "mac"
            ? {
                kind: "mac",
                savePath:
                  macState?.kind === "ready" ? macState.path : macKeymapPath(editTarget.layout),
                canExport: macState?.kind === "ready",
                onExportKarabiner: () => void exportKarabiner(),
              }
            : {
                kind: "cornix",
                savePath: WORKSPACE_LAYOUT.keymap,
                changedCount: changed.length,
                canApply: changed.length > 0 && deviceRead !== undefined,
                onApply: () => void openApply(),
              }
        }
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

function issueSummary(_probe: Exclude<WorkspaceProbe, { kind: "ready" }>): string {
  return "workspaceを読み込めなかった";
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
