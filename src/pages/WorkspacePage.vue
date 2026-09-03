<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import {
  Undo2,
  Redo2,
  Play,
  Download,
  Share2,
  PanelLeft,
  ChevronDown,
  Copy,
  RotateCcw,
  ArrowRight,
  Sparkles,
  Plus,
} from "lucide-vue-next";
import { useEditor } from "../stores/editor";
import EditorForms from "../components/editor/EditorForms.vue";
import { useWorkspace } from "../stores/workspace";
import { registeredNames } from "../webmcp/registry";
import { judgePrompt } from "../demo/demoProject";
import {
  exportFormats,
  exportLabels,
  type ExportFormat,
} from "../services/ExportService";
import { storage } from "../storage/BrowserWorkspaceStore";
import Player from "../components/player/Player.vue";
import ContextStack from "../components/context/ContextStack.vue";
import CueInspector from "../components/context/CueInspector.vue";
import MediaLibrary from "../components/media/MediaLibrary.vue";
import Timeline from "../components/timeline/Timeline.vue";
import ProposalReview from "../components/proposals/ProposalReview.vue";
import ProductionControls from "../components/editor/ProductionControls.vue";
import QualityReview from "../components/editor/QualityReview.vue";
import FrameEditStudio from "../components/editor/FrameEditStudio.vue";
const w = useWorkspace();
const route = useRoute();
const router = useRouter();
const isDemo = computed(() => route.path === "/demo");
const format = ref<ExportFormat>("project-json");
const quota = ref("");
const e = useEditor();
watch(
  () => w.selectedCue,
  (value) => {
    if (
      value &&
      (e.active !== "cue" || e.cue?.id !== value) &&
      w.approved?.sequences.some((s) => s.cues.some((c) => c.id === value))
    )
      e.open("cue", value);
  },
);
watch(
  () => route.fullPath,
  () =>
    w.run(async () => {
      e.close();
      if (isDemo.value) await w.demo();
      else if (route.params.projectId)
        await w.load(String(route.params.projectId));
      const q = await storage.quota();
      quota.value = q.quota
        ? `${((q.usage || 0) / 1024 / 1024).toFixed(1)} MB of ${(q.quota / 1024 / 1024 / 1024).toFixed(1)} GB available storage`
        : "Local browser storage";
    }),
  { immediate: true },
);
async function reset() {
  if (
    await w.ask(
      "Reset the demo?",
      "This replaces the bundled DNA demo and clears only its proposals. Your other projects stay saved.",
      "Reset demo",
    )
  )
    await w.demo(true);
}
async function live() {
  const p = await w.create({
    title: "CRISPR, explained",
    topic: "How CRISPR works",
    targetSeconds: 90,
    mode: "mixed",
  });
  await router.push("/project/" + p.id);
}
async function copyPrompt() {
  await navigator.clipboard.writeText(judgePrompt);
  w.notify("Judge prompt copied.");
}
async function share() {
  if (
    await w.ask(
      "Make a share code?",
      "This includes approved text and remote URLs. Anyone with the code can view the story.",
      "Generate share code",
    )
  )
    await w.prepareShare();
}
</script>
<template>
  <div class="studio">
    <section v-if="isDemo" class="demo-banner">
      <div>
        <span class="eyebrow">THE TWO-MINUTE TOUR</span>
        <h1>From a question to an interactive film.</h1>
        <p>
          Explore the offline DNA story, then invite an agent to build one with
          you.
        </p>
      </div>
      <div class="demo-actions">
        <RouterLink to="/webmcp" class="button small"
          >{{ registeredNames.length }} structured tools<ArrowRight
            :size="14" /></RouterLink
        ><button class="small" @click="w.run(copyPrompt)">
          <Copy :size="14" />Copy judge prompt</button
        ><button class="small" @click="w.run(live)">
          Start empty live demo</button
        ><button
          class="icon-button"
          aria-label="Reset demo"
          @click="w.run(reset)"
        >
          <RotateCcw :size="16" />
        </button>
      </div>
      <details>
        <summary>Read the agent prompt</summary>
        <p>{{ judgePrompt }}</p>
      </details>
    </section>
    <template v-if="w.approved && !w.loading"
      ><header class="command-bar">
        <div class="project-title">
          <button
            class="icon-button"
            aria-label="Toggle media library"
            :aria-expanded="w.mediaOpen"
            @click="w.mediaOpen = !w.mediaOpen"
          >
            <PanelLeft :size="18" />
          </button>
          <div>
            <button class="title-button" @click="e.open('project')">
              {{ w.approved.title }}<ChevronDown :size="13" /></button
            ><span class="save-status"
              ><span class="small-dot" />Saved on this device · revision
              {{ w.record?.revision }}</span
            >
          </div>
        </div>
        <div class="command-actions">
          <button
            class="icon-button"
            :disabled="!w.record?.past.length"
            aria-label="Undo"
            @click="w.run(() => w.undo('undo'))"
          >
            <Undo2 :size="17" /></button
          ><button
            class="icon-button"
            :disabled="!w.record?.future.length"
            aria-label="Redo"
            @click="w.run(() => w.undo('redo'))"
          >
            <Redo2 :size="17" /></button
          ><span class="bar-divider" /><RouterLink
            :to="'/watch/' + w.approved.id"
            class="button small subtle"
            ><Play :size="15" />Watch</RouterLink
          ><select
            v-model="format"
            aria-label="Export format"
            class="compact-select"
          >
            <option v-for="f in exportFormats" :key="f" :value="f">
              {{ exportLabels[f] }}
            </option></select
          ><button class="small" @click="w.run(() => w.prepareExport(format))">
            <Download :size="15" />Export</button
          ><button class="small primary" @click="w.run(share)">
            <Share2 :size="15" />Share
          </button>
        </div>
      </header>
      <ProductionControls />
      <QualityReview />
      <FrameEditStudio />
      <div class="editor-layout" :class="{ 'library-closed': !w.mediaOpen }">
        <MediaLibrary v-if="w.mediaOpen" />
        <div class="preview-column">
          <div class="preview-heading">
            <span class="eyebrow">{{
              w.previewProject ? "PROPOSED VERSION" : "APPROVED PREVIEW"
            }}</span
            ><select v-model="w.sequenceId" aria-label="Active sequence">
              <option
                v-for="s in w.current?.sequences"
                :key="s.id"
                :value="s.id"
              >
                {{ s.title }}
              </option></select
            ><button
              class="text-button"
              @click="e.open('sequence', w.sequence?.id)"
            >
              Edit screen</button
            ><button class="text-button" @click="e.open('sequence')">
              New screen</button
            ><span class="preview-engine">FrameTrail</span>
          </div>
          <Player />
          <div class="chapter-strip" aria-label="Chapter navigation">
            <button
              v-for="(c, i) in w.sequence?.cues.filter(
                (c) => c.kind === 'chapter',
              )"
              :key="c.id"
              :class="{
                current: w.time >= c.start && w.time < (c.end || Infinity),
              }"
              @click="w.playback('seek', c.start)"
            >
              <span>{{ String(i + 1).padStart(2, "0") }}</span
              >{{ c.title }}</button
            ><span v-if="!w.sequence?.clips.length" class="muted small-text"
              >Add a card or media to start your timeline.</span
            >
          </div>
          <div class="agent-toolbar">
            <div>
              <Sparkles :size="16" /><span
                >Have an agent draft the next scene.</span
              >
            </div>
            <button class="small" @click="w.run(w.sample)">
              Load sample proposal</button
            ><span class="fallback-label">Demo fallback</span>
          </div>
          <ProposalReview />
        </div>
        <CueInspector v-if="e.active === 'cue'" /><ContextStack v-else />
      </div>
      <Timeline /><EditorForms />
      <footer class="studio-footer">
        <span>{{ quota }}</span
        ><span>Local-first studio <span class="small-dot" /> No uploads</span
        ><button class="text-button" @click="e.open('cue')">
          <Plus :size="12" />Add context
        </button>
      </footer></template
    >
    <div v-else class="page-loading">
      {{
        w.loading
          ? "Opening your studio..."
          : "Choose a project to get started."
      }}
    </div>
  </div>
</template>
