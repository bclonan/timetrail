<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch, toRef } from "vue";
import { useRouter } from "vue-router";
import {
  Plus,
  Upload,
  Link,
  Film,
  Image,
  FileText,
  Sparkles,
  ArrowRight,
} from "lucide-vue-next";
import { useEditor } from "../../stores/editor";
import { useWorkspace } from "../../stores/workspace";
import {
  importFile,
  parseVtt,
  srtToVtt,
} from "../../services/MediaImportService";
import { exportsService } from "../../services/ExportService";
import { projects } from "../../services/ProjectService";
import { clone, id, now, type Media, type Operation } from "../../domain/model";
import Modal from "../common/Modal.vue";
import MediaSearch from "./MediaSearch.vue";
import { storage } from "../../storage/BrowserWorkspaceStore";
import { cardSvg } from "../../runtime/generatedCard";
const w = useWorkspace();
const router = useRouter();
const importing = ref(false);
const e = useEditor();
const open = computed({
  get: () => e.active === "urls",
  set: (v) => (v ? e.open("urls") : e.close()),
});
const urls = toRef(e, "urls");
const fileInput = ref<HTMLInputElement>();
const cardOpen = computed({
  get: () => e.active === "card",
  set: (v) => (v ? e.open("card") : e.close()),
});
const preview = ref<{ name: string; type: string; url: string }>();
function closePreview() {
  if (preview.value?.url.startsWith("blob:"))
    URL.revokeObjectURL(preview.value.url);
  preview.value = undefined;
}
async function previewResource(m: Media) {
  closePreview();
  let url = "";
  if (m.source.kind === "asset")
    url = URL.createObjectURL(await storage.getAsset(m.source.assetId));
  else if (m.source.kind === "generated")
    url = URL.createObjectURL(
      new Blob([cardSvg(m.source.document)], { type: "image/svg+xml" }),
    );
  else url = m.source.url;
  preview.value = {
    name: m.name,
    type: m.type === "generated-card" ? "image" : m.type,
    url,
  };
}
onBeforeUnmount(closePreview);
const resources = computed(() => {
  const media = (w.approved?.media || []).map((m) => ({ ...m, staged: false }));
  for (const p of w.pending)
    for (const op of p.operations)
      if (
        op.type === "upsert_media" &&
        !media.some((m) => m.id === op.value.id)
      )
        media.push({ ...op.value, staged: true });
  return media;
});
async function urlsImport() {
  importing.value = true;
  await w.run(() => e.submit());
  importing.value = false;
}
watch(
  () => e.resourcePreviewId,
  (value) => {
    const media = w.approved?.media.find((m) => m.id === value);
    if (media) w.run(() => previewResource(media));
    else closePreview();
  },
  { immediate: true },
);
async function filesImport(files: File[]) {
  importing.value = true;
  for (const file of files) {
    await w.run(async () => {
      if (/\.(json|zip|html)$/i.test(file.name)) {
        const source = await exportsService.import(file);
        const p = await projects.import(source);
        await w.load(p.id);
        await router.push("/project/" + p.id);
        open.value = false;
        return;
      }
      const media = await importFile(file);
      const ops: Operation[] = [{ type: "upsert_media", value: media }];
      if (media.type === "subtitle" && w.sequence) {
        const text = await file.text();
        for (const caption of parseVtt(
          file.name.endsWith(".srt") ? srtToVtt(text) : text,
        )) {
          if (caption.start >= w.sequence.durationSeconds) continue;
          ops.push({
            type: "add_cue",
            sequenceId: w.sequence.id,
            value: {
              id: id(),
              kind: "caption",
              ...caption,
              end: Math.min(caption.end, w.sequence.durationSeconds),
              provenance: { createdBy: "import", createdAt: now() },
            },
          });
        }
      }
      await w.commit(ops);
    });
  }
  importing.value = false;
}
async function folderImport() {
  const picker = (window as any).showDirectoryPicker;
  if (!picker)
    throw new Error("Folder import is unavailable. Choose files instead.");
  const handle = await picker();
  const files: File[] = [];
  for await (const entry of handle.values())
    if (entry.kind === "file") files.push(await entry.getFile());
  await filesImport(files);
}
async function addClip(m: Media) {
  if (!w.sequence) return;
  const seq = clone(w.sequence);
  const start = seq.clips.reduce(
    (n, c) => Math.max(n, c.timelineStart + c.durationSeconds),
    0,
  );
  const dur = m.durationSeconds ? Math.min(m.durationSeconds, 30) : 15;
  seq.durationSeconds = Math.max(seq.durationSeconds, start + dur);
  seq.clips.push({
    id: id(),
    mediaId: m.id,
    timelineStart: start,
    sourceStart: 0,
    durationSeconds: dur,
    timingEstimated:
      ["video", "youtube", "vimeo"].includes(m.type) && !m.durationSeconds,
  });
  await w.commit([{ type: "upsert_sequence", value: seq }]);
}
async function createCard() {
  await e.submit();
}
</script>
<template>
  <aside
    class="media-library"
    @dragover.prevent
    @drop.prevent="filesImport(Array.from($event.dataTransfer?.files || []))"
  >
    <div class="section-heading">
      <span>YOUR RESOURCES</span
      ><span class="count">{{ resources.length }}</span>
    </div>
    <button class="import-button" @click="open = true">
      <Plus :size="16" />Import media</button
    ><button class="text-button" @click="cardOpen = true">
      <Sparkles :size="14" />Create a card
    </button>
    <MediaSearch />
    <div class="media-list">
      <article v-for="m in resources" :key="m.id" class="media-item">
        <div class="media-icon" :class="m.type">
          <Film
            v-if="['video', 'youtube', 'vimeo'].includes(m.type)"
            :size="19"
          /><Image v-else-if="m.type === 'image'" :size="19" /><Sparkles
            v-else-if="m.type === 'generated-card'"
            :size="19"
          /><FileText v-else :size="19" />
        </div>
        <div>
          <h3>
            <button
              class="text-button"
              :aria-label="'Preview ' + m.name"
              @click="w.run(() => previewResource(m))"
            >
              {{ m.name }}
            </button>
          </h3>
          <span
            >{{
              m.staged
                ? "Awaiting review"
                : m.type === "generated-card"
                  ? "Generated card"
                  : m.type
            }}{{
              m.durationSeconds
                ? " · " + Math.round(m.durationSeconds) + "s"
                : ""
            }}</span
          >
        </div>
        <button
          v-if="!m.staged && m.type === 'generated-card'"
          class="icon-button"
          :aria-label="'Edit card ' + m.name"
          @click="e.open('card', m.id)"
        >
          <Sparkles :size="14" />
        </button>
        <button
          v-if="!m.staged"
          class="icon-button"
          :aria-label="'Add ' + m.name + ' to timeline'"
          @click="w.run(() => addClip(m))"
        >
          <Plus :size="15" />
        </button>
      </article>
      <p v-if="!resources.length" class="empty-hint">
        Drop your files here, paste a few links, or create your first card.
      </p>
    </div>
    <div class="library-footer">
      <span class="small-dot" />Stored on this device
    </div>
    <input
      ref="fileInput"
      type="file"
      multiple
      class="visually-hidden"
      aria-label="Import local files"
      accept=".mp4,.webm,.png,.jpg,.jpeg,.webp,.gif,.avif,.svg,.mp3,.wav,.m4a,.ogg,.aac,.pdf,.vtt,.srt,.json,.zip,.html"
      @change="
        filesImport(Array.from(($event.target as HTMLInputElement).files || []))
      "
    /><Modal
      v-if="open"
      title="Bring your sources together"
      @close="open = false"
      ><p>Paste one URL per line, or choose files from your device.</p>
      <label
        >Media URLs<textarea
          v-model="urls"
          rows="5"
          placeholder="https://www.youtube.com/watch?v=...&#10;https://example.org/video.mp4"
        />
      </label>
      <div class="dialog-actions">
        <button :disabled="importing" @click="fileInput?.click()">
          <Upload :size="16" />Choose files</button
        ><button :disabled="importing" @click="w.run(folderImport)">
          Choose folder</button
        ><button
          class="primary"
          :disabled="!urls.trim() || importing"
          @click="urlsImport"
        >
          <Link :size="16" />{{ importing ? "Importing..." : "Import URLs" }}
        </button>
      </div>
      <p class="small-text muted">
        Video, image, audio, PDF, VTT, SRT, TimeTrail JSON, HTML, or ZIP. Up to
        100 MB per media file.
      </p></Modal
    ><Modal
      v-if="cardOpen"
      :title="e.fresh ? 'Make a generated card' : 'Edit generated card'"
      @close="cardOpen = false"
      ><form @submit.prevent="w.run(createCard)">
        <label
          >Heading<input
            v-model="e.card.heading"
            required
            maxlength="300" /></label
        ><label
          >Body<textarea v-model="e.card.body" rows="3" maxlength="4000" />
        </label>
        <div class="form-row">
          <label
            >Layout<select v-model="e.card.layout">
              <option
                v-for="l in [
                  'title',
                  'concept',
                  'image-focus',
                  'comparison',
                  'quote',
                  'recap',
                  'quiz-intro',
                ]"
                :key="l"
              >
                {{ l }}
              </option>
            </select></label
          ><label v-if="e.fresh"
            >Duration, seconds<input
              v-model.number="e.card.duration"
              type="number"
              min="1"
              max="300"
              required
          /></label>
        </div>
        <label
          >Narration and captions<textarea
            v-model="e.card.narration"
            rows="2"
            maxlength="4000"
          />
        </label>
        <div class="form-row">
          <label
            >Background<select v-model="e.card.background">
              <option>forest</option>
              <option>ink</option>
              <option>sand</option>
            </select></label
          ><label
            >Illustration<select v-model="e.card.illustration">
              <option
                v-for="v in ['none', 'dna', 'rna', 'protein', 'mutation']"
                :key="v"
              >
                {{ v }}
              </option>
            </select></label
          >
        </div>
        <label
          >Source credit<input v-model="e.card.source" maxlength="8000"
        /></label>
        <label
          >Image URL, optional<input
            v-model="e.card.image"
            type="url"
            placeholder="https://example.org/image.jpg"
        /></label>
        <p class="small-text muted">
          For comparison cards, separate the two sides with |. For recap cards,
          put each point on a new line.
        </p>
        <p v-if="e.agentDraft" class="small-text">
          Agent-filled draft. Check these fields before saving.
        </p>
        <div class="dialog-actions">
          <button class="primary">
            {{ e.fresh ? "Add card to film" : "Save card"
            }}<ArrowRight :size="15" />
          </button>
        </div></form
    ></Modal>
    <Modal
      v-if="preview"
      :title="preview.name"
      @close="
        closePreview();
        e.resourcePreviewId = '';
      "
    >
      <img
        v-if="preview.type === 'image'"
        class="resource-preview"
        :src="preview.url"
        :alt="preview.name"
      />
      <video
        v-else-if="preview.type === 'video'"
        class="resource-preview"
        :src="preview.url"
        controls
      />
      <audio v-else-if="preview.type === 'audio'" :src="preview.url" controls />
      <iframe
        v-else-if="preview.type === 'pdf'"
        class="resource-preview-frame"
        :src="preview.url"
        :title="preview.name"
        sandbox=""
      />
      <p v-else>Open this resource in a separate tab to read it.</p>
      <div class="dialog-actions">
        <a
          class="button"
          :download="preview.url.startsWith('blob:') ? preview.name : undefined"
          :href="preview.url"
          target="_blank"
          rel="noopener noreferrer"
          >{{
            preview.url.startsWith("blob:")
              ? "Download resource"
              : "Open resource"
          }}</a
        >
      </div>
    </Modal>
  </aside>
</template>
