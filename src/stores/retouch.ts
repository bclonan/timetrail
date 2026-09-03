import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { clone, type Media } from "../domain/model";
import type { RetouchJob } from "../domain/retouch";
import { storage } from "../storage/BrowserWorkspaceStore";
import {
  captureEdit,
  updateEditMask,
  prepareEdit,
  proposeEdit,
  editJob,
} from "../services/RetouchService";
import { importFile } from "../services/MediaImportService";
import { proposals } from "../services/ProposalService";
import { useWorkspace } from "./workspace";

export const useRetouch = defineStore("retouch", () => {
  const w = useWorkspace();
  const open = ref(false),
    jobs = ref<RetouchJob[]>([]),
    selectedId = ref("");
  const requestedMedia = ref(""),
    busy = ref(false);
  const selected = computed(() =>
    jobs.value.find((j) => j.id === selectedId.value),
  );
  const available = computed(() => {
    const all: Media[] = clone(w.approved?.media || []);
    for (const p of w.pending)
      for (const op of p.operations)
        if (
          op.type === "upsert_media" &&
          !all.some((m) => m.id === op.value.id)
        )
          all.push(clone(op.value));
    return all;
  });
  let generation = 0,
    abort = new AbortController();
  async function refresh() {
    const projectId = w.approved?.id,
      token = generation;
    const next = projectId ? await storage.retouchJobs(projectId) : [];
    if (token === generation) jobs.value = next;
  }
  watch(
    () => w.approved?.id,
    () => {
      generation++;
      abort.abort();
      abort = new AbortController();
      open.value = false;
      selectedId.value = "";
      requestedMedia.value = "";
      jobs.value = [];
      void w.run(refresh);
    },
    { immediate: true },
  );
  function show(mediaId = "") {
    requestedMedia.value = mediaId;
    open.value = true;
  }
  async function operation<T>(
    work: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ) {
    if (busy.value)
      throw new Error("Wait for the current frame edit operation to finish.");
    busy.value = true;
    try {
      return await work(
        AbortSignal.any([abort.signal, ...(signal ? [signal] : [])]),
      );
    } finally {
      busy.value = false;
    }
  }
  async function select(jobId: string) {
    const job = await editJob(w.requireRecord().project.id, jobId);
    await refresh();
    selectedId.value = job.id;
    open.value = true;
    return job;
  }
  async function capture(raw: unknown, signal?: AbortSignal) {
    return operation(async (s) => {
      const job = await captureEdit(clone(w.requireRecord()), raw, s);
      s.throwIfAborted();
      await select(job.id);
      return job;
    }, signal);
  }
  async function mask(raw: unknown, signal?: AbortSignal) {
    return operation(async (s) => {
      const job = await updateEditMask(w.requireRecord().project.id, raw, s);
      s.throwIfAborted();
      await select(job.id);
      return job;
    }, signal);
  }
  async function prepare(raw: unknown, signal?: AbortSignal) {
    return operation(async (s) => {
      const job = await prepareEdit(
        clone(w.requireRecord()),
        raw,
        available.value,
        s,
      );
      s.throwIfAborted();
      await select(job.id);
      return job;
    }, signal);
  }
  async function propose(raw: unknown, signal?: AbortSignal) {
    return operation(async (s) => {
      const result = await proposeEdit(
        clone(w.requireRecord()),
        raw,
        available.value,
        s,
      );
      s.throwIfAborted();
      await w.refresh();
      await select(result.job.id);
      return {
        status: "pending_human_review",
        proposalId: result.proposal.id,
        jobId: result.job.id,
        version: result.job.version,
      };
    }, signal);
  }
  async function uploadResult(file: File) {
    return operation(async (s) => {
      const r = clone(w.requireRecord());
      const media = await importFile(file, "human");
      if (!["image", "video"].includes(media.type))
        throw new Error("Return an edited image or video file.");
      s.throwIfAborted();
      await proposals.create(r, `Returned edit: ${media.name}`, [
        { type: "upsert_media", value: media },
      ]);
      await w.refresh();
      return media;
    });
  }
  function cancel() {
    abort.abort();
    abort = new AbortController();
  }
  return {
    open,
    jobs,
    selectedId,
    selected,
    requestedMedia,
    busy,
    available,
    refresh,
    select,
    show,
    capture,
    mask,
    prepare,
    propose,
    uploadResult,
    cancel,
  };
});
