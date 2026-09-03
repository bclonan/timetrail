<script setup lang="ts">
import { computed } from "vue";
import { X, Copy, Trash2 } from "lucide-vue-next";
import { useWorkspace } from "../../stores/workspace";
import { useEditor } from "../../stores/editor";
import { kinds } from "../../domain/model";
import {
  hotspotAppearance,
  positionForCue,
  annotationKinds,
} from "../../domain/hotspots";
const w = useWorkspace();
const e = useEditor();
const draft = computed(() => e.cue);
const position = computed(() =>
  draft.value ? positionForCue(draft.value, w.sequence?.cues || []) : undefined,
);
const positionFields = [
  { key: "x", label: "X · from left" },
  { key: "y", label: "Y · from top" },
  { key: "width", label: "Width" },
  { key: "height", label: "Height" },
] as const;
function setCoordinate(field: "x" | "y" | "width" | "height", event: Event) {
  const value = (event.target as HTMLInputElement).valueAsNumber;
  if (!draft.value || !position.value || !Number.isFinite(value)) return;
  draft.value.position = { ...position.value, [field]: value };
  e.positionEditing = true;
}
function smallIndicator() {
  if (!draft.value) return;
  draft.value.position = {
    x: draft.value.position?.x ?? 6,
    y: draft.value.position?.y ?? 8,
    width: 4,
    height: 7,
  };
  draft.value.style = { preset: "marker" };
  e.positionEditing = true;
}
const options = computed({
  get: () => draft.value?.quiz?.options.join("\n") || "",
  set: (value) => {
    if (draft.value?.quiz) draft.value.quiz.options = value.split("\n");
  },
});
const save = () => e.submit();
const duplicate = () => e.submit("duplicate");
const remove = () => e.submit("delete");
const changeKind = () => e.changeKind();
</script>
<template>
  <aside v-if="draft" class="cue-inspector">
    <div class="section-heading">
      <span>EDIT THIS MOMENT</span
      ><button
        class="icon-button"
        aria-label="Close inspector"
        @click="
          e.close();
          w.selectedCue = '';
        "
      >
        <X :size="16" />
      </button>
    </div>
    <form @submit.prevent="w.run(save)">
      <label
        >Kind<select v-model="draft.kind" @change="changeKind">
          <option v-for="kind in kinds" :key="kind">{{ kind }}</option>
        </select></label
      >
      <div class="form-row">
        <label
          >Start<input
            v-model.number="draft.start"
            type="number"
            min="0"
            step=".1"
            required /></label
        ><label
          >End<input v-model.number="draft.end" type="number" min="0" step=".1"
        /></label>
      </div>
      <details
        v-if="!['chapter', 'caption', 'narration', 'quiz'].includes(draft.kind)"
        open
        class="position-controls"
      >
        <summary>Position in player</summary>
        <p>Percent of the video. X and Y start at the top-left corner.</p>
        <button
          type="button"
          class="small"
          :aria-pressed="e.positionEditing"
          @click="
            draft.position = { ...position! };
            e.positionEditing = !e.positionEditing;
          "
        >
          {{ e.positionEditing ? "Hide position guide" : "Adjust on video" }}
        </button>
        <div v-if="position" class="position-fields">
          <label v-for="field in positionFields" :key="field.key"
            >{{ field.label }} %<input
              :value="position[field.key]"
              @input="setCoordinate(field.key, $event)"
              @focus="e.positionEditing = true"
              type="number"
              :min="field.key === 'x' || field.key === 'y' ? 0 : 1"
              max="100"
              step="0.5"
          /></label>
        </div>
        <p v-if="e.positionEditing">
          Drag the box to move it. Drag its corner to resize. Arrow keys adjust
          by 1%; Shift by 5%. Escape cancels a drag. Save cue applies the draft.
        </p>
      </details>
      <label>Title<input v-model="draft.title" maxlength="300" /></label
      ><label
        >Body<textarea v-model="draft.body" rows="4" maxlength="8000" /></label
      ><label
        >Source URL<input
          v-model="draft.url"
          type="url"
          placeholder="https://..."
          @change="draft.url = draft.url || undefined" /></label
      ><label
        >Resource<select v-model="draft.resourceId">
          <option :value="undefined">No resource</option>
          <option v-for="m in w.approved?.media" :key="m.id" :value="m.id">
            {{ m.name }}
          </option>
        </select></label
      >

      <details
        v-if="annotationKinds.includes(draft.kind) || draft.kind === 'branch'"
      >
        <summary>Hotspot style and group</summary>
        <button
          v-if="annotationKinds.includes(draft.kind)"
          type="button"
          class="small"
          @click="smallIndicator"
        >
          Use small indicator
        </button>
        <label
          >Group<input
            v-model="draft.group"
            maxlength="80"
            placeholder="e.g. Spec labels"
        /></label>
        <button
          type="button"
          class="small"
          @click="
            draft.style = {
              ...hotspotAppearance(draft.style),
              backgroundColor:
                hotspotAppearance(draft.style).backgroundColor || '#c5ef91',
              preset: 'filled',
            }
          "
        >
          Customize style
        </button>
        <template v-if="draft.style">
          <label
            >Appearance<select v-model="draft.style.preset">
              <option value="filled">Filled button</option>
              <option value="outline">Outline</option>
              <option value="marker">Small info indicator</option>
            </select></label
          >
          <label
            >Shape<select v-model="draft.style.shape">
              <option value="rounded">Rounded</option>
              <option value="rectangle">Rectangle</option>
              <option value="circle">Circle</option>
            </select></label
          >
          <label
            >Border color<input v-model="draft.style.color" type="color"
          /></label>
          <label
            >Text color<input v-model="draft.style.textColor" type="color"
          /></label>
          <label
            >Fill color<input
              v-model="draft.style.backgroundColor"
              type="color"
          /></label>
          <label
            >Border width<input
              v-model.number="draft.style.borderWidth"
              type="number"
              min="0"
              max="10"
              step=".5"
          /></label>
          <label
            >Corner radius<input
              v-model.number="draft.style.borderRadius"
              type="number"
              min="0"
              max="48"
          /></label>
        </template>
      </details>
      <template v-if="draft.kind === 'quiz' && draft.quiz"
        ><label>Question<input v-model="draft.quiz.question" /></label
        ><label
          >Answers, one per line<textarea v-model="options" rows="3" /></label
        ><label
          >Correct answer index<input
            v-model.number="draft.quiz.answerIndex"
            type="number"
            min="0" /></label
        ><label>Explanation<textarea v-model="draft.quiz.explanation" /></label
        ><label
          >Explanation replay time<input
            type="number"
            min="0"
            :max="w.sequence?.durationSeconds"
            :value="draft.quiz.retryTime"
            @input="
              draft.quiz.retryTime =
                ($event.target as HTMLInputElement).value === ''
                  ? undefined
                  : Number(($event.target as HTMLInputElement).value)
            " /></label></template
      ><template v-if="draft.kind === 'branch' && draft.branch"
        ><label>Button label<input v-model="draft.branch.label" /></label
        ><label
          >Destination<select v-model="draft.branch.targetSequenceId">
            <option v-for="s in w.current?.sequences" :key="s.id" :value="s.id">
              {{ s.title }}
            </option>
          </select></label
        ><label
          >Required checklist item ID<input
            :value="draft.branch.requiresFlag"
            @input="
              draft.branch.requiresFlag =
                ($event.target as HTMLInputElement).value || undefined
            " /></label
        ><label
          >Set viewer flag<input
            :value="draft.branch.setsFlag"
            @input="
              draft.branch.setsFlag =
                ($event.target as HTMLInputElement).value || undefined
            " /></label
      ></template>
      <p v-if="e.agentDraft" class="small-text">
        Agent-filled draft. Check these fields before saving.
      </p>
      <button class="primary">Save cue</button>
      <div class="dialog-actions">
        <button type="button" class="small" @click="w.run(duplicate)">
          <Copy :size="14" />Duplicate</button
        ><button type="button" class="small danger" @click="w.run(remove)">
          <Trash2 :size="14" />Delete
        </button>
      </div>
    </form>
  </aside>
</template>
<style scoped>
.position-controls {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #1b261b;
}
.position-controls summary {
  font-size: 12px;
  font-weight: 600;
}
.position-controls p {
  font-size: 11px;
  line-height: 1.5;
  color: #c1c9bb;
  margin: 9px 0;
}
.position-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}
.position-fields label {
  font-size: 12px;
}
.position-fields input {
  font: 14px monospace;
  padding: 9px;
  min-width: 0;
}
</style>
