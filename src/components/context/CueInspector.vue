<script setup lang="ts">
import { computed } from "vue";
import { X, Copy, Trash2 } from "lucide-vue-next";
import { useWorkspace } from "../../stores/workspace";
import { useEditor } from "../../stores/editor";
import { kinds } from "../../domain/model";
const w = useWorkspace();
const e = useEditor();
const draft = computed(() => e.cue);
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
      <details>
        <summary>Position in player</summary>
        <button
          type="button"
          class="small"
          @click="draft.position = { x: 5, y: 5, width: 30, height: 30 }"
        >
          Set position
        </button>
        <div v-if="draft.position" class="form-row">
          <label
            v-for="field in ['x', 'y', 'width', 'height'] as const"
            :key="field"
            >{{ field
            }}<input
              v-model.number="draft.position[field]"
              type="number"
              min="0"
              max="100"
          /></label>
        </div>
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
        ><label
          >Explanation<textarea
            v-model="draft.quiz.explanation"
          /></label></template
      ><template v-if="draft.kind === 'branch' && draft.branch"
        ><label>Button label<input v-model="draft.branch.label" /></label
        ><label
          >Destination<select v-model="draft.branch.targetSequenceId">
            <option v-for="s in w.current?.sequences" :key="s.id" :value="s.id">
              {{ s.title }}
            </option>
          </select></label
        ></template
      >
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
