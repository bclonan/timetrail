<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Camera, Scan, X, Download, Copy } from "lucide-vue-next";
import { clone } from "../../domain/model";
import type { EditRegion } from "../../domain/retouch";
import { useWorkspace } from "../../stores/workspace";
import { useRetouch } from "../../stores/retouch";
import { storage } from "../../storage/BrowserWorkspaceStore";
const w = useWorkspace(),
  edits = useRetouch();
const sourceId = ref(""),
  clipKey = ref(""),
  times = ref("0"),
  frameId = ref("");
const regions = ref<EditRegion[]>([]),
  regionIndex = ref(0);
const mode = ref<"inpaint" | "replace-character">("inpaint"),
  instruction = ref(""),
  references = ref<string[]>([]);
const placement = ref<"add-media" | "frame-holds" | "replace-clip">(
  "add-media",
);
const resultIds = ref<Record<string, string>>({}),
  hold = ref(1);
const beforeUrl = ref(""),
  afterUrl = ref(""),
  bundleUrl = ref("");
const after = ref(false);
const sources = computed(
  () =>
    w.approved?.media.filter((m) => ["image", "video"].includes(m.type)) || [],
);
const source = computed(() =>
  sources.value.find((m) => m.id === sourceId.value),
);
const clips = computed(() =>
  (w.approved?.sequences || []).flatMap((s) =>
    s.clips
      .filter((c) => c.mediaId === sourceId.value)
      .map((c) => ({
        key: `${s.id}:${c.id}`,
        sequenceId: s.id,
        sequenceTitle: s.title,
        clip: c,
      })),
  ),
);
const target = computed(() => clips.value.find((c) => c.key === clipKey.value));
const job = computed(() => edits.selected);
const frame = computed(() =>
  job.value?.frames.find((f) => f.id === frameId.value),
);
const region = computed(() => regions.value[regionIndex.value]);
const dirty = computed(
  () =>
    JSON.stringify(regions.value) !==
    JSON.stringify(frame.value?.regions || []),
);
const proposal = computed(() =>
  w.proposals.find((p) => p.id === job.value?.proposalId),
);
const returnedImages = computed(() =>
  edits.available.filter(
    (m) =>
      ["image", "video"].includes(m.type) &&
      m.source.kind === "asset" &&
      m.id !== job.value?.source.id,
  ),
);
let imageGeneration = 0;
function revoke(value: string) {
  if (value) URL.revokeObjectURL(value);
}
watch(
  () => [edits.requestedMedia, edits.open, sources.value.length],
  () => {
    if (
      edits.requestedMedia &&
      sources.value.some((m) => m.id === edits.requestedMedia)
    )
      sourceId.value = edits.requestedMedia;
    if (!sources.value.some((m) => m.id === sourceId.value))
      sourceId.value = sources.value[0]?.id || "";
  },
);
watch(sourceId, () => {
  clipKey.value =
    clips.value.find(
      (t) =>
        t.sequenceId === w.sequence?.id &&
        w.time >= t.clip.timelineStart &&
        w.time < t.clip.timelineStart + t.clip.durationSeconds,
    )?.key || "";
  times.value = String(target.value?.clip.sourceStart || 0);
});
watch(clipKey, () => {
  times.value = String(target.value?.clip.sourceStart || 0);
});
watch(
  () => job.value?.id,
  () => {
    frameId.value = job.value?.frames[0]?.id || "";
    resultIds.value = {};
    after.value = false;
    placement.value = job.value?.clip
      ? job.value.source.type === "image"
        ? "replace-clip"
        : "frame-holds"
      : "add-media";
  },
);
watch(
  () => [job.value?.version, frameId.value],
  () => {
    regions.value = clone(frame.value?.regions || []);
    regionIndex.value = 0;
    if (job.value?.request) {
      mode.value = job.value.request.mode;
      instruction.value = job.value.request.instruction;
      references.value = job.value.request.references.map((r) => r.mediaId);
    }
    void loadImages();
  },
);
async function loadImages() {
  const token = ++imageGeneration,
    f = frame.value,
    request = job.value?.request;
  const urls: string[] = [];
  try {
    urls.push(f ? URL.createObjectURL(await storage.getAsset(f.assetId)) : "");
    const output = proposal.value?.operations.find(
      (op) =>
        op.type === "upsert_media" &&
        op.value.visualEdit?.sourceSeconds === f?.sourceSeconds,
    );
    urls.push(
      output?.type === "upsert_media" &&
        output.value.type === "image" &&
        output.value.source.kind === "asset"
        ? URL.createObjectURL(
            await storage.getAsset(output.value.source.assetId),
          )
        : "",
    );
    urls.push(
      request
        ? URL.createObjectURL(await storage.getAsset(request.bundleAssetId))
        : "",
    );
    if (token !== imageGeneration) {
      urls.forEach(revoke);
      return;
    }
    [beforeUrl.value, afterUrl.value, bundleUrl.value].forEach(revoke);
    [beforeUrl.value, afterUrl.value, bundleUrl.value] = urls;
  } catch (e) {
    urls.forEach(revoke);
    if (token === imageGeneration) w.error = String(e);
  }
}
onBeforeUnmount(() => {
  imageGeneration++;
  edits.cancel();
  [beforeUrl.value, afterUrl.value, bundleUrl.value].forEach(revoke);
});
function currentFrame() {
  const selected = target.value;
  if (
    !selected ||
    selected.sequenceId !== w.sequence?.id ||
    w.time < selected.clip.timelineStart ||
    w.time >= selected.clip.timelineStart + selected.clip.durationSeconds
  )
    throw new Error("Select the clip under the current playhead first.");
  times.value = String(
    Math.max(
      selected.clip.sourceStart,
      Math.min(
        selected.clip.sourceStart + w.time - selected.clip.timelineStart,
        (selected.clip.sourceEnd ?? source.value?.durationSeconds ?? Infinity) -
          0.001,
      ),
    ),
  );
}
async function capture() {
  w.playback("pause");
  await edits.capture({
    expectedRevision: w.record!.revision,
    mediaId: sourceId.value,
    ...(target.value
      ? { sequenceId: target.value.sequenceId, clipId: target.value.clip.id }
      : {}),
    sourceSeconds: times.value.split(",").map((t) => Number(t.trim())),
  });
}
async function saveMask() {
  if (job.value && frame.value)
    await edits.mask({
      jobId: job.value.id,
      expectedVersion: job.value.version,
      frameId: frame.value.id,
      regions: regions.value,
    });
}
async function prepare() {
  if (dirty.value) await saveMask();
  await edits.prepare({
    jobId: job.value!.id,
    expectedVersion: job.value!.version,
    mode: mode.value,
    instruction: instruction.value,
    referenceMediaIds: references.value,
  });
}
async function returnFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0],
    selectedFrame = frameId.value;
  if (!file) return;
  const media = await edits.uploadResult(file);
  resultIds.value[selectedFrame] = media.id;
  input.value = "";
}
async function propose() {
  const results = Object.entries(resultIds.value)
    .filter(([, mediaId]) => mediaId)
    .map(([frameId, mediaId]) => ({
      frameId,
      mediaId,
      holdSeconds: hold.value,
    }));
  await edits.propose({
    jobId: job.value!.id,
    expectedVersion: job.value!.version,
    expectedRevision: w.record!.revision,
    placement: placement.value,
    results,
  });
  after.value = true;
}
async function copyPrompt() {
  await navigator.clipboard.writeText(job.value!.request!.prompt);
  w.notify("Editing prompt copied.");
}
let start: { x: number; y: number } | undefined;
const draft = ref<EditRegion>();
function point(event: PointerEvent) {
  const box = (event.currentTarget as SVGElement).getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(100, ((event.clientX - box.left) / box.width) * 100),
    ),
    y: Math.max(
      0,
      Math.min(100, ((event.clientY - box.top) / box.height) * 100),
    ),
  };
}
function down(event: PointerEvent) {
  if (
    event.button !== 0 ||
    edits.busy ||
    after.value ||
    regions.value.length >= 20
  )
    return;
  start = point(event);
  (event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!start) return;
  const end = point(event);
  draft.value = {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}
function up(event: PointerEvent) {
  move(event);
  if (draft.value && draft.value.width > 0.5 && draft.value.height > 0.5) {
    regions.value.push(
      Object.fromEntries(
        Object.entries(draft.value).map(([k, v]) => [
          k,
          Math.floor(v * 100) / 100,
        ]),
      ) as unknown as EditRegion,
    );
    regionIndex.value = regions.value.length - 1;
  }
  start = undefined;
  draft.value = undefined;
}
</script>
<template>
  <button class="small" @click="edits.show()">
    <Scan :size="15" />Frame edits
  </button>
  <section
    v-if="edits.open"
    class="frame-edits"
    aria-label="Frame edits workspace"
  >
    <header>
      <div>
        <p class="eyebrow">INPAINTING & CHARACTER REPLACEMENT</p>
        <h2>Select the frame. Describe the change.</h2>
      </div>
      <button aria-label="Close frame edits" @click="edits.open = false">
        <X :size="18" />
      </button>
    </header>
    <p>
      Capture an image or video frame, mark the area to change, then give the
      request to your agent's image or video editor. Review its returned files
      here before they reach the timeline.
    </p>
    <fieldset :disabled="edits.busy" class="capture-fields">
      <label
        >Source media<select v-model="sourceId" aria-label="Source media">
          <option value="">Choose an image or video</option>
          <option v-for="m in sources" :key="m.id" :value="m.id">
            {{ m.name }}
          </option>
        </select></label
      >
      <label
        >Target clip<select v-model="clipKey" aria-label="Target clip">
          <option value="">Media only, add edited copies</option>
          <option v-for="t in clips" :key="t.key" :value="t.key">
            {{ t.sequenceTitle }} · {{ t.clip.timelineStart.toFixed(2) }}s ·
            {{ t.clip.durationSeconds.toFixed(2) }}s long
          </option>
        </select></label
      >
      <label v-if="source?.type === 'video'"
        >Source times in seconds<input
          v-model="times"
          placeholder="0, 1.5, 3"
        /><small>Up to eight times, measured in the source file.</small></label
      >
      <div class="retouch-actions">
        <button
          v-if="source?.type === 'video' && target"
          @click="w.run(currentFrame)"
        >
          Use playhead</button
        ><button class="primary" :disabled="!source" @click="w.run(capture)">
          <Camera :size="16" />Capture selected frames
        </button>
      </div>
    </fieldset>
    <p v-if="!sources.length">
      Import and accept an image or a direct video file first.
    </p>
    <label v-if="edits.jobs.length"
      >Saved editing request<select
        aria-label="Saved editing request"
        :value="edits.selectedId"
        :disabled="dirty || edits.busy"
        @change="
          w.run(() => edits.select(($event.target as HTMLSelectElement).value))
        "
      >
        <option value="" disabled>Choose a request</option>
        <option v-for="j in edits.jobs" :key="j.id" :value="j.id">
          {{ j.source.name }} · {{ j.frames.length }} frame{{
            j.frames.length === 1 ? "" : "s"
          }}
          · {{ j.createdAt.slice(11, 19) }}
        </option>
      </select></label
    >
    <template v-if="job && frame">
      <div class="frame-tabs" role="group" aria-label="Captured frames">
        <button
          v-for="(f, i) in job.frames"
          :key="f.id"
          :disabled="dirty || edits.busy"
          :aria-pressed="frameId === f.id"
          @click="
            frameId = f.id;
            after = false;
          "
        >
          Frame {{ i + 1 }} · {{ f.sourceSeconds.toFixed(3) }}s
        </button>
      </div>
      <div class="retouch-grid">
        <div>
          <div class="retouch-actions">
            <strong>{{
              after && afterUrl
                ? "Returned edit, outside pixels preserved"
                : "Original capture and selected areas"
            }}</strong
            ><button v-if="afterUrl" @click="after = !after">
              {{ after ? "Show original" : "Show returned edit" }}
            </button>
          </div>
          <div
            class="mask-canvas"
            :style="{ aspectRatio: `${frame.width}/${frame.height}` }"
          >
            <img
              v-if="beforeUrl"
              :src="after && afterUrl ? afterUrl : beforeUrl"
              :alt="
                after && afterUrl ? 'Returned edit' : 'Selected source frame'
              "
            />
            <svg
              v-if="!after"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              role="img"
              aria-label="Draw edit areas on the frame"
              @pointerdown.prevent="down"
              @pointermove="move"
              @pointerup="up"
              @pointercancel="
                start = undefined;
                draft = undefined;
              "
            >
              <rect
                v-for="(r, i) in regions"
                :key="i"
                :x="r.x"
                :y="r.y"
                :width="r.width"
                :height="r.height"
                :class="{ selected: i === regionIndex }"
              />
              <rect
                v-if="draft"
                :x="draft.x"
                :y="draft.y"
                :width="draft.width"
                :height="draft.height"
                class="draft"
              />
            </svg>
          </div>
          <p class="muted small-text">
            Drag a rectangle over each area to edit, or enter coordinates below.
            Coordinates use percentages of the image. {{ frame.width }} ×
            {{ frame.height }} PNG. White mask areas change; black areas stay.
          </p>
          <fieldset :disabled="edits.busy">
            <div class="retouch-actions">
              <button
                @click="
                  regions = [{ x: 0, y: 0, width: 100, height: 100 }];
                  regionIndex = 0;
                  after = false;
                "
              >
                Select whole frame</button
              ><button
                @click="
                  regions.push({ x: 25, y: 25, width: 25, height: 25 });
                  regionIndex = regions.length - 1;
                  after = false;
                "
                :disabled="regions.length >= 20"
              >
                Add edit area</button
              ><button
                @click="
                  regions = [];
                  regionIndex = 0;
                "
              >
                Clear areas
              </button>
            </div>
            <label v-if="regions.length"
              >Selected area<select v-model.number="regionIndex">
                <option v-for="(_, i) in regions" :key="i" :value="i">
                  Area {{ i + 1 }}
                </option>
              </select></label
            >
            <div v-if="region" class="region-fields">
              <label
                v-for="key in ['x', 'y', 'width', 'height'] as const"
                :key="key"
                >{{ key }} %<input
                  v-model.number="region[key]"
                  :aria-label="`Edit area ${key}`"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
              /></label>
            </div>
            <button :disabled="!dirty" @click="w.run(saveMask)">
              Save selected areas</button
            ><span v-if="dirty" class="small-text">
              Save areas before switching frames.</span
            >
          </fieldset>
        </div>
        <div class="retouch-request">
          <fieldset :disabled="edits.busy">
            <h3>Tell the agent what to change</h3>
            <label
              >Edit type<select v-model="mode" aria-label="Edit type">
                <option value="inpaint">Inpaint selected areas</option>
                <option value="replace-character">Replace a character</option>
              </select></label
            >
            <label
              >Edit instructions<textarea
                aria-label="Edit instructions"
                v-model="instruction"
                rows="4"
                maxlength="4000"
                placeholder="Replace the selected character with the reference character. Keep the pose, light and background."
              />
            </label>
            <label
              >Character reference images<select
                aria-label="Character reference images"
                v-model="references"
                multiple
                size="3"
              >
                <option
                  v-for="m in edits.available.filter((m) => m.type === 'image')"
                  :key="m.id"
                  :value="m.id"
                >
                  {{ m.name }}
                </option></select
              ><small>Optional, up to three images.</small></label
            >
            <button class="primary" @click="w.run(prepare)">
              Prepare editing request
            </button>
          </fieldset>
          <template v-if="job.request">
            <p class="request-state">
              Ready for your agent. No AI edit has run yet.
            </p>
            <div class="retouch-actions">
              <a
                v-if="bundleUrl"
                class="button"
                :href="bundleUrl"
                :download="`timetrail-edit-${job.id}.zip`"
                ><Download :size="14" />Download editing files</a
              ><button @click="w.run(copyPrompt)">
                <Copy :size="14" />Copy editing prompt
              </button>
            </div>
            <details>
              <summary>Agent instructions and file IDs</summary>
              <pre>{{ job.request.prompt }}</pre>
              <p>Request {{ job.id }} · version {{ job.version }}</p>
            </details>
            <fieldset :disabled="edits.busy || Boolean(job.proposalId)">
              <h3>Review returned files</h3>
              <label
                >Upload edited result for this frame<input
                  aria-label="Upload edited result for this frame"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
                  @change="w.run(() => returnFile($event))"
              /></label>
              <label
                >Returned media for this frame<select
                  aria-label="Returned media for this frame"
                  v-model="resultIds[frame.id]"
                >
                  <option value="">Choose an uploaded result</option>
                  <option v-for="m in returnedImages" :key="m.id" :value="m.id">
                    {{ m.name }}
                  </option>
                </select></label
              >
              <p class="small-text">
                {{ Object.values(resultIds).filter(Boolean).length }} of
                {{ job.frames.length }} frames have a result selected. You can
                review a subset.
              </p>
              <label
                >Apply result as<select
                  v-model="placement"
                  aria-label="Apply result as"
                >
                  <option value="add-media">New edited image media</option>
                  <option
                    v-if="job.clip && job.source.type === 'video'"
                    value="frame-holds"
                  >
                    Timed still-frame holds
                  </option>
                  <option v-if="job.clip" value="replace-clip">
                    {{
                      job.source.type === "video"
                        ? "Full edited video clip"
                        : "Replace this image clip"
                    }}
                  </option>
                </select></label
              >
              <label v-if="placement === 'frame-holds'"
                >Hold each edited frame for seconds<input
                  v-model.number="hold"
                  type="number"
                  min="0.1"
                  max="30"
                  step="0.1"
              /></label>
              <p class="small-text">
                {{
                  placement === "frame-holds"
                    ? "Still holds do not regenerate motion and replace the original sound during each hold."
                    : "For continuous character replacement, return an actual edited video covering the selected clip, including any required audio."
                }}
              </p>
              <button
                class="primary"
                :disabled="!Object.values(resultIds).some(Boolean)"
                @click="w.run(propose)"
              >
                Propose returned edit
              </button>
            </fieldset>
            <div v-if="proposal" class="request-state">
              <p>
                Result proposal is {{ proposal.status }}. Review it in the
                editor before accepting.
              </p>
              <button
                v-if="proposal.status === 'pending'"
                @click="w.run(() => w.preview(proposal!))"
              >
                Preview returned edit
              </button>
            </div>
          </template>
        </div>
      </div>
    </template>
    <div v-if="edits.busy" role="status" class="retouch-actions">
      <span>Preparing frame editing files...</span
      ><button @click="edits.cancel()">Cancel operation</button>
    </div>
  </section>
</template>
<style scoped>
.frame-edits {
  margin: 18px 0;
  padding: 25px;
  background: var(--panel, #18251e);
  border: 1px solid var(--border, #35412f);
  border-radius: 12px;
  min-width: 0;
}
.frame-edits header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.frame-edits h2 {
  font-family: Georgia, serif;
  margin: 8px 0;
  font-size: 28px;
}
.frame-edits h3 {
  margin: 8px 0 15px;
}
.frame-edits label {
  display: block;
  margin: 12px 0;
  font-size: 13px;
}
.frame-edits label > input,
.frame-edits label > select,
.frame-edits label > textarea {
  display: block;
  width: 100%;
  margin-top: 7px;
  min-width: 0;
  box-sizing: border-box;
}
.frame-edits fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.frame-edits small {
  display: block;
  margin-top: 5px;
  color: var(--muted);
}
.capture-fields {
  display: grid;
  grid-template-columns: 1fr 1.1fr 1fr;
  gap: 12px;
  align-items: start;
}
.capture-fields > .retouch-actions {
  grid-column: 1/-1;
}
.retouch-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(270px, 1fr);
  gap: 28px;
  margin-top: 18px;
}
.retouch-grid > div {
  min-width: 0;
}
.retouch-actions,
.frame-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  margin: 12px 0;
}
.frame-tabs button[aria-pressed="true"] {
  border-color: var(--accent);
  color: var(--accent);
}
.mask-canvas {
  position: relative;
  background: #080d0a;
  width: 100%;
  overflow: hidden;
  isolation: isolate;
}
.mask-canvas img,
.mask-canvas svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.mask-canvas svg {
  touch-action: none;
  cursor: crosshair;
}
.mask-canvas rect {
  fill: #c5ef9140;
  stroke: #c5ef91;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}
.mask-canvas rect.selected {
  stroke-width: 3;
}
.mask-canvas rect.draft {
  stroke-dasharray: 4 3;
}
.region-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.retouch-request {
  border-left: 1px solid var(--border);
  padding-left: 24px;
}
.request-state {
  padding: 12px;
  background: #c5ef9112;
  border: 1px solid #c5ef9140;
  border-radius: 7px;
  margin: 16px 0;
}
.frame-edits pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 300px;
  overflow: auto;
  font-size: 12px;
}
.frame-edits p {
  line-height: 1.65;
}
.frame-edits button,
.frame-edits .button {
  white-space: normal;
}
.frame-edits input[type="file"] {
  max-width: 100%;
  font-size: 12px;
}
.frame-edits details {
  margin: 15px 0;
}
.frame-edits details p {
  overflow-wrap: anywhere;
}
@media (max-width: 900px) {
  .retouch-grid {
    grid-template-columns: 1fr;
  }
  .retouch-request {
    border-left: 0;
    border-top: 1px solid var(--border);
    padding: 20px 0 0;
  }
  .capture-fields {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 600px) {
  .frame-edits {
    padding: 16px;
  }
  .capture-fields {
    grid-template-columns: 1fr;
  }
  .frame-edits h2 {
    font-size: 24px;
  }
}
</style>
