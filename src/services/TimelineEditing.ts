import { clone, type Project, type Sequence } from "../domain/model";

export type TimelineEdit = {
  sequenceId: string;
  itemId: string;
  kind: "clip" | "cue";
  action: "move" | "trim-start" | "trim-end";
  time: number;
};
const round = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, min: number, max: number) =>
  round(Math.max(min, Math.min(max, v)));
export function cueEnd(cue: Sequence["cues"][number], duration: number) {
  return cue.end ?? Math.min(duration, cue.start + 5);
}

// Pure edit preview. Persistence and final cross-project validation stay in ProjectService.
export function editTimeline(project: Project, edit: TimelineEdit): Sequence {
  if (!Number.isFinite(edit.time))
    throw new Error("Timeline time must be finite.");
  const source = project.sequences.find((s) => s.id === edit.sequenceId);
  if (!source) throw new Error("Sequence not found.");
  const seq = clone(source);
  if (edit.kind === "cue") {
    const cue = seq.cues.find((c) => c.id === edit.itemId);
    if (!cue) throw new Error("Cue not found.");
    const end = cueEnd(cue, seq.durationSeconds);
    if (edit.action === "move") {
      const start = clamp(
        edit.time,
        0,
        seq.durationSeconds - (end - cue.start),
      );
      if (cue.end !== undefined) cue.end = round(start + end - cue.start);
      cue.start = start;
    } else if (edit.action === "trim-start") {
      cue.start = clamp(edit.time, 0, Math.max(0, end - 0.1));
      cue.end = end;
    } else
      cue.end = clamp(
        edit.time,
        Math.min(seq.durationSeconds, cue.start + 0.1),
        seq.durationSeconds,
      );
    return seq;
  }
  const clip = seq.clips.find((c) => c.id === edit.itemId);
  if (!clip) throw new Error("Clip not found.");
  const sorted = [...seq.clips].sort(
    (a, b) => a.timelineStart - b.timelineStart,
  );
  const originalIndex = sorted.findIndex((c) => c.id === clip.id);
  const start = clip.timelineStart;
  const end = start + clip.durationSeconds;
  if (edit.action === "move") {
    const target = clamp(
      edit.time,
      0,
      seq.durationSeconds - clip.durationSeconds,
    );
    const others = sorted.filter((c) => c.id !== clip.id);
    const overlap = others.some(
      (c) =>
        target < c.timelineStart + c.durationSeconds - 0.001 &&
        target + clip.durationSeconds > c.timelineStart + 0.001,
    );
    if (!overlap) clip.timelineStart = target;
    else {
      // Drop over a clip to insert before/after its center. Retain the gaps between slots.
      const center = target + clip.durationSeconds / 2;
      const index = others.findIndex(
        (c) => center < c.timelineStart + c.durationSeconds / 2,
      );
      const insert = index < 0 ? others.length : index;
      if (insert === originalIndex) return seq;
      const gaps = sorted.map(
        (c, i) =>
          c.timelineStart -
          (i
            ? sorted[i - 1]!.timelineStart + sorted[i - 1]!.durationSeconds
            : 0),
      );
      others.splice(insert, 0, clip);
      let cursor = 0;
      others.forEach((c, i) => {
        c.timelineStart = round(cursor + gaps[i]!);
        cursor = c.timelineStart + c.durationSeconds;
      });
    }
    // Fully contained cues belong to that clip's moment. Spanning cues stay at their original times.
    for (const cue of seq.cues) {
      const owner = source.clips.find(
        (c) =>
          cue.start >= c.timelineStart &&
          cue.start < c.timelineStart + c.durationSeconds &&
          cueEnd(cue, source.durationSeconds) <=
            c.timelineStart + c.durationSeconds + 0.001,
      );
      if (!owner) continue;
      const moved = seq.clips.find((c) => c.id === owner.id)!;
      const delta = moved.timelineStart - owner.timelineStart;
      cue.start = round(cue.start + delta);
      if (cue.end !== undefined) cue.end = round(cue.end + delta);
    }
    return seq;
  }
  const timed = ["video", "audio", "youtube", "vimeo"].includes(
    project.media.find((m) => m.id === clip.mediaId)?.type || "",
  );
  const previousEnd = originalIndex
    ? sorted[originalIndex - 1]!.timelineStart +
      sorted[originalIndex - 1]!.durationSeconds
    : 0;
  if (edit.action === "trim-start") {
    const min = Math.max(previousEnd, timed ? start - clip.sourceStart : 0);
    const nextStart = clamp(edit.time, min, end - 0.1);
    if (timed) {
      clip.sourceEnd ??= round(clip.sourceStart + clip.durationSeconds);
      clip.sourceStart = round(clip.sourceStart + nextStart - start);
    }
    clip.timelineStart = nextStart;
    clip.durationSeconds = round(end - nextStart);
  } else {
    const nextStart =
      sorted[originalIndex + 1]?.timelineStart ?? seq.durationSeconds;
    const mediaDuration = project.media.find(
      (m) => m.id === clip.mediaId,
    )?.durationSeconds;
    const max = Math.min(
      nextStart,
      timed && mediaDuration !== undefined
        ? start + Math.max(0.1, mediaDuration - clip.sourceStart)
        : nextStart,
    );
    const nextEnd = clamp(edit.time, start + 0.1, max);
    clip.durationSeconds = round(nextEnd - start);
    if (timed) clip.sourceEnd = round(clip.sourceStart + clip.durationSeconds);
  }
  return seq;
}

export function snapTimelineTime(
  time: number,
  length: number,
  moving: boolean,
  points: number[],
  tolerance: number,
) {
  let result = Math.round(time * 10) / 10;
  let distance = tolerance;
  for (const point of points)
    for (const candidate of moving ? [point, point - length] : [point]) {
      if (Math.abs(candidate - time) < distance) {
        distance = Math.abs(candidate - time);
        result = candidate;
      }
    }
  return round(result);
}
