<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import {
  Play,
  Pause,
  Maximize,
  Volume2,
  Subtitles,
  CornerUpLeft,
} from "lucide-vue-next";
import { useWorkspace } from "../../stores/workspace";
import { FrameTrailBridge } from "../../runtime/FrameTrailBridge";
import { FrameTrailAdapter } from "../../runtime/FrameTrailAdapter";
import { storage } from "../../storage/BrowserWorkspaceStore";
import { clone } from "../../domain/model";
const w = useWorkspace();
const frame = ref<HTMLIFrameElement>();
const container = ref<HTMLElement>();
let bridge: FrameTrailBridge;
let adapter = new FrameTrailAdapter();
let generation = 0;
let initializing = false;
const src = ref("/runtime.html");
watch(src, () => {
  initializing = false;
  generation++;
});
const failure = ref("");
const caption = ref("");
let spoken = "";
async function initialize() {
  if (!w.current || !w.sequence || initializing) return;
  initializing = true;
  const token = ++generation;
  const next = new FrameTrailAdapter();
  try {
    const assets = await next.resolveAssetUrls(clone(w.current));
    if (token !== generation) {
      next.revokeResolvedAssetUrls();
      return;
    }
    adapter.revokeResolvedAssetUrls();
    adapter = next;
    bridge.send({
      type: "TIMETRAIL_INIT",
      project: clone(w.current),
      sequenceId: w.sequence.id,
      revision: w.record?.revision || 0,
      startTime: Math.min(w.time, w.sequence.durationSeconds),
      assetUrls: assets,
    });
  } catch (e) {
    initializing = false;
    next.revokeResolvedAssetUrls();
    failure.value = e instanceof Error ? e.message : String(e);
  }
}
onMounted(() => {
  bridge = new FrameTrailBridge(frame.value!, (m) => {
    if (m.type === "TIMETRAIL_READY") {
      if (m.revision === undefined) void initialize();
      else {
        w.playerReady = true;
        failure.value = "";
        void storage.log({
          toolName: "preview.synchronized",
          projectId: w.approved?.id,
          revision: m.revision,
          message: `Preview synchronized to revision ${m.revision}`,
        });
      }
    }
    if (m.type === "TIMETRAIL_PLAYHEAD" && m.sequenceId === w.sequence?.id) {
      w.time = m.currentTime;
      w.paused = m.paused;
    }
    if (m.type === "TIMETRAIL_RUNTIME_ERROR") {
      failure.value = m.message;
      w.playerReady = false;
    }
    if (m.type === "TIMETRAIL_LINK_ACTIVATED")
      w.branch(m.sequenceId, m.timeSeconds);
    if (m.type === "TIMETRAIL_SELECTION_CHANGED" && m.cueId)
      w.selectedCue = m.cueId;
    if (m.type === "TIMETRAIL_QUIZ_ANSWERED")
      w.quizAnswers[m.cueId] = m.answerIndex;
  });
});
watch(
  () => [w.current, w.sequenceId],
  () => {
    initializing = false;
    w.playerReady = false;
    w.paused = true;
    failure.value = "";
    src.value = "/runtime.html?revision=" + Date.now();
  },
  { flush: "post" },
);
watch(
  () => w.command,
  (c) => {
    if (c && bridge && w.playerReady)
      bridge.send({
        type: "TIMETRAIL_PLAYBACK",
        action: c.action,
        timeSeconds: c.timeSeconds,
      });
  },
);
watch(
  () => [w.time, w.captions, w.narration, w.paused],
  () => {
    const cue = w.sequence?.cues.find(
      (c) =>
        c.kind === "caption" &&
        w.time >= c.start &&
        w.time < (c.end ?? c.start + 3),
    );
    caption.value = w.captions ? cue?.body || "" : "";
    if (
      w.narration &&
      !w.paused &&
      cue &&
      spoken !== cue.id &&
      "speechSynthesis" in window
    ) {
      spoken = cue.id;
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cue.body);
      utterance.onerror = () =>
        w.notify("Narration is unavailable. Captions are still available.");
      speechSynthesis.speak(utterance);
    }
    if ((!w.narration || w.paused) && "speechSynthesis" in window)
      speechSynthesis.cancel();
  },
);
function narration() {
  if (!("speechSynthesis" in window)) {
    w.notify("This browser has no speech narration.");
    return;
  }
  w.narration = !w.narration;
  spoken = "";
  if (w.narration) {
    const blank = new SpeechSynthesisUtterance("");
    speechSynthesis.speak(blank);
  }
}
onBeforeUnmount(() => {
  generation++;
  w.playerReady = false;
  w.paused = true;
  bridge?.destroy();
  adapter.revokeResolvedAssetUrls();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
});
const fmt = (n: number) =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
</script>
<template>
  <section
    ref="container"
    class="player-shell"
    aria-label="Interactive preview"
  >
    <div class="screen">
      <iframe
        ref="frame"
        :src="src"
        title="FrameTrail interactive preview"
        @load="bridge?.send({ type: 'TIMETRAIL_PING' })"
        allow="autoplay; fullscreen"
      />
      <div v-if="!w.playerReady" class="player-state" role="status">
        {{ failure || "Preparing FrameTrail preview..."
        }}<button
          v-if="failure"
          @click="src = '/runtime.html?retry=' + Date.now()"
        >
          Retry preview
        </button>
      </div>
      <div v-if="w.previewProject" class="preview-tag">
        PROPOSAL PREVIEW · UNSAVED
      </div>
      <div v-if="caption" class="caption-text">{{ caption }}</div>
    </div>
    <div class="player-controls">
      <button
        class="play-toggle"
        :aria-label="w.paused ? 'Play' : 'Pause'"
        :disabled="!w.playerReady"
        @click="w.playback(w.paused ? 'play' : 'pause')"
      >
        <Play v-if="w.paused" :size="18" /><Pause v-else :size="18" /></button
      ><span class="timecode"
        >{{ fmt(w.time) }}
        <span>/ {{ fmt(w.sequence?.durationSeconds || 0) }}</span></span
      ><input
        class="scrubber"
        type="range"
        min="0"
        :max="w.sequence?.durationSeconds || 90"
        step="0.1"
        :value="w.time"
        aria-label="Seek playback"
        :disabled="!w.playerReady"
        @input="
          w.playback('seek', Number(($event.target as HTMLInputElement).value))
        "
      /><button
        v-if="w.history.length"
        class="icon-button"
        aria-label="Return to previous sequence"
        @click="w.back"
      >
        <CornerUpLeft :size="17" /></button
      ><button
        class="icon-button"
        :class="{ active: w.captions }"
        aria-label="Toggle captions"
        :aria-pressed="w.captions"
        @click="w.captions = !w.captions"
      >
        <Subtitles :size="18" /></button
      ><button
        class="icon-button"
        :class="{ active: w.narration }"
        aria-label="Toggle narration"
        :aria-pressed="w.narration"
        @click="narration"
      >
        <Volume2 :size="17" /></button
      ><button
        class="icon-button"
        aria-label="Fullscreen"
        @click="w.run(() => container?.requestFullscreen())"
      >
        <Maximize :size="17" />
      </button>
    </div>
  </section>
</template>
