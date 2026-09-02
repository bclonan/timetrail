import { describe, it, expect } from "vitest";
import {
  applyOperations,
  createProject,
  id,
  now,
  type Project,
} from "../../src/domain/model";
import {
  editTimeline,
  snapTimelineTime,
} from "../../src/services/TimelineEditing";
function fixture() {
  const p = createProject({
    title: "Timeline",
    topic: "Editing",
    targetSeconds: 90,
  });
  p.media.push({
    id: "video",
    name: "Video",
    type: "video",
    source: { kind: "remote", url: "https://example.com/video.mp4" },
    durationSeconds: 60,
    tags: [],
    importedAt: now(),
    importedBy: "human",
  });
  p.sequences[0]!.clips = [
    {
      id: "a",
      mediaId: "video",
      timelineStart: 0,
      sourceStart: 0,
      durationSeconds: 20,
    },
    {
      id: "b",
      mediaId: "video",
      timelineStart: 20,
      sourceStart: 5,
      durationSeconds: 30,
    },
    {
      id: "c",
      mediaId: "video",
      timelineStart: 50,
      sourceStart: 0,
      durationSeconds: 10,
    },
  ];
  p.sequences[0]!.cues = [
    {
      id: "caption",
      kind: "caption",
      start: 0,
      end: 20,
      body: "A",
      provenance: { createdBy: "human", createdAt: now() },
    },
    {
      id: "note",
      kind: "note",
      start: 22,
      end: 26,
      title: "B note",
      provenance: { createdBy: "human", createdAt: now() },
    },
    {
      id: "spanning",
      kind: "note",
      start: 10,
      end: 55,
      title: "Spans clips",
      provenance: { createdBy: "human", createdAt: now() },
    },
  ];
  return p;
}
function edit(
  p: Project,
  itemId: string,
  kind: "clip" | "cue",
  action: "move" | "trim-start" | "trim-end",
  time: number,
) {
  const value = editTimeline(p, {
    sequenceId: p.activeSequenceId,
    itemId,
    kind,
    action,
    time,
  });
  return applyOperations(p, [{ type: "upsert_sequence", value }]).sequences[0]!;
}
describe("timeline gestures", () => {
  it("reorders unequal clips without overlaps and moves their contained cues", () => {
    const p = fixture();
    const seq = edit(p, "a", "clip", "move", 48);
    expect(seq.clips.map((c) => [c.id, c.timelineStart])).toEqual([
      ["a", 40],
      ["b", 0],
      ["c", 30],
    ]);
    expect(seq.cues.find((c) => c.id === "caption")).toMatchObject({
      start: 40,
      end: 60,
    });
    expect(seq.cues.find((c) => c.id === "note")).toMatchObject({
      start: 2,
      end: 6,
    });
    expect(seq.cues.find((c) => c.id === "spanning")).toMatchObject({
      start: 10,
      end: 55,
    });
    expect(p.sequences[0]!.clips[0]!.timelineStart).toBe(0);
  });
  it("moves into free space without shifting other clips and preserves source offsets", () => {
    const seq = edit(fixture(), "b", "clip", "move", 60);
    expect(seq.clips.map((c) => c.timelineStart)).toEqual([0, 60, 50]);
    expect(seq.clips[1]).toMatchObject({ sourceStart: 5, durationSeconds: 30 });
    expect(seq.cues[1]).toMatchObject({ start: 62, end: 66 });
  });
  it("retains gaps when reordering and clamps movement to the sequence", () => {
    const p = fixture();
    p.sequences[0]!.clips[2]!.timelineStart = 55;
    const seq = edit(p, "c", "clip", "move", -10);
    expect(
      [...seq.clips]
        .sort((a, b) => a.timelineStart - b.timelineStart)
        .map((c) => [c.id, c.timelineStart]),
    ).toEqual([
      ["c", 0],
      ["a", 10],
      ["b", 35],
    ]);
    expect(edit(p, "a", "clip", "move", 200).clips[0]!.timelineStart).toBe(70);
  });
  it("prevents clip trims overlapping neighbors", () => {
    expect(
      edit(fixture(), "b", "clip", "trim-start", 0).clips[1],
    ).toMatchObject({ timelineStart: 20, durationSeconds: 30, sourceStart: 5 });
    expect(edit(fixture(), "b", "clip", "trim-end", 80).clips[1]).toMatchObject(
      { durationSeconds: 30, sourceEnd: 35 },
    );
  });
  it("adjusts source in/out points when trimming video", () => {
    const p = fixture();
    expect(edit(p, "b", "clip", "trim-start", 25).clips[1]).toMatchObject({
      timelineStart: 25,
      durationSeconds: 25,
      sourceStart: 10,
      sourceEnd: 35,
    });
    expect(edit(p, "c", "clip", "trim-end", 75).clips[2]).toMatchObject({
      durationSeconds: 25,
      sourceStart: 0,
      sourceEnd: 25,
    });
  });
  it("will not extend video beyond its source start or known duration", () => {
    const p = fixture();
    p.sequences[0]!.clips[1]!.timelineStart = 30;
    p.sequences[0]!.clips[1]!.durationSeconds = 20;
    expect(edit(p, "b", "clip", "trim-start", 0).clips[1]).toMatchObject({
      timelineStart: 25,
      sourceStart: 0,
    });
    p.media[0]!.durationSeconds = 12;
    expect(edit(p, "c", "clip", "trim-end", 90).clips[2]!.durationSeconds).toBe(
      12,
    );
  });
  it("moves and resizes cues without changing their content, keeping a minimum duration", () => {
    const p = fixture();
    expect(edit(p, "note", "cue", "move", 100).cues[1]).toMatchObject({
      start: 86,
      end: 90,
      title: "B note",
    });
    expect(edit(p, "note", "cue", "trim-start", 100).cues[1]).toMatchObject({
      start: 25.9,
      end: 26,
    });
    expect(edit(p, "note", "cue", "trim-end", 0).cues[1]).toMatchObject({
      start: 22,
      end: 22.1,
    });
  });
  it("keeps implicit five-second cues within bounds when moved", () => {
    const p = fixture();
    delete p.sequences[0]!.cues[1]!.end;
    expect(edit(p, "note", "cue", "move", 100).cues[1]).toMatchObject({
      start: 85,
    });
    expect(edit(p, "note", "cue", "trim-start", 24).cues[1]).toMatchObject({
      start: 24,
      end: 27,
    });
  });
  it("snaps either edge of a moved item and rejects invalid identities or times", () => {
    expect(snapTimelineTime(8.1, 2, true, [10], 0.2)).toBe(8);
    expect(snapTimelineTime(9.9, 2, false, [10], 0.2)).toBe(10);
    expect(() => edit(fixture(), id(), "clip", "move", 3)).toThrow(/not found/);
    expect(() => edit(fixture(), "a", "clip", "move", NaN)).toThrow(/finite/);
  });
});
