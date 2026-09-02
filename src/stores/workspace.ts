import { defineStore } from "pinia";
import { ref, computed, shallowRef, watch } from "vue";
import {
  clone,
  id,
  now,
  type Project,
  type ProjectRecord,
  type Proposal,
  type Operation,
  type AuditEvent,
} from "../domain/model";
import { storage } from "../storage/BrowserWorkspaceStore";
import { projects } from "../services/ProjectService";
import { proposals as proposalService } from "../services/ProposalService";
import { TimelineCompiler } from "../services/TimelineCompiler";
import { makeDemo, samplePlan } from "../demo/demoProject";
import {
  exportsService,
  type PreparedExport,
  type ExportFormat,
} from "../services/ExportService";
import { shares } from "../services/ShareService";
export const useWorkspace = defineStore("workspace", () => {
  const record = ref<ProjectRecord>();
  const proposals = ref<Proposal[]>([]);
  const previewProject = ref<Project>();
  const ephemeral = ref(false);
  const time = ref(0);
  const paused = ref(true);
  const sequenceId = ref("");
  const selectedCue = ref("");
  const toast = ref("");
  const error = ref("");
  const loading = ref(false);
  const playerReady = ref(false);
  const events = ref<AuditEvent[]>([]);
  const activity = ref(0);
  const prepared = shallowRef<PreparedExport>();
  const shareCode = ref("");
  const shareLink = ref("");
  const shareVersion = ref(0);
  const quizAnswers = ref<Record<string, number>>({});
  const pinnedCues = ref<string[]>([]);
  const mediaOpen = ref(true);
  const captions = ref(true);
  const narration = ref(false);
  const history = ref<{ sequenceId: string; time: number }[]>([]);
  watch(sequenceId, () => {
    pinnedCues.value = [];
  });
  const approved = computed(() => record.value?.project);
  const current = computed(() => previewProject.value || approved.value);
  const sequence = computed(
    () =>
      current.value?.sequences.find((s) => s.id === sequenceId.value) ||
      current.value?.sequences[0],
  );
  const pending = computed(() =>
    proposals.value.filter((p) => p.status === "pending"),
  );
  const command = shallowRef<{
    action: "play" | "pause" | "seek";
    timeSeconds?: number;
    nonce: number;
  }>();
  const confirmation = shallowRef<{
    title: string;
    body: string;
    confirmLabel: string;
    resolve: (confirmed: boolean) => void;
  }>();
  function ask(
    title: string,
    body: string,
    confirmLabel = "Confirm",
    signal?: AbortSignal,
  ) {
    if (confirmation.value)
      throw new Error("Finish the current confirmation first.");
    return new Promise<boolean>((resolve) => {
      const done = (v: boolean) => {
        confirmation.value = undefined;
        signal?.removeEventListener("abort", cancel);
        resolve(v);
      };
      const cancel = () => done(false);
      confirmation.value = { title, body, confirmLabel, resolve: done };
      if (signal?.aborted) cancel();
      else signal?.addEventListener("abort", cancel, { once: true });
    });
  }
  async function refresh() {
    if (!approved.value || ephemeral.value) return;
    record.value = await storage.record(approved.value.id);
    proposals.value = await storage.proposals(approved.value!.id);
    events.value = await storage.events();
  }
  async function load(projectId: string) {
    loading.value = true;
    error.value = "";
    try {
      const r = await storage.record(projectId);
      if (!r)
        throw new Error(
          "Project not found on this device. Open Discover or import a project.",
        );
      record.value = r;
      previewProject.value = undefined;
      ephemeral.value = false;
      sequenceId.value = r.project.activeSequenceId;
      time.value = 0;
      paused.value = true;
      selectedCue.value = "";
      history.value = [];
      quizAnswers.value = {};
      pinnedCues.value = [];
      await storage.setSetting("lastProject", projectId);
      await refresh();
    } finally {
      loading.value = false;
    }
  }
  function loadEphemeral(p: Project) {
    record.value = {
      project: clone(p),
      revision: 0,
      past: [],
      future: [],
      applied: [],
    };
    proposals.value = [];
    ephemeral.value = true;
    previewProject.value = undefined;
    sequenceId.value = p.activeSequenceId;
    time.value = 0;
    history.value = [];
    quizAnswers.value = {};
    pinnedCues.value = [];
  }
  async function create(input: unknown) {
    const p = await projects.create(input);
    await load(p.id);
    return p;
  }
  async function demo(reset = false) {
    let r = await storage.record("demo_dna");
    if (!r || reset) {
      const p = makeDemo();
      r = { project: p, revision: 0, past: [], future: [], applied: [] };
      await storage.save(r);
      if (reset) {
        const db = await storage.db();
        for (const proposal of await storage.proposals(p.id))
          await db.delete("proposals", proposal.id);
      }
    }
    await load("demo_dna");
  }
  function requireRecord() {
    if (!record.value) throw new Error("Open a project first.");
    if (ephemeral.value)
      throw new Error("Remix this read-only project before editing.");
    return clone(record.value);
  }
  async function commit(
    operations: Operation[],
    expected?: { projectId: string; revision: number },
  ) {
    const r = requireRecord();
    if (
      expected &&
      (r.project.id !== expected.projectId || r.revision !== expected.revision)
    )
      throw new Error("Project changed during the edit. Try the edit again.");
    record.value = await projects.commit(r.project.id, operations, r.revision);
    previewProject.value = undefined;
    await refresh();
    notify("Saved on this device.");
  }
  async function sample() {
    const r = requireRecord();
    const result = new TimelineCompiler().compile(
      r.project,
      samplePlan(r.project),
    );
    const p = await proposalService.create(
      r,
      "Sample storyboard",
      result.operations,
      result.warnings,
      `demo_${id()}`,
    );
    await refresh();
    notify("Sample proposal ready. Approved timeline is unchanged.");
    return p;
  }
  function preview(p: Proposal) {
    const r = requireRecord();
    previewProject.value = proposalService.preview(r, p);
    time.value = 0;
    notify("Previewing proposed version. Nothing has been saved.");
  }
  function restore() {
    previewProject.value = undefined;
    time.value = 0;
    notify("Approved version restored.");
  }
  async function review(
    ids: string[],
    decision: "accept" | "reject",
    indexes?: number[],
  ) {
    const r = requireRecord();
    record.value = await proposalService.review(
      r.project.id,
      ids,
      decision,
      r.revision,
      indexes,
    );
    previewProject.value = undefined;
    await refresh();
    notify(
      decision === "accept"
        ? "Proposal accepted. Preview is refreshing."
        : "Proposal rejected. Approved version is unchanged.",
    );
  }
  async function undo(direction: "undo" | "redo") {
    const r = requireRecord();
    record.value = await projects.travel(r.project.id, direction, r.revision);
    previewProject.value = undefined;
    await refresh();
  }
  function playback(
    action: "play" | "pause" | "seek" | "jump-to-chapter",
    value?: number,
    chapterId?: string,
  ) {
    if (!sequence.value) throw new Error("No active sequence.");
    if (action === "jump-to-chapter") {
      const c = sequence.value.cues.find(
        (c) => c.id === chapterId && c.kind === "chapter",
      );
      if (!c) throw new Error("Chapter not found.");
      value = c.start;
      action = "seek";
    }
    if (action === "seek") {
      if (
        value === undefined ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > sequence.value.durationSeconds
      )
        throw new Error("Seek is outside the active sequence.");
      time.value = value;
    } else paused.value = action === "pause";
    command.value = {
      action,
      timeSeconds: value,
      nonce: Date.now() + Math.random(),
    };
    return { time: time.value, paused: paused.value };
  }
  function branch(target: string, targetTime = 0) {
    if (!current.value?.sequences.some((s) => s.id === target))
      throw new Error("Branch not found.");
    history.value.push({ sequenceId: sequenceId.value, time: time.value });
    sequenceId.value = target;
    time.value = targetTime;
    paused.value = true;
  }
  function back() {
    const previous = history.value.pop();
    if (previous) {
      sequenceId.value = previous.sequenceId;
      time.value = previous.time;
      paused.value = true;
    }
  }
  async function prepareExport(format: ExportFormat) {
    if (!approved.value) throw new Error("Open a project first.");
    prepared.value = await exportsService.prepare(
      clone(approved.value),
      format,
    );
    await storage.log({
      projectId: approved.value.id,
      toolName: "export.prepared",
      message: `Export prepared: ${prepared.value.filename}`,
    });
    return prepared.value;
  }
  async function prepareShare() {
    if (!approved.value) throw new Error("Open a project first.");
    shareCode.value = shares.encode(clone(approved.value));
    shareLink.value = `${location.origin}/#/watch?tt=${shareCode.value}`;
    shareVersion.value++;
    await storage.log({
      projectId: approved.value.id,
      toolName: "share.prepared",
      message: "Share code generated",
    });
    return shareCode.value;
  }
  async function remix() {
    if (!approved.value) throw new Error("Open a project first.");
    const p = await projects.remix(clone(approved.value));
    await load(p.id);
    return p;
  }
  function notify(message: string) {
    toast.value = message;
    error.value = "";
  }
  async function run<T>(fn: () => Promise<T> | T): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      toast.value = "";
      return undefined;
    }
  }
  async function addNote() {
    if (!sequence.value) return;
    await commit([
      {
        type: "add_cue",
        sequenceId: sequence.value.id,
        value: {
          id: id(),
          kind: "note",
          start: time.value,
          end: Math.min(time.value + 10, sequence.value.durationSeconds),
          title: "A note for this moment",
          body: "Add your context here.",
          provenance: { createdBy: "human", createdAt: now() },
        },
      },
    ]);
    selectedCue.value = sequence.value.cues.at(-1)!.id;
  }
  return {
    record,
    approved,
    current,
    sequence,
    sequenceId,
    proposals,
    pending,
    previewProject,
    ephemeral,
    time,
    paused,
    selectedCue,
    toast,
    error,
    loading,
    playerReady,
    events,
    activity,
    prepared,
    shareCode,
    shareLink,
    shareVersion,
    quizAnswers,
    mediaOpen,
    pinnedCues,
    captions,
    narration,
    history,
    command,
    confirmation,
    ask,
    refresh,
    load,
    loadEphemeral,
    create,
    demo,
    requireRecord,
    commit,
    sample,
    preview,
    restore,
    review,
    undo,
    playback,
    branch,
    back,
    prepareExport,
    prepareShare,
    remix,
    notify,
    run,
    addNote,
  };
});
