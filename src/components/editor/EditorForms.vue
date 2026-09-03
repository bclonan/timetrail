<script setup lang="ts">
import { computed } from "vue";
import { useEditor } from "../../stores/editor";
import { useWorkspace } from "../../stores/workspace";
import Modal from "../common/Modal.vue";
import LayoutAreaEditor from "./LayoutAreaEditor.vue";
const e = useEditor();
const w = useWorkspace();
const tags = computed({
  get: () => e.project.tags.join(", "),
  set: (value) =>
    (e.project.tags = value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)),
});
</script>
<template>
  <Modal v-if="e.active === 'project'" title="Project details" @close="e.close">
    <form @submit.prevent="w.run(() => e.submit())">
      <label
        >Project title<input v-model="e.project.title" maxlength="300" required
      /></label>
      <label
        >Topic<textarea v-model="e.project.topic" maxlength="8000" />
      </label>
      <label
        >Description<textarea
          v-model="e.project.description"
          maxlength="8000"
        />
      </label>
      <label
        >Audience<input v-model="e.project.audience" maxlength="300"
      /></label>
      <label>Tags, separated by commas<input v-model="tags" /></label>
      <p v-if="e.agentDraft" class="small-text">
        Agent-filled draft. Check these fields before saving.
      </p>
      <div class="dialog-actions">
        <button class="primary">Save project details</button>
      </div>
    </form>
  </Modal>
  <Modal
    v-if="e.active === 'sequence' && e.sequence"
    :title="e.fresh ? 'Create a screen' : 'Edit screen'"
    @close="e.close"
  >
    <form @submit.prevent="w.run(() => e.submit())">
      <label
        >Screen title<input v-model="e.sequence.title" maxlength="300" required
      /></label>
      <label
        >Description<textarea
          v-model="e.sequence.description"
          maxlength="8000"
        />
      </label>
      <div class="form-row">
        <label
          >Duration, seconds<input
            v-model.number="e.sequence.durationSeconds"
            type="number"
            min="0.1"
            max="86400"
            step="0.1"
            required
        /></label>
        <label
          >Media mode<select v-model="e.sequence.baseMode">
            <option>generated-canvas</option>
            <option>mixed</option>
            <option>video</option>
          </select></label
        >
      </div>
      <label
        ><input type="checkbox" v-model="e.sequence.narrationEnabled" />
        Narration enabled</label
      >
      <LayoutAreaEditor v-model="e.sequence.layoutAreas" />
      <p class="small-text muted">
        Each screen has its own timeline. Use a branch cue to connect it to
        another screen.
      </p>
      <p v-if="e.agentDraft" class="small-text">
        Agent-filled draft. Check these fields before saving.
      </p>
      <div class="dialog-actions">
        <button
          v-if="!e.fresh"
          type="button"
          @click="w.run(() => e.submit('duplicate'))"
        >
          Duplicate screen</button
        ><button
          v-if="!e.fresh && e.sequence.id !== w.approved?.activeSequenceId"
          type="button"
          class="danger"
          @click="w.run(() => e.submit('delete'))"
        >
          Delete screen</button
        ><button class="primary">
          {{ e.fresh ? "Create screen" : "Save screen" }}
        </button>
      </div>
    </form>
  </Modal>
</template>
