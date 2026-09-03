<script setup lang="ts">
import { ref } from "vue";
import { useWorkspace } from "../../stores/workspace";
import {
  searchMedia,
  resolveNasa,
  type MediaResult,
} from "../../services/MediaSearchService";
import { mediaFromUrl } from "../../services/MediaImportService";
import { fetchAsset } from "../../services/AssetTransferService";
import Modal from "../common/Modal.vue";
const w = useWorkspace();
const open = ref(false),
  busy = ref(false);
const query = ref("");
const provider = ref<"nasa" | "commons">("nasa");
const type = ref<"video" | "image" | "audio">("video");
const results = ref<MediaResult[]>([]);
const searched = ref(false);
async function search() {
  busy.value = true;
  try {
    results.value = await searchMedia({
      query: query.value,
      provider: provider.value,
      type: type.value,
    });
    searched.value = true;
  } finally {
    busy.value = false;
  }
}
async function add(item: MediaResult, download: boolean) {
  const r = w.requireRecord();
  busy.value = true;
  try {
    const url =
      item.provider === "nasa"
        ? await resolveNasa(item.id, item.type)
        : item.url;
    if (!url)
      throw new Error("No supported file is available for this result.");
    const filename = decodeURIComponent(
      new URL(url).pathname.split("/").pop() || "media.mp4",
    )
      .slice(0, 180)
      .replace(/[\\/]/g, "_");
    const m = download
      ? await fetchAsset({ url, name: filename, attribution: item.attribution })
      : mediaFromUrl(url, item.title);
    m.name = item.title;
    m.type = item.type;
    m.attribution = item.attribution;
    await w.commit([{ type: "upsert_media", value: m }], {
      projectId: r.project.id,
      revision: r.revision,
    });
    w.notify(
      download
        ? "Downloaded to your media library."
        : "Source added with credits.",
    );
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <button class="small" @click="open = true">Find media</button>
  <Modal v-if="open" title="Find footage and images" @close="open = false">
    <form @submit.prevent="w.run(search)">
      <label
        >Search topic<input
          v-model="query"
          required
          placeholder="Europa, ocean, Tokyo..."
      /></label>
      <div class="prompt-toolbar">
        <select v-model="provider" aria-label="Media provider">
          <option value="nasa">NASA</option>
          <option value="commons">Wikimedia Commons</option></select
        ><select v-model="type" aria-label="Media type">
          <option value="video">Video</option>
          <option value="image">Images</option>
          <option value="audio">Audio</option></select
        ><button :disabled="busy" class="primary">
          {{ busy ? "Working..." : "Search" }}
        </button>
      </div>
    </form>
    <p class="small-text muted">
      Check each source's credits before reuse. Download keeps a local copy for
      portable exports, up to 100 MB.
    </p>
    <p v-if="searched && !results.length">
      No results. Try another search or provider.
    </p>
    <div class="source-results">
      <article v-for="result in results" :key="result.id" class="source-result">
        <img v-if="result.thumbnail" :src="result.thumbnail" alt="" />
        <div>
          <h3>{{ result.title }}</h3>
          <p>{{ result.description }}</p>
          <p>
            {{ result.attribution.creator }} · {{ result.attribution.license }}
          </p>
          <div class="creation-actions">
            <button :disabled="busy" @click="w.run(() => add(result, false))">
              Add source</button
            ><button :disabled="busy" @click="w.run(() => add(result, true))">
              Download file
            </button>
          </div>
        </div>
      </article>
    </div>
  </Modal>
</template>
