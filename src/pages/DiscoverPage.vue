<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter, RouterLink } from "vue-router";
import {
  Search,
  ArrowUpRight,
  Film,
  GitFork,
  ArrowRight,
} from "lucide-vue-next";
import {
  gallery,
  searchGallery,
  type GalleryItem,
} from "../services/GalleryService";
import { useWorkspace } from "../stores/workspace";
const w = useWorkspace();
const shared = computed(() => (w.ephemeral ? w.approved : undefined));
const router = useRouter();
const query = ref("");
const tag = ref("");
const items = ref<GalleryItem[]>([]);
const warnings = ref<string[]>([]);
const tags = computed(() => [...new Set(items.value.flatMap((i) => i.tags))]);
const filtered = computed(() =>
  searchGallery(items.value, query.value, tag.value ? [tag.value] : []),
);
onMounted(() =>
  w.run(async () => {
    items.value = await gallery.list();
    warnings.value = gallery.warnings;
  }),
);
async function remix(item: GalleryItem) {
  const p = await gallery.open(item);
  w.loadEphemeral(p);
  const copy = await w.remix();
  await router.push("/project/" + copy.id);
}
async function saveShared() {
  const copy = await w.remix();
  await router.push("/project/" + copy.id);
}
</script>
<template>
  <div class="discover page-width">
    <header class="discover-header">
      <div>
        <p class="eyebrow">A COLLECTION OF CURIOSITIES</p>
        <h1>Follow a new <em>trail.</em></h1>
        <p class="muted">
          Stories worth exploring. Ideas worth making your own.
        </p>
      </div>
      <RouterLink to="/new" class="button"
        >Create a story<ArrowRight :size="16"
      /></RouterLink>
    </header>
    <div class="search-bar">
      <Search :size="20" /><input
        v-model="query"
        aria-label="Search creations"
        placeholder="Search topics, titles, or ideas..."
      /><select v-model="tag" aria-label="Filter by topic">
        <option value="">All topics</option>
        <option v-for="t in tags" :key="t">{{ t }}</option>
      </select>
    </div>
    <p v-for="warning in warnings" :key="warning" class="warning-text">
      {{ warning }}
    </p>
    <section
      v-if="shared"
      class="proposal-card"
      aria-label="Film from the Player"
    >
      <p class="eyebrow">FROM THE PLAYER</p>
      <h2>{{ shared.title }}</h2>
      <p>Save your own copy to edit this shared film.</p>
      <button @click="w.run(saveShared)">Save shared copy</button>
    </section>
    <section
      v-for="source in ['local', 'published']"
      :key="source"
      class="gallery-section"
    >
      <div class="section-title">
        <h2>
          {{ source === "local" ? "On this device" : "Published examples" }}
        </h2>
        <span class="muted small-text">{{
          source === "local"
            ? "Your browser workspace"
            : "External catalog content is untrusted"
        }}</span>
      </div>
      <div class="project-grid">
        <article
          v-for="item in filtered.filter((i) => i.source === source)"
          :key="item.id"
          class="project-card"
        >
          <RouterLink :to="'/watch/' + item.id" class="project-thumbnail"
            ><img v-if="item.thumbnail" :src="item.thumbnail" alt="" /><Film
              v-else
              :size="42"
            /><span class="duration-pill"
              >{{ item.durationSeconds }}s</span
            ></RouterLink
          >
          <div class="card-tags">
            <span v-for="t in item.tags.slice(0, 3)" :key="t">{{ t }}</span>
          </div>
          <h3>
            <RouterLink :to="'/watch/' + item.id">{{ item.title }}</RouterLink>
          </h3>
          <p>
            {{
              item.summary ||
              "An interactive story, ready for its next chapter."
            }}
          </p>
          <footer>
            <RouterLink
              :to="
                source === 'local' ? '/project/' + item.id : '/watch/' + item.id
              "
              >{{ source === "local" ? "Open studio" : "Watch film"
              }}<ArrowUpRight :size="15" /></RouterLink
            ><button class="text-button" @click="w.run(() => remix(item))">
              <GitFork :size="14" />Remix
            </button>
          </footer>
        </article>
      </div>
      <p
        v-if="!filtered.some((i) => i.source === source)"
        class="empty-gallery"
      >
        {{
          query
            ? "No stories match that search."
            : "No stories here yet. Your next one could be the first."
        }}
      </p>
    </section>
  </div>
</template>
