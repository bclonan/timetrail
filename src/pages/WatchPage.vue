<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import { ArrowLeft, Copy, GitFork, ArrowRight } from "lucide-vue-next";
import { useWorkspace } from "../stores/workspace";
import { shares } from "../services/ShareService";
import { gallery } from "../services/GalleryService";
import { storage } from "../storage/BrowserWorkspaceStore";
import Player from "../components/player/Player.vue";
import ContextStack from "../components/context/ContextStack.vue";
const route = useRoute();
const router = useRouter();
const w = useWorkspace();
const ready = ref(false);
const chapter = computed(() =>
  w.sequence?.cues.find(
    (c) =>
      c.kind === "chapter" && w.time >= c.start && w.time < (c.end || Infinity),
  ),
);
watch(
  () => route.fullPath,
  () =>
    w.run(async () => {
      ready.value = false;
      const hash = new URLSearchParams(location.hash.split("?")[1] || "");
      const code = hash.get("tt");
      if (code) {
        w.loadEphemeral(shares.decode(code));
      } else {
        const pid = String(route.params.projectId);
        const local = await storage.record(pid);
        if (local) await w.load(pid);
        else {
          const item = (await gallery.list()).find((i) => i.id === pid);
          if (!item) throw new Error("This film could not be found.");
          w.loadEphemeral(await gallery.open(item));
        }
      }
      ready.value = true;
    }),
  { immediate: true },
);
async function remix() {
  const p = await w.remix();
  await router.push("/project/" + p.id);
}
async function copy() {
  const code = shares.encode(w.approved!);
  await navigator.clipboard.writeText(code);
  w.notify("Share code copied.");
}
</script>
<template>
  <div v-if="ready && w.approved" class="watch-page page-width">
    <header class="watch-title">
      <div>
        <RouterLink to="/discover" class="back-link"
          ><ArrowLeft :size="14" />All stories</RouterLink
        >
        <p class="eyebrow">
          {{
            w.ephemeral ? "SHARED FILM · READ-ONLY" : "YOUR INTERACTIVE FILM"
          }}
        </p>
        <h1>{{ w.approved.title }}</h1>
        <p>{{ w.approved.description || w.approved.topic }}</p>
      </div>
      <div class="watch-actions">
        <button @click="w.run(copy)"><Copy :size="15" />Copy share code</button
        ><button class="primary" @click="w.run(remix)">
          <GitFork :size="16" />Remix{{ w.ephemeral ? " & save locally" : "" }}
        </button>
      </div>
    </header>
    <div class="watch-layout">
      <div>
        <Player />
        <div class="now-chapter">
          <span class="eyebrow">CURRENT CHAPTER</span>
          <h2>{{ chapter?.title || w.sequence?.title }}</h2>
        </div>
        <nav class="watch-chapters" aria-label="Chapter rail">
          <button
            v-for="(c, i) in w.sequence?.cues.filter(
              (c) => c.kind === 'chapter',
            )"
            :key="c.id"
            :class="{ current: chapter?.id === c.id }"
            @click="w.playback('seek', c.start)"
          >
            <span>{{ String(i + 1).padStart(2, "0") }}</span
            ><strong>{{ c.title }}</strong
            ><span>{{ Math.floor(c.start) }}s</span><ArrowRight :size="16" />
          </button>
        </nav>
      </div>
      <ContextStack />
    </div>
    <footer class="watch-footer">
      Made with TimeTrail · {{ w.approved.provenance.license }} ·
      {{ w.approved.provenance.creator
      }}<RouterLink v-if="!w.ephemeral" :to="'/project/' + w.approved.id"
        >Back to studio<ArrowRight :size="14"
      /></RouterLink>
    </footer>
  </div>
  <div v-else class="page-loading">Opening your film...</div>
</template>
