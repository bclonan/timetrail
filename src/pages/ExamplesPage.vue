<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useWorkspace } from "../stores/workspace";
import { smokeScenarios, fullPrompt } from "../demo/smokePrompts";
import { recipe, type RecipeId } from "../demo/exampleRecipes";
import { compileProduction } from "../services/ProductionService";
import { proposals } from "../services/ProposalService";
const w = useWorkspace();
const router = useRouter();
const query = ref("");
const category = ref("");
const categories = [...new Set(smokeScenarios.map((s) => s.category))];
const filtered = computed(() =>
  smokeScenarios.filter(
    (s) =>
      (!category.value || s.category === category.value) &&
      `${s.title} ${s.prompt}`
        .toLowerCase()
        .includes(query.value.toLowerCase()),
  ),
);
async function draft(id: RecipeId) {
  const { spec, media } = recipe(id, location.origin);
  const project = await w.create({
    title: spec.title,
    topic: spec.title,
    targetSeconds: spec.sequences[0]!.storyboard.targetSeconds,
  });
  await router.push(`/project/${project.id}`);
  const r = w.requireRecord();
  const result = compileProduction(r.project, spec, media);
  await proposals.create(r, spec.title, result.operations, result.warnings);
  await w.refresh();
  w.notify("Example draft ready. Preview it, then accept to save.");
}
async function copy(text: string) {
  await navigator.clipboard.writeText(text);
  w.notify("Prompt copied. Paste it into your WebMCP agent.");
}
</script>
<template>
  <div class="prompt-page page-width">
    <header class="prompt-hero">
      <div>
        <p class="eyebrow">41 CREATION AND QUALITY SCENARIOS</p>
        <h1>Give your agent a film to make.</h1>
        <p>
          Complete prompts for documentaries, lessons, product films and
          branching stories. Each includes a creation workflow and checks for
          the finished Player.
        </p>
        <div class="creation-actions">
          <a class="button" href="/examples/smoke-prompts.md" download
            >Download all prompts</a
          ><RouterLink class="button" to="/discover"
            >Browse finished examples</RouterLink
          >
        </div>
      </div>
      <RouterLink class="prompt-feature" to="/player/example_europa"
        ><img
          src="/example-assets/europa-orbit.png"
          alt="Artist concept of Europa with Jupiter in the distance"
        /><span>Play Europa · Beneath the silence</span></RouterLink
      >
    </header>
    <details>
      <summary>How to run a full creation test</summary>
      <p>
        Copy a prompt into an agent with access to this page's WebMCP tools. The
        agent can search for media, upload generated files, fill forms and
        propose a complete film. Review the visible draft once it is ready. The
        agent can then verify playback and prepare exports. Image generation and
        web research come from the calling agent's tools.
      </p>
      <p>
        No video supplied? The agent should find relevant footage, preserve its
        credits and use it in the film unless it is generating a video itself.
        Creating still images does not replace finding footage.
      </p>
      <p>
        Finished examples below are authored demonstrations. The 41 prompts are
        a test library, not a claim that every creative brief has already
        passed.
        <a href="/examples/bug-log.md" target="_blank" rel="noopener"
          >Read the release bug log</a
        >.
      </p>
    </details>
    <div class="prompt-toolbar">
      <input
        v-model="query"
        aria-label="Search prompts"
        placeholder="Search a topic, format or test..."
      /><select v-model="category" aria-label="Prompt category">
        <option value="">All scenarios</option>
        <option v-for="c in categories" :key="c">{{ c }}</option></select
      ><span class="muted">{{ filtered.length }} prompts</span>
    </div>
    <div class="prompt-grid">
      <article
        v-for="scenario in filtered"
        :key="scenario.id"
        class="prompt-card"
      >
        <span class="eyebrow">{{ scenario.id }} / {{ scenario.category }}</span>
        <h2>{{ scenario.title }}</h2>
        <p>{{ scenario.prompt }}</p>
        <details>
          <summary>What to verify</summary>
          <ul>
            <li v-for="check in scenario.checks" :key="check">{{ check }}</li>
          </ul>
        </details>
        <footer>
          <button
            class="primary small"
            @click="w.run(() => copy(fullPrompt(scenario)))"
          >
            Copy full prompt</button
          ><template v-if="scenario.recipe"
            ><RouterLink
              class="button small"
              :to="'/player/example_' + scenario.recipe"
              >Play example</RouterLink
            ><button
              class="small"
              @click="w.run(() => draft(scenario.recipe as RecipeId))"
            >
              Create example draft
            </button></template
          >
        </footer>
      </article>
    </div>
  </div>
</template>
