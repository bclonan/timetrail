<script setup lang="ts">
import { ref } from "vue";
import { useWorkspace } from "../../stores/workspace";
import { clone, type ProjectRecord } from "../../domain/model";
import {
  defaultPresentation,
  presentationSchema,
  type Presentation,
} from "../../domain/presentation";
import { compileProduction } from "../../services/ProductionService";
import { proposals } from "../../services/ProposalService";
import Modal from "../common/Modal.vue";
const w = useWorkspace();
const mode = ref<"" | "views" | "spec">("");
const draft = ref<Presentation>(defaultPresentation());
const spec = ref("");
const panelJson = ref("");
let base: ProjectRecord;
function open(next: "views" | "spec") {
  base = w.requireRecord();
  mode.value = next;
  draft.value = clone(base.project.presentation || defaultPresentation());
  panelJson.value = JSON.stringify(draft.value.panels, null, 2);
  spec.value = JSON.stringify(
    {
      title: base.project.title,
      description: base.project.description,
      sequences: [
        {
          key: "main",
          storyboard: {
            title: base.project.title,
            topic: base.project.topic,
            targetSeconds: 60,
            segments: [
              {
                title: "Opening",
                summary: "Write your opening here.",
                narration: "Write the narration here.",
              },
              { title: "The idea", summary: "Explain the idea with a source." },
              {
                title: "Takeaway",
                summary: "Give the viewer something to remember.",
              },
            ],
          },
        },
      ],
      presentation: draft.value,
    },
    null,
    2,
  );
}
function addView() {
  if (draft.value.views.length >= 8) return;
  draft.value.views.push({
    ...clone(draft.value.views[0]!),
    id: `view_${Date.now()}`,
    name: "New view",
  });
}
async function save() {
  if (mode.value === "views") {
    draft.value.panels = JSON.parse(panelJson.value);
    await w.commit(
      [
        {
          type: "set_presentation",
          value: presentationSchema.parse(draft.value),
        },
      ],
      { projectId: base.project.id, revision: base.revision },
    );
  } else {
    if (
      w.approved?.id !== base.project.id ||
      w.record?.revision !== base.revision
    )
      throw new Error(
        "Project changed. Reopen this form before creating a proposal.",
      );
    const available = [...base.project.media];
    for (const p of w.pending)
      for (const op of p.operations)
        if (
          op.type === "upsert_media" &&
          !available.some((m) => m.id === op.value.id)
        )
          available.push(op.value);
    const result = compileProduction(
      base.project,
      JSON.parse(spec.value),
      available,
    );
    await proposals.create(
      base,
      "Create film from specification",
      result.operations,
      result.warnings,
    );
    await w.refresh();
    w.notify("Film proposal ready for preview and review.");
  }
  mode.value = "";
}
</script>
<template>
  <div class="creation-actions">
    <button class="small" @click="open('views')">Player views</button
    ><button class="small" @click="open('spec')">Build from spec</button>
  </div>
  <Modal
    v-if="mode"
    :title="mode === 'views' ? 'Design Player views' : 'Build a complete film'"
    @close="mode = ''"
  >
    <template v-if="mode === 'views'">
      <p>
        Each view uses the same film. Change its layout, colors and supporting
        panels.
      </p>
      <label
        >Default view<select v-model="draft.defaultViewId">
          <option v-for="v in draft.views" :key="v.id" :value="v.id">
            {{ v.name }}
          </option>
        </select></label
      >
      <div v-for="v in draft.views" :key="v.id" class="view-editor-row">
        <label>View name<input v-model="v.name" maxlength="60" /></label>
        <label
          >Layout<select v-model="v.layout">
            <option>cinema</option>
            <option>research</option>
            <option>classroom</option>
            <option>explorer</option>
          </select></label
        >
        <label
          >Theme<select v-model="v.theme">
            <option>midnight</option>
            <option>paper</option>
            <option>forest</option>
          </select></label
        >
        <label
          >Picture shape<select v-model="v.aspect">
            <option>16:9</option>
            <option>9:16</option>
            <option>1:1</option>
          </select></label
        >
        <label>Accent<input v-model="v.accent" type="color" /></label>
        <div>
          <label
            ><input v-model="v.context" type="checkbox" />Timed context</label
          ><label><input v-model="v.chapters" type="checkbox" />Chapters</label>
        </div>
        <fieldset>
          <legend>Panels</legend>
          <label v-for="panel in draft.panels" :key="panel.id"
            ><input v-model="v.panels" type="checkbox" :value="panel.id" />{{
              panel.title
            }}</label
          >
        </fieldset>
        <button
          :disabled="draft.views.length === 1 || draft.defaultViewId === v.id"
          @click="draft.views = draft.views.filter((item) => item.id !== v.id)"
        >
          Remove view
        </button>
      </div>
      <button :disabled="draft.views.length >= 8" @click="addView">
        Add view
      </button>
      <details>
        <summary>Panel content as structured data</summary>
        <p>
          Use text, facts, chart, map, checklist, transcript, score or timer
          panels. The prompt library includes complete examples.
        </p>
        <textarea
          v-model="panelJson"
          aria-label="Panel data"
          rows="12"
          class="code-input"
        />
      </details>
    </template>
    <template v-else
      ><p>
        Paste a production specification from your agent or the prompt library.
        This creates a draft for review.
      </p>
      <label
        >Production specification<textarea
          v-model="spec"
          rows="18"
          spellcheck="false"
          class="code-input"
        /></label
    ></template>
    <div class="dialog-actions">
      <button @click="mode = ''">Cancel</button
      ><button class="primary" @click="w.run(save)">
        {{ mode === "views" ? "Save views" : "Create proposal" }}
      </button>
    </div>
  </Modal>
</template>
