import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useWorkspace } from "../../stores/workspace";
import { useEditor } from "../../stores/editor";
import {
  editTimeline,
  cueEnd,
  snapTimelineTime,
  type TimelineEdit,
} from "../../services/TimelineEditing";
import type { ProjectRecord, Sequence } from "../../domain/model";

export function useTimelineDrag() {
  const w = useWorkspace();
  const e = useEditor();
  const scroll = ref<HTMLElement>();
  const preview = shallowRef<Sequence>();
  const busy = ref(false);
  const draggingId = ref("");
  const status = ref("");
  let suppressClick = false;
  let frame = 0;
  let gesture:
    | {
        record: ProjectRecord;
        edit: TimelineEdit;
        element: HTMLElement;
        pointerId: number;
        x: number;
        lastX: number;
        width: number;
        scrollLeft: number;
        origin: number;
        length: number;
        shift: boolean;
        moved: boolean;
      }
    | undefined;
  const approved = computed(
    () =>
      w.approved?.sequences.find((s) => s.id === w.sequenceId) ||
      w.approved?.sequences[0],
  );
  const shown = computed(() => preview.value || approved.value);

  function cancel() {
    const g = gesture;
    gesture = undefined;
    preview.value = undefined;
    draggingId.value = "";
    cancelAnimationFrame(frame);
    if (g?.element.hasPointerCapture(g.pointerId))
      g.element.releasePointerCapture(g.pointerId);
    if (g?.moved) {
      suppressClick = true;
      status.value = "Drag cancelled. Nothing saved.";
    }
  }
  function update() {
    const g = gesture;
    if (!g?.moved || !scroll.value) return;
    const seq = g.record.project.sequences.find(
      (s) => s.id === g.edit.sequenceId,
    )!;
    let time =
      g.origin +
      ((g.lastX - g.x + scroll.value.scrollLeft - g.scrollLeft) / g.width) *
        seq.durationSeconds;
    if (!g.shift) {
      const points = [0, seq.durationSeconds, w.time];
      for (const c of seq.clips)
        if (c.id !== g.edit.itemId)
          points.push(c.timelineStart, c.timelineStart + c.durationSeconds);
      for (const c of seq.cues)
        if (c.id !== g.edit.itemId)
          points.push(c.start, cueEnd(c, seq.durationSeconds));
      time = snapTimelineTime(
        time,
        g.length,
        g.edit.action === "move",
        points,
        (7 / g.width) * seq.durationSeconds,
      );
    }
    preview.value = editTimeline(g.record.project, { ...g.edit, time });
    const item =
      g.edit.kind === "clip"
        ? preview.value.clips.find((c) => c.id === g.edit.itemId)!
        : preview.value.cues.find((c) => c.id === g.edit.itemId)!;
    const start = "timelineStart" in item ? item.timelineStart : item.start;
    const end =
      "durationSeconds" in item
        ? start + item.durationSeconds
        : cueEnd(item, seq.durationSeconds);
    status.value = `${g.edit.kind === "clip" ? "Clip" : "Cue"}: ${start.toFixed(1)}s to ${end.toFixed(1)}s. Release to save. Escape cancels.`;
  }
  function autoscroll() {
    const g = gesture;
    if (!g?.moved || !scroll.value) return;
    const rect = scroll.value.getBoundingClientRect();
    const direction =
      g.lastX < rect.left + 36 ? -1 : g.lastX > rect.right - 36 ? 1 : 0;
    if (direction) {
      scroll.value.scrollLeft += direction * 10;
      update();
    }
    frame = requestAnimationFrame(autoscroll);
  }
  function begin(
    event: PointerEvent,
    kind: "clip" | "cue",
    itemId: string,
    action: TimelineEdit["action"] = "move",
  ) {
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      busy.value ||
      gesture ||
      !approved.value
    )
      return;
    suppressClick = false;
    if (w.previewProject) {
      w.notify("Restore the approved version before editing its timeline.");
      return;
    }
    const element = event.currentTarget as HTMLElement;
    const track = element.closest(".lane-track") as HTMLElement;
    const item =
      kind === "clip"
        ? approved.value.clips.find((c) => c.id === itemId)!
        : approved.value.cues.find((c) => c.id === itemId)!;
    const start = "timelineStart" in item ? item.timelineStart : item.start;
    const end =
      "durationSeconds" in item
        ? start + item.durationSeconds
        : cueEnd(item, approved.value.durationSeconds);
    gesture = {
      record: w.requireRecord(),
      edit: {
        sequenceId: approved.value.id,
        itemId,
        kind,
        action,
        time: start,
      },
      element,
      pointerId: event.pointerId,
      x: event.clientX,
      lastX: event.clientX,
      width: track.getBoundingClientRect().width,
      scrollLeft: scroll.value?.scrollLeft || 0,
      origin: action === "trim-end" ? end : start,
      length: end - start,
      moved: false,
      shift: event.shiftKey,
    };
    element.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    const g = gesture;
    if (!g || g.pointerId !== event.pointerId) return;
    g.lastX = event.clientX;
    g.shift = event.shiftKey;
    if (!g.moved && Math.abs(g.lastX - g.x) >= 4) {
      g.moved = true;
      draggingId.value = g.edit.itemId;
      if (!w.paused) w.playback("pause");
      frame = requestAnimationFrame(autoscroll);
    }
    if (g.moved) {
      event.preventDefault();
      update();
    }
  }
  async function finish(event: PointerEvent) {
    const g = gesture;
    if (!g || g.pointerId !== event.pointerId) return;
    if (g.moved) {
      g.lastX = event.clientX;
      g.shift = event.shiftKey;
      update();
    }
    const result = preview.value;
    gesture = undefined;
    cancelAnimationFrame(frame);
    if (g.element.hasPointerCapture(g.pointerId))
      g.element.releasePointerCapture(g.pointerId);
    suppressClick = g.moved;
    draggingId.value = "";
    if (!g.moved || !result) return;
    const source = g.record.project.sequences.find(
      (s) => s.id === g.edit.sequenceId,
    );
    if (JSON.stringify(source) === JSON.stringify(result)) {
      preview.value = undefined;
      status.value = "Position unchanged.";
      return;
    }
    busy.value = true;
    try {
      await w.commit([{ type: "upsert_sequence", value: result }], {
        projectId: g.record.project.id,
        revision: g.record.revision,
      });
      e.close();
      w.selectedCue = "";
      status.value = "Timeline saved. Undo is available.";
    } catch (error) {
      w.error = error instanceof Error ? error.message : String(error);
      status.value = "Edit not saved.";
    } finally {
      preview.value = undefined;
      busy.value = false;
    }
  }
  function click(event: MouseEvent, kind: "clip" | "cue", itemId: string) {
    if (suppressClick && event.detail !== 0) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    suppressClick = false;
    if (busy.value || w.previewProject) return;
    e.open(kind, itemId);
    if (kind === "cue")
      w.playback(
        "seek",
        approved.value!.cues.find((c) => c.id === itemId)!.start,
      );
  }
  async function nudge(
    event: KeyboardEvent,
    kind: "clip" | "cue",
    itemId: string,
    action: TimelineEdit["action"] = "move",
  ) {
    if (
      !["ArrowLeft", "ArrowRight"].includes(event.key) ||
      busy.value ||
      gesture ||
      w.previewProject ||
      !approved.value
    )
      return;
    event.preventDefault();
    const record = w.requireRecord();
    const seq = approved.value;
    const item =
      kind === "clip"
        ? seq.clips.find((c) => c.id === itemId)!
        : seq.cues.find((c) => c.id === itemId)!;
    const start = "timelineStart" in item ? item.timelineStart : item.start;
    const end =
      "durationSeconds" in item
        ? start + item.durationSeconds
        : cueEnd(item, seq.durationSeconds);
    let time =
      (action === "trim-end" ? end : start) +
      (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 1 : 0.1);
    if (kind === "clip" && action === "move" && event.altKey) {
      const order = [...seq.clips].sort(
        (a, b) => a.timelineStart - b.timelineStart,
      );
      const neighbor =
        order[
          order.findIndex((c) => c.id === itemId) +
            (event.key === "ArrowLeft" ? -1 : 1)
        ];
      if (!neighbor) return;
      time =
        neighbor.timelineStart +
        neighbor.durationSeconds / 2 -
        (end - start) / 2 +
        (event.key === "ArrowRight" ? 0.001 : -0.001);
    }
    const result = editTimeline(record.project, {
      kind,
      action,
      itemId,
      sequenceId: seq.id,
      time,
    });
    if (JSON.stringify(result) === JSON.stringify(seq)) return;
    busy.value = true;
    await w.run(async () => {
      await w.commit([{ type: "upsert_sequence", value: result }], {
        projectId: record.project.id,
        revision: record.revision,
      });
      e.close();
      w.selectedCue = "";
      status.value = "Timeline saved. Undo is available.";
    });
    busy.value = false;
  }
  function key(event: KeyboardEvent) {
    if (event.key === "Escape" && gesture) {
      event.preventDefault();
      cancel();
    }
  }
  window.addEventListener("keydown", key);
  window.addEventListener("blur", cancel);
  window.addEventListener("resize", cancel);
  watch(
    () =>
      `${w.approved?.id}:${w.record?.revision}:${w.sequenceId}:${Boolean(w.previewProject)}`,
    cancel,
  );
  onBeforeUnmount(() => {
    cancel();
    window.removeEventListener("keydown", key);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("resize", cancel);
  });
  return {
    scroll,
    approved,
    shown,
    draggingId,
    busy,
    status,
    begin,
    move,
    finish,
    cancel,
    click,
    nudge,
  };
}
