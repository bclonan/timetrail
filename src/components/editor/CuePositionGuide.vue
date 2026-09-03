<script setup lang="ts">
import { computed, ref } from "vue";
import { useEditor } from "../../stores/editor";
import { positionForCue, isIndicator } from "../../domain/hotspots";
import { useWorkspace } from "../../stores/workspace";
const e = useEditor();
const w = useWorkspace();
const area = ref<HTMLElement>();
const position = computed(() =>
  e.cue ? positionForCue(e.cue, w.sequence?.cues || []) : undefined,
);
const box = computed(() =>
  position.value
    ? Object.fromEntries(
        Object.entries(position.value).map(([key, value]) => [
          key === "x" ? "left" : key === "y" ? "top" : key,
          `${value}%`,
        ]),
      )
    : {},
);
type Rect = NonNullable<typeof position.value>;
let drag:
  | {
      pointerId: number;
      x: number;
      y: number;
      rect: Rect;
      previous?: Rect;
      resize: boolean;
      element: HTMLElement;
    }
  | undefined;
const bounded = (value: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(max, value)) * 10) / 10;
function set(rect: Rect) {
  if (!e.cue) return;
  const width = bounded(rect.width, 1, 100),
    height = bounded(rect.height, 1, 100);
  e.cue.position = {
    x: bounded(rect.x, 0, 100 - width),
    y: bounded(rect.y, 0, 100 - height),
    width,
    height,
  };
}
function start(event: PointerEvent, resize = false) {
  if (event.button !== 0 || !position.value || !e.cue) return;
  event.preventDefault();
  const element = event.currentTarget as HTMLElement;
  element.focus();
  drag = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    rect: { ...position.value },
    previous: e.cue.position ? { ...e.cue.position } : undefined,
    resize,
    element,
  };
  element.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId || !area.value) return;
  const bounds = area.value.getBoundingClientRect();
  const dx = ((event.clientX - drag.x) / bounds.width) * 100,
    dy = ((event.clientY - drag.y) / bounds.height) * 100;
  const p = drag.rect;
  set(
    drag.resize
      ? {
          ...p,
          width: bounded(p.width + dx, 1, 100 - p.x),
          height: bounded(p.height + dy, 1, 100 - p.y),
        }
      : { ...p, x: p.x + dx, y: p.y + dy },
  );
}
function end(cancel = false) {
  if (!drag) return;
  const previous = drag;
  drag = undefined;
  if (cancel && e.cue) e.cue.position = previous.previous;
  if (previous.element.hasPointerCapture(previous.pointerId))
    previous.element.releasePointerCapture(previous.pointerId);
}
function keyboard(event: KeyboardEvent, resize = false) {
  if (event.key === "Escape") {
    event.preventDefault();
    end(true);
    return;
  }
  if (
    !position.value ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  )
    return;
  event.preventDefault();
  const p = { ...position.value },
    step = event.shiftKey ? 5 : 1;
  const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
  const delta =
    (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) * step;
  const field = resize
    ? horizontal
      ? "width"
      : "height"
    : horizontal
      ? "x"
      : "y";
  p[field] += delta;
  if (resize) {
    p.width = Math.min(p.width, 100 - p.x);
    p.height = Math.min(p.height, 100 - p.y);
  }
  set(p);
}
</script>
<template>
  <div
    v-if="
      e.active === 'cue' &&
      e.positionEditing &&
      position &&
      !['quiz', 'chapter', 'caption', 'narration'].includes(e.cue?.kind || '')
    "
    ref="area"
    class="cue-position-guide"
    aria-label="Annotation position guide"
  >
    <span class="guide-origin">0, 0</span>
    <div
      class="guide-x"
      :style="{ width: `${position.x}%`, top: `${position.y}%` }"
    />
    <div
      class="guide-y"
      :style="{ height: `${position.y}%`, left: `${position.x}%` }"
    />
    <div class="guide-box" :style="box" data-testid="cue-position-box">
      <button
        type="button"
        class="guide-move"
        aria-label="Move annotation"
        @pointerdown="start($event)"
        @pointermove="move"
        @pointerup="end()"
        @pointercancel="end(true)"
        @lostpointercapture="end(true)"
        @keydown="keyboard($event)"
      >
        <span v-if="e.cue && isIndicator(e.cue)" class="guide-indicator"
          >i</span
        >
        <span v-else>{{ e.cue?.title || "Annotation" }}</span>
      </button>
      <button
        type="button"
        class="guide-resize"
        aria-label="Resize annotation"
        @pointerdown="start($event, true)"
        @pointermove="move"
        @pointerup="end()"
        @pointercancel="end(true)"
        @lostpointercapture="end(true)"
        @keydown="keyboard($event, true)"
      >
        ↘
      </button>
    </div>
    <output class="guide-readout"
      >DRAFT · X {{ position.x }}% · Y {{ position.y }}% · W
      {{ position.width }}% · H {{ position.height }}%</output
    >
  </div>
</template>
<style scoped>
.cue-position-guide {
  position: absolute;
  inset: 0;
  z-index: 7;
  pointer-events: none;
  background-image:
    linear-gradient(#c5ef9120 1px, transparent 1px),
    linear-gradient(90deg, #c5ef9120 1px, transparent 1px);
  background-size: 10% 10%;
}
.guide-origin {
  position: absolute;
  top: 4px;
  left: 5px;
  font: 11px monospace;
  color: white;
  background: #142b21;
}
.guide-x,
.guide-y {
  position: absolute;
  border-top: 1px dashed #fff9;
  border-left: 1px dashed #fff9;
}
.guide-box {
  position: absolute;
  border: 2px solid #c5ef91;
  box-sizing: border-box;
  background: #c5ef9120;
  min-width: 8px;
  min-height: 8px;
}
.guide-move {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: white;
  cursor: move;
  pointer-events: auto;
  touch-action: none;
  overflow: hidden;
  border-radius: 0;
}
.guide-indicator {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  max-width: 100%;
  max-height: 100%;
  border-radius: 50%;
  background: #142b21;
  border: 2px solid #c5ef91;
}
.guide-resize {
  position: absolute;
  right: -10px;
  bottom: -10px;
  padding: 0;
  width: 24px;
  height: 24px;
  border: 1px solid #c5ef91;
  background: #142b21;
  color: white;
  cursor: nwse-resize;
  touch-action: none;
  pointer-events: auto;
}
.guide-readout {
  position: absolute;
  bottom: 8px;
  left: 8px;
  max-width: calc(100% - 16px);
  box-sizing: border-box;
  font: 12px/1.5 monospace;
  padding: 6px 9px;
  color: #eef2df;
  background: #142b21f5;
  border: 1px solid #709261;
  border-radius: 5px;
}
</style>
