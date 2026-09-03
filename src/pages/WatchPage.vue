<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import {
  ArrowLeft,
  Share2,
  Download,
  Maximize,
  RotateCcw,
} from "lucide-vue-next";
import { useWorkspace } from "../stores/workspace";
import { shares } from "../services/ShareService";
import { gallery } from "../services/GalleryService";
import { storage } from "../storage/BrowserWorkspaceStore";
import { defaultPresentation } from "../domain/presentation";
import Player from "../components/player/Player.vue";
import PlayerPanels from "../components/player/PlayerPanels.vue";
import ContextStack from "../components/context/ContextStack.vue";
import {
  exportFormats,
  exportLabels,
  type ExportFormat,
} from "../services/ExportService";
const exportFormat = ref<ExportFormat>("interactive-zip");
const route = useRoute();
const router = useRouter();
const w = useWorkspace();
const ready = ref(false);
const container = ref<HTMLElement>();
const presentation = computed(
  () => w.approved?.presentation || defaultPresentation(),
);
const view = computed(
  () =>
    presentation.value.views.find((v) => v.id === w.playerViewId) ||
    presentation.value.views[0]!,
);
const chapters = computed(
  () => w.sequence?.cues.filter((c) => c.kind === "chapter") || [],
);
const chapter = computed(() =>
  chapters.value.find((c) => w.time >= c.start && w.time < (c.end ?? Infinity)),
);
watch(
  [() => route.path, () => route.hash],
  () =>
    w.run(async () => {
      ready.value = false;
      const code = new URLSearchParams(location.hash.split("?")[1] || "").get(
        "tt",
      );
      if (code) w.loadEphemeral(shares.decode(code));
      else {
        const pid = String(route.params.projectId);
        const local = await storage.record(pid);
        if (local) await w.load(pid);
        else {
          const item = (await gallery.list()).find((i) => i.id === pid);
          if (!item)
            throw new Error(
              "This film could not be found. Open the film library or use its share link.",
            );
          w.loadEphemeral(await gallery.open(item));
        }
      }
      w.playerViewId = String(
        route.query.view || presentation.value.defaultViewId,
      );
      ready.value = true;
    }),
  { immediate: true },
);
watch(
  () => w.playerViewId,
  (id) => {
    if (ready.value && route.query.view !== id)
      void router.replace({
        query: { ...route.query, view: id },
        hash: route.hash,
      });
  },
);
watch(
  () => route.query.view,
  (id) => {
    if (id) w.playerViewId = String(id);
  },
);
function replay() {
  w.viewerFlags = {};
  w.quizAnswers = {};
  w.history = [];
  if (w.sequenceId === w.approved?.activeSequenceId) w.playback("seek", 0);
  else {
    w.sequenceId = w.approved!.activeSequenceId;
    w.time = 0;
  }
}
function keyboard(event: KeyboardEvent) {
  if (
    (event.target as HTMLElement)?.closest(
      "input,textarea,select,button,a,[contenteditable],dialog,[role=dialog]",
    )
  )
    return;
  if (!w.playerReady || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === " ") {
    event.preventDefault();
    w.playback(w.paused ? "play" : "pause");
  }
  if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    w.playback(
      "seek",
      Math.max(
        0,
        Math.min(
          w.sequence!.durationSeconds,
          w.time + (event.key === "ArrowRight" ? 5 : -5),
        ),
      ),
    );
  }
}
onMounted(() => window.addEventListener("keydown", keyboard));
onBeforeUnmount(() => window.removeEventListener("keydown", keyboard));
</script>
<template>
  <div
    v-if="ready && w.approved"
    ref="container"
    class="film-player"
    :class="[
      'view-' + view.layout,
      'theme-' + view.theme,
      { portrait: view.aspect === '9:16' },
    ]"
    :style="{
      '--viewer-accent': view.accent,
      '--viewer-aspect': view.aspect.replace(':', '/'),
    }"
  >
    <header class="film-topbar">
      <RouterLink to="/discover" class="back-link"
        ><ArrowLeft :size="16" />Film library</RouterLink
      >
      <span class="eyebrow">{{
        w.ephemeral ? "SHARED FILM · READ-ONLY" : "TIMETRAIL PLAYER"
      }}</span>
      <div class="film-actions">
        <button class="small" @click="w.run(() => w.prepareShare())">
          <Share2 :size="14" />Share
        </button>
        <select
          v-model="exportFormat"
          aria-label="Export format"
          class="compact-select"
        >
          <option v-for="format in exportFormats" :key="format" :value="format">
            {{ exportLabels[format] }}
          </option>
        </select>
        <button
          class="small"
          @click="w.run(() => w.prepareExport(exportFormat))"
        >
          <Download :size="14" />Export film
        </button>
        <button
          class="icon-button"
          aria-label="Fullscreen film and panels"
          @click="w.run(() => container?.requestFullscreen())"
        >
          <Maximize :size="17" />
        </button>
      </div>
    </header>
    <header class="film-heading">
      <div>
        <p class="eyebrow">
          {{ w.approved.tags.join(" / ") || "AN INTERACTIVE FILM" }}
        </p>
        <h1>{{ w.approved.title }}</h1>
        <p>{{ w.approved.description || w.approved.topic }}</p>
      </div>
      <nav class="view-switcher" aria-label="Player views">
        <button
          v-for="v in presentation.views"
          :key="v.id"
          :aria-pressed="view.id === v.id"
          @click="w.playerViewId = v.id"
        >
          {{ v.name }}
        </button>
      </nav>
    </header>
    <div class="film-layout">
      <section class="film-stage">
        <Player />
        <div class="now-chapter">
          <div>
            <span class="eyebrow">NOW PLAYING</span>
            <h2>{{ chapter?.title || w.sequence?.title }}</h2>
          </div>
          <button class="small" @click="replay">
            <RotateCcw :size="14" />Start again
          </button>
        </div>
        <nav
          v-if="view.chapters"
          class="watch-chapters"
          aria-label="Chapter rail"
        >
          <button
            v-for="(c, i) in chapters"
            :key="c.id"
            :class="{ current: chapter?.id === c.id }"
            @click="w.playback('seek', c.start)"
          >
            <span>{{ String(i + 1).padStart(2, "0") }}</span
            ><strong>{{ c.title }}</strong
            ><span>{{ Math.floor(c.start) }}s</span>
          </button>
        </nav>
      </section>
      <aside class="film-sidebar">
        <PlayerPanels :view="view" /><ContextStack v-if="view.context" />
      </aside>
    </div>
    <footer class="watch-footer">
      {{ w.approved.provenance.creator }} · {{ w.approved.provenance.license
      }}<span>Space to play or pause · Arrow keys to seek</span>
    </footer>
  </div>
  <div v-else class="page-loading">
    {{ w.error || "Opening your film..."
    }}<RouterLink v-if="w.error" to="/discover">Open film library</RouterLink>
  </div>
</template>
