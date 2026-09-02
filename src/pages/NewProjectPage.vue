<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowRight, Sparkles, Film, Layers } from "lucide-vue-next";
import { useWorkspace } from "../stores/workspace";
const w = useWorkspace();
const router = useRouter();
const topic = ref("");
const title = ref("");
const audience = ref("Curious beginners");
const duration = ref(90);
const mode = ref<"generated-canvas" | "video" | "mixed">("generated-canvas");
const busy = ref(false);
async function create() {
  busy.value = true;
  await w.run(async () => {
    const p = await w.create({
      title: title.value || topic.value || "Untitled project",
      topic: topic.value,
      audience: audience.value,
      targetSeconds: duration.value,
      mode: mode.value,
    });
    await router.push("/project/" + p.id);
  });
  busy.value = false;
}
</script>
<template>
  <div class="new-page page-width">
    <div>
      <p class="eyebrow">A BLANK TIMELINE. A GOOD QUESTION.</p>
      <h1>What is your<br /><em>story about?</em></h1>
      <p class="muted">Start with an idea. Add sources as you go.</p>
      <div class="new-illustration">
        <Layers :size="80" :stroke-width="0.6" />
      </div>
    </div>
    <form class="new-form panel" @submit.prevent="create">
      <label
        >Topic<textarea
          v-model="topic"
          rows="2"
          placeholder="How DNA becomes a protein"
          maxlength="8000"
          required
        /></label
      ><label
        >Project title<input
          v-model="title"
          placeholder="Give your film a name"
          maxlength="300"
      /></label>
      <div class="form-row">
        <label>For whom?<input v-model="audience" maxlength="300" /></label
        ><label
          >Duration, seconds<input
            v-model.number="duration"
            type="number"
            min="10"
            max="3600"
            required
        /></label>
      </div>
      <fieldset>
        <legend>Start with</legend>
        <div class="mode-options">
          <label :class="{ selected: mode === 'generated-canvas' }"
            ><input
              v-model="mode"
              type="radio"
              value="generated-canvas"
            /><Sparkles :size="21" /><strong>Generated cards</strong
            ><span>Works offline</span></label
          ><label :class="{ selected: mode === 'video' }"
            ><input v-model="mode" type="radio" value="video" /><Film
              :size="21"
            /><strong>Video</strong><span>Your footage</span></label
          ><label :class="{ selected: mode === 'mixed' }"
            ><input v-model="mode" type="radio" value="mixed" /><Layers
              :size="21"
            /><strong>A mix</strong><span>Bring both</span></label
          >
        </div>
      </fieldset>
      <button class="primary large" :disabled="busy">
        {{ busy ? "Creating..." : "Create project" }}<ArrowRight :size="18" />
      </button>
      <p class="muted small-text">
        Saved in this browser. No account or API key needed.
      </p>
    </form>
  </div>
</template>
