<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { useWorkspace } from "../../stores/workspace";
import {
  defaultPresentation,
  type PlayerView,
} from "../../domain/presentation";
import { renderPanels, visiblePanels } from "../../runtime/playerPanels";
const props = defineProps<{ view: PlayerView }>();
const root = ref<HTMLElement>();
const w = useWorkspace();
function paint() {
  if (!root.value || !w.current) return;
  const state = {
    sequenceId: w.sequenceId,
    time: w.time,
    flags: w.viewerFlags,
    answers: w.quizAnswers,
  };
  const panels = w.current.presentation?.panels || defaultPresentation().panels;
  renderPanels(
    root.value,
    w.current,
    visiblePanels(w.current, props.view, state, panels),
    state,
    {
      seek: (id, time) =>
        id === w.sequenceId ? w.playback("seek", time) : w.branch(id, time),
      flag: (key, value) => {
        w.viewerFlags[key] = value;
      },
    },
  );
}
watch(
  () => [
    props.view,
    w.current,
    w.sequenceId,
    Math.floor(w.time),
    JSON.stringify(w.viewerFlags),
    JSON.stringify(w.quizAnswers),
  ],
  paint,
  { flush: "post" },
);
onMounted(paint);
</script>
<template>
  <div ref="root" class="player-panels" aria-label="Interactive panels" />
</template>
