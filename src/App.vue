<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { RouterLink } from "vue-router";
import {
  ArrowUpRight,
  Download,
  Check,
  Film,
  Plus,
  Compass,
  FlaskConical,
  Play,
  Copy,
} from "lucide-vue-next";
import { useWorkspace } from "./stores/workspace";
import { nativeStatus } from "./webmcp/registry";
import Modal from "./components/common/Modal.vue";
const w = useWorkspace();
const exportOpen = ref(false);
const shareOpen = ref(false);
const downloadUrl = ref("");
const saveState = computed(() =>
  w.activity ? "Agent working" : nativeStatus.value,
);
watch(
  () => w.prepared,
  (p) => {
    if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value);
    if (p) {
      downloadUrl.value = URL.createObjectURL(p.blob);
      exportOpen.value = true;
    }
  },
);
watch(
  () => w.shareVersion,
  () => {
    if (w.shareCode) shareOpen.value = true;
  },
);
onBeforeUnmount(() => {
  if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value);
});
async function copy(text: string) {
  await navigator.clipboard.writeText(text);
  w.notify("Copied to clipboard.");
}
async function folderExport() {
  const pick = (window as any).showDirectoryPicker;
  if (!pick)
    throw new Error("Folder export is unavailable. Use Download instead.");
  const dir = await pick({ mode: "readwrite" });
  if (!w.prepared) return;
  const handle = await dir.getFileHandle(w.prepared.filename, { create: true });
  const writer = await handle.createWritable();
  await writer.write(w.prepared.blob);
  await writer.close();
  w.notify("Export saved to your selected folder.");
}
</script>
<template>
  <a class="skip" href="#main">Skip to content</a>
  <header class="app-header">
    <RouterLink to="/" class="brand"
      ><span class="brand-mark"><Film :size="20" /></span>TimeTrail<span
        class="beta"
        >STUDIO</span
      ></RouterLink
    >
    <nav aria-label="Main navigation">
      <RouterLink to="/discover"><Compass :size="16" />Discover</RouterLink
      ><RouterLink to="/demo"><Play :size="15" />Demo</RouterLink
      ><RouterLink to="/webmcp"
        ><FlaskConical :size="16" />WebMCP Lab</RouterLink
      >
    </nav>
    <div class="header-right">
      <span class="connection" :class="{ working: w.activity }"
        ><i />{{ saveState }}</span
      ><RouterLink to="/new" class="button small"
        ><Plus :size="15" />New project</RouterLink
      >
    </div>
  </header>
  <main id="main"><RouterView /></main>
  <div v-if="w.error" class="toast error" role="alert">
    <span>{{ w.error }}</span
    ><button @click="w.error = ''" aria-label="Dismiss error">Dismiss</button>
  </div>
  <div v-else-if="w.toast" class="toast" role="status">
    <Check :size="17" /><span>{{ w.toast }}</span
    ><button @click="w.toast = ''" aria-label="Dismiss notification">
      Dismiss
    </button>
  </div>
  <Modal
    v-if="w.confirmation"
    :title="w.confirmation.title"
    @close="w.confirmation?.resolve(false)"
    ><p>{{ w.confirmation.body }}</p>
    <div class="dialog-actions">
      <button @click="w.confirmation?.resolve(false)">Cancel</button
      ><button class="primary" @click="w.confirmation?.resolve(true)">
        {{ w.confirmation.confirmLabel }}
      </button>
    </div></Modal
  >
  <Modal
    v-if="exportOpen && w.prepared"
    title="Your export is ready"
    @close="exportOpen = false"
    ><p class="muted">
      {{ w.prepared.filename }} ·
      {{ (w.prepared.blob.size / 1024).toFixed(1) }} KB
    </p>
    <p>
      {{
        w.prepared.assetsIncluded
          ? "Local assets are included."
          : "JSON keeps references to local files. Choose ZIP to include their contents."
      }}
    </p>
    <div class="dialog-actions">
      <button @click="w.run(folderExport)">Save to folder</button
      ><a
        class="button primary"
        :href="downloadUrl"
        :download="w.prepared.filename"
        ><Download :size="17" />Download</a
      >
    </div></Modal
  >
  <Modal
    v-if="shareOpen"
    title="A film you can pass along"
    @close="shareOpen = false"
    ><p>
      The code contains the approved project. Anyone with the code can view its
      contents.
    </p>
    <label>Share code<textarea readonly :value="w.shareCode" rows="4" /></label>
    <div class="dialog-actions">
      <button @click="w.run(() => copy(w.shareCode))">
        <Copy :size="16" />Copy code</button
      ><button @click="w.run(() => copy(w.shareLink))">Copy link</button
      ><a
        class="button primary"
        :href="w.shareLink"
        target="_blank"
        rel="noopener noreferrer"
        >Open Watch<ArrowUpRight :size="16"
      /></a></div
  ></Modal>
</template>
