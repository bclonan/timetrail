<script setup lang="ts">
import { computed } from "vue";
import { Plus, Layers, Clock3 } from "lucide-vue-next";
import { useWorkspace } from "../../stores/workspace";
import { useEditor } from "../../stores/editor";
import { cueEnd } from "../../services/TimelineEditing";
import { useTimelineDrag } from "./useTimelineDrag";
import TimelineItem from "./TimelineItem.vue";
import Modal from "../common/Modal.vue";
const w = useWorkspace();
const e = useEditor();
const d = useTimelineDrag();
const { scroll, shown, draggingId, busy, status } = d;
const clip = computed({
  get: () => (e.active === "clip" ? e.clip : undefined),
  set: () => e.close(),
});
const lanes = [
  { name: "Chapters", kinds: ["chapter"], class: "chapters" },
  {
    name: "Overlays",
    kinds: ["image", "hotspot", "caption", "narration"],
    class: "overlays",
  },
  {
    name: "Notes & facts",
    kinds: ["note", "fact", "definition", "warning"],
    class: "notes",
  },
  { name: "Sources", kinds: ["source"], class: "sources" },
  { name: "Quizzes & branches", kinds: ["quiz", "branch"], class: "choices" },
];
const approvedSequence = d.approved;
const duration = computed(() => approvedSequence.value?.durationSeconds || 90);
// Overlapping cues need separate rows so every cue remains clickable.
const renderedLanes = computed(() =>
  lanes.map((lane) => {
    const occupiedUntil: number[] = [];
    const cues = (approvedSequence.value?.cues || [])
      .filter((c) => lane.kinds.includes(c.kind))
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((cue) => {
        let row = occupiedUntil.findIndex((end) => end <= cue.start);
        if (row < 0) row = occupiedUntil.length;
        occupiedUntil[row] = Math.max(
          cue.end ?? cue.start + 5,
          cue.start + duration.value * 0.01,
        );
        return {
          cue: shown.value?.cues.find((c) => c.id === cue.id) || cue,
          row,
        };
      });
    return { ...lane, cues, rows: Math.max(1, occupiedUntil.length) };
  }),
);
async function saveClip(remove = false) {
  await e.submit(remove ? "delete" : "save");
}
</script>
<template>
  <section class="timeline" aria-label="Approved timeline">
    <div class="timeline-header">
      <div>
        <Layers :size="15" /><strong>Timeline</strong
        ><span
          >{{ approvedSequence?.clips.length || 0 }} clips ·
          {{ approvedSequence?.cues.length || 0 }} cues</span
        >
      </div>
      <div>
        <span class="small-text muted">{{ duration }}s</span
        ><button class="small subtle" @click="e.open('cue')">
          <Plus :size="14" />Add note
        </button>
      </div>
    </div>
    <p id="timeline-help" class="timeline-help">
      Drag clips to reorder, or move them into gaps. Contained cues follow their
      clips. Drag cue bodies to move them, or an edge to resize. Shift bypasses
      snapping. Escape cancels. Arrow keys adjust timing; Alt + arrows reorder
      clips.
    </p>
    <p class="timeline-feedback" role="status" aria-live="polite">
      {{ status || "Click an item to edit its details." }}
    </p>
    <div v-if="w.pending.length" class="ghost-lane">
      <span>Agent proposal</span>
      <div>
        <button
          v-for="p in w.pending"
          :key="p.id"
          @click="w.run(() => w.preview(p))"
        >
          <span class="ghost-dot" />{{ p.title }} · +{{ p.summary.cuesAdded }}
          cues
        </button>
      </div>
      <span>NOT COMMITTED</span>
    </div>
    <div ref="scroll" class="timeline-scroll" :aria-busy="busy">
      <div class="ruler">
        <span></span>
        <div>
          <span
            v-for="i in 7"
            :key="i"
            :style="{ left: ((i - 1) / 6) * 100 + '%' }"
            >{{ Math.round(((i - 1) / 6) * duration) }}s</span
          >
        </div>
      </div>
      <div class="lane">
        <span>Clips</span>
        <div class="lane-track clips">
          <TimelineItem
            v-for="c in shown?.clips"
            :key="c.id"
            :data-item-id="c.id"
            :start="c.timelineStart"
            :end="c.timelineStart + c.durationSeconds"
            :duration="duration"
            :label="
              'Edit clip ' +
              (w.approved?.media.find((m) => m.id === c.mediaId)?.name || c.id)
            "
            :dragging="draggingId === c.id"
            :disabled="busy || Boolean(w.previewProject)"
            @begin="(event, action) => d.begin(event, 'clip', c.id, action)"
            @move="d.move"
            @finish="d.finish"
            @cancel="d.cancel"
            @open="(event) => d.click(event, 'clip', c.id)"
            @nudge="(event, action) => d.nudge(event, 'clip', c.id, action)"
          >
            <Clock3 v-if="c.timingEstimated" :size="11" /><span>{{
              w.approved?.media.find((m) => m.id === c.mediaId)?.name
            }}</span
            ><small v-if="c.timingEstimated">estimated</small>
          </TimelineItem>
          <div
            class="playhead"
            :style="{ left: (w.time / duration) * 100 + '%' }"
          />
        </div>
      </div>
      <div
        v-for="lane in renderedLanes"
        :key="lane.name"
        class="lane"
        :style="{ height: lane.rows * 27 + 7 + 'px' }"
      >
        <span>{{ lane.name }}</span>
        <div
          class="lane-track"
          :class="lane.class"
          :style="{ height: lane.rows * 27 + 'px' }"
        >
          <TimelineItem
            v-for="{ cue, row } in lane.cues"
            :key="cue.id"
            :data-item-id="cue.id"
            :start="cue.start"
            :end="cueEnd(cue, duration)"
            :duration="duration"
            :row="row"
            :label="
              'Edit ' +
              cue.kind +
              ' ' +
              (cue.title || cue.body?.slice(0, 25)) +
              ' at ' +
              cue.start +
              ' seconds'
            "
            :selected="w.selectedCue === cue.id"
            :dragging="draggingId === cue.id"
            :disabled="busy || Boolean(w.previewProject)"
            @begin="(event, action) => d.begin(event, 'cue', cue.id, action)"
            @move="d.move"
            @finish="d.finish"
            @cancel="d.cancel"
            @open="(event) => d.click(event, 'cue', cue.id)"
            @nudge="(event, action) => d.nudge(event, 'cue', cue.id, action)"
          >
            {{ cue.title || cue.kind }}
          </TimelineItem>
          <div
            class="playhead"
            :style="{ left: (w.time / duration) * 100 + '%' }"
          />
        </div>
      </div>
    </div>
    <Modal v-if="clip" title="Edit clip timing" @close="clip = undefined"
      ><form @submit.prevent="w.run(() => saveClip())">
        <label
          >Media<select v-model="e.clip!.mediaId">
            <option v-for="m in w.approved?.media" :key="m.id" :value="m.id">
              {{ m.name }}
            </option>
          </select></label
        >
        <div class="form-row">
          <label
            >Timeline start<input
              v-model.number="clip.timelineStart"
              type="number"
              min="0"
              step="0.1"
              required /></label
          ><label
            >Duration<input
              v-model.number="clip.durationSeconds"
              type="number"
              min="0.1"
              step="0.1"
              required
          /></label>
        </div>
        <div class="form-row">
          <label
            >Source start<input
              v-model.number="clip.sourceStart"
              type="number"
              min="0"
              step="0.1"
              required /></label
          ><label
            >Source end<input
              v-model.number="clip.sourceEnd"
              type="number"
              min="0.1"
              step="0.1"
          /></label>
        </div>
        <p v-if="clip.timingEstimated" class="warning-text">
          Timing is estimated. Check the original media before saving.
        </p>
        <div class="dialog-actions">
          <button
            type="button"
            class="danger"
            @click="w.run(() => saveClip(true))"
          >
            Delete clip</button
          ><button class="primary">Save timing</button>
        </div>
      </form></Modal
    >
  </section>
</template>
