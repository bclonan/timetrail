<script setup lang="ts">
import type { TimelineEdit } from "../../services/TimelineEditing";
defineProps<{
  label: string;
  start: number;
  end: number;
  duration: number;
  row?: number;
  selected?: boolean;
  dragging?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  begin: [event: PointerEvent, action: TimelineEdit["action"]];
  move: [event: PointerEvent];
  finish: [event: PointerEvent];
  cancel: [];
  open: [event: MouseEvent];
  nudge: [event: KeyboardEvent, action: TimelineEdit["action"]];
}>();
</script>
<template>
  <div
    class="timeline-item"
    :class="{ selected, dragging }"
    :style="{
      left: (start / duration) * 100 + '%',
      width: Math.max(0.15, ((end - start) / duration) * 100) + '%',
      top: (row || 0) * 27 + 2 + 'px',
    }"
    :data-start="start"
    :data-end="end"
    @pointermove="emit('move', $event)"
    @pointerup="emit('finish', $event)"
    @pointercancel="emit('cancel')"
    @lostpointercapture="emit('cancel')"
    @dragstart.prevent
  >
    <button
      class="timeline-body"
      :aria-label="label"
      :disabled="disabled"
      aria-describedby="timeline-help"
      @pointerdown="emit('begin', $event, 'move')"
      @click="emit('open', $event)"
      @keydown="emit('nudge', $event, 'move')"
    >
      <slot />
    </button>
    <button
      v-for="edge in ['start', 'end'] as const"
      :key="edge"
      class="timeline-handle"
      :class="edge"
      :aria-label="'Resize ' + edge + ' of ' + label.replace(/^Edit /, '')"
      :disabled="disabled"
      aria-describedby="timeline-help"
      @pointerdown.stop="
        emit('begin', $event, edge === 'start' ? 'trim-start' : 'trim-end')
      "
      @click.stop.prevent
      @keydown="
        emit('nudge', $event, edge === 'start' ? 'trim-start' : 'trim-end')
      "
    />
  </div>
</template>
