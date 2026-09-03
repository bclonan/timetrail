<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useWorkspace } from "../../stores/workspace";
import Modal from "../common/Modal.vue";
import {
  quality,
  type QualityReport,
  type QualityFinding,
} from "../../services/QualityService";
import {
  organizeHotspots,
  type hotspotLayoutSchema,
} from "../../services/HotspotService";
import { proposals } from "../../services/ProposalService";
import type { z } from "zod";
const w = useWorkspace();
const open = ref(false),
  busy = ref(false),
  report = ref<QualityReport>(),
  selected = ref<string[]>([]);
const layout = ref<z.infer<typeof hotspotLayoutSchema>>("grid"),
  group = ref("");
const stale = computed(
  () =>
    report.value &&
    (report.value.projectId !== w.approved?.id ||
      report.value.revision !== w.record?.revision),
);
watch(
  () => w.approved?.id,
  () => {
    report.value = undefined;
    open.value = false;
    selected.value = [];
  },
);
async function scan() {
  busy.value = true;
  try {
    const r = w.requireRecord();
    const next = await quality.scan(
      r,
      true,
      !stale.value && report.value?.remainingMediaIds.length
        ? report.value.id
        : undefined,
    );
    if (
      w.record?.project.id !== r.project.id ||
      w.record.revision !== r.revision
    )
      throw new Error("Project changed during review. Scan again.");
    report.value = next;
    selected.value = [];
  } finally {
    busy.value = false;
  }
}
async function repair() {
  const r = w.requireRecord();
  const ops = quality.fixes(r, report.value!.id, selected.value);
  await proposals.create(r, "Improve film quality", ops, [
    "Review the proposed positions, contrast and timing before accepting.",
  ]);
  await w.refresh();
  open.value = false;
  w.notify("Quality fixes are ready for review.");
}
function visit(f: QualityFinding) {
  if (!f.sequenceId) return;
  open.value = false;
  w.branch(f.sequenceId, f.time || 0);
}
async function arrange() {
  const r = w.requireRecord();
  const sequence = r.project.sequences.find((s) => s.id === w.sequence?.id)!;
  const cueIds = sequence.cues
    .filter(
      (c) =>
        ["hotspot", "branch"].includes(c.kind) &&
        (!group.value || c.group === group.value),
    )
    .map((c) => c.id);
  const ops = organizeHotspots(r.project, {
    sequenceId: sequence.id,
    cueIds,
    layout: layout.value,
  });
  await proposals.create(r, "Arrange hotspots", ops);
  await w.refresh();
  open.value = false;
  w.notify("Hotspot arrangement is ready for review.");
}
</script>
<template>
  <button class="small" @click="open = true">Review film quality</button>
  <Modal v-if="open" title="Review film quality" @close="open = false">
    <p>
      Check every screen for empty sections, blocked controls and unreadable
      hotspots. Media checks load source metadata. Review the picture and sound
      in Player too.
    </p>
    <div class="dialog-actions">
      <button :disabled="busy" @click="w.run(scan)">
        {{
          busy
            ? "Checking sources..."
            : report?.remainingMediaIds.length && !stale
              ? "Check next sources"
              : "Scan film"
        }}
      </button>
    </div>
    <details>
      <summary>Arrange this screen's hotspots</summary>
      <label
        >Group filter<input v-model="group" placeholder="All groups"
      /></label>
      <label
        >Layout<select v-model="layout">
          <option value="grid">Grid</option>
          <option value="stack-right">Stack on right</option>
          <option value="bottom-row">Row above captions</option>
        </select></label
      >
      <button @click="w.run(arrange)">Propose arrangement</button>
    </details>
    <template v-if="report">
      <p v-if="stale" role="status">
        The film changed. Scan again before preparing fixes.
      </p>
      <p>
        {{ report.sequences }} screens, {{ report.clips }} clips and
        {{ report.cues }} annotations reviewed.
        {{ report.checkedMediaIds.length }} media checked,
        {{ report.remainingMediaIds.length }} remaining.
      </p>
      <p v-if="!report.findings.length">
        No automated findings. Playback and visual review are still needed.
      </p>
      <div class="quality-findings">
        <article
          v-for="f in report.findings"
          :key="f.id"
          class="quality-finding"
        >
          <label v-if="f.changes?.length"
            ><input
              v-model="selected"
              type="checkbox"
              :value="f.id"
              :disabled="stale"
            />Include suggested fix</label
          >
          <strong>{{ f.severity }} · {{ f.code.replaceAll("_", " ") }}</strong>
          <p>{{ f.message }}</p>
          <button v-if="f.sequenceId" class="small" @click="visit(f)">
            Show at {{ (f.time || 0).toFixed(1) }}s
          </button>
        </article>
      </div>
      <button
        class="primary"
        :disabled="!selected.length || stale"
        @click="w.run(repair)"
      >
        Prepare {{ selected.length }} selected fixes
      </button>
    </template>
  </Modal>
</template>
<style scoped>
.quality-findings {
  max-height: 45vh;
  overflow: auto;
  margin: 16px 0;
}
.quality-finding {
  padding: 14px 0;
  border-bottom: 1px solid #8996a344;
}
.quality-finding label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.quality-finding input[type="checkbox"] {
  width: auto;
}
.quality-finding p {
  margin: 8px 0;
}
</style>
