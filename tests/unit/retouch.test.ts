import { describe, it, expect } from "vitest";
import {
  id,
  type Clip,
  type Media,
  type Sequence,
} from "../../src/domain/model";
import {
  regionSchema,
  captureSchema,
  resultSchema,
  frameHolds,
  assertEditSource,
  type RetouchJob,
} from "../../src/domain/retouch";
import { BrowserWorkspaceStore } from "../../src/storage/BrowserWorkspaceStore";
import { editJob, readEditAsset } from "../../src/services/RetouchService";
const media: Media = {
  id: "source",
  name: "Original",
  type: "video",
  source: { kind: "asset", assetId: "original" },
  durationSeconds: 20,
  tags: [],
  importedAt: new Date().toISOString(),
  importedBy: "human",
};
const clip: Clip = {
  id: "clip",
  mediaId: media.id,
  timelineStart: 5,
  sourceStart: 2,
  sourceEnd: 12,
  durationSeconds: 10,
};
const sequence: Sequence = {
  id: "screen",
  title: "Screen",
  baseMode: "mixed",
  durationSeconds: 20,
  clips: [clip],
  cues: [
    {
      id: "caption",
      kind: "caption",
      start: 7,
      end: 10,
      body: "Do not move this",
      provenance: { createdBy: "human", createdAt: new Date().toISOString() },
    },
  ],
};
const job = (): RetouchJob => ({
  id: id(),
  projectId: "project",
  version: 0,
  createdAt: new Date().toISOString(),
  source: media,
  clip: { sequenceId: "screen", value: clip },
  frames: [],
});
describe("frame editing", () => {
  it("splits only the selected clip and preserves cue times, trims and total duration", () => {
    const result = frameHolds(
      sequence,
      clip,
      [
        { sourceSeconds: 4, duration: 0.5, mediaId: "edited1" },
        { sourceSeconds: 8, duration: 1, mediaId: "edited2" },
      ],
      20,
    );
    expect(result.cues).toEqual(sequence.cues);
    expect(result.durationSeconds).toBe(20);
    expect(
      result.clips.map((c) => [
        c.timelineStart,
        c.durationSeconds,
        c.sourceStart,
        c.mediaId,
      ]),
    ).toEqual([
      [5, 2, 2, "source"],
      [7, 0.5, 0, "edited1"],
      [7.5, 3.5, 4.5, "source"],
      [11, 1, 0, "edited2"],
      [12, 3, 9, "source"],
    ]);
    expect(result.clips[0]!.id).toBe("clip");
    expect(sequence.clips).toEqual([clip]);
  });
  it("rejects overlapping holds and holds beyond the clip", () => {
    expect(() =>
      frameHolds(sequence, clip, [
        { sourceSeconds: 3, duration: 2, mediaId: "a" },
        { sourceSeconds: 4, duration: 1, mediaId: "b" },
      ]),
    ).toThrow("overlap");
    expect(() =>
      frameHolds(sequence, clip, [
        { sourceSeconds: 11, duration: 2, mediaId: "a" },
      ]),
    ).toThrow("beyond");
    expect(() =>
      frameHolds(sequence, clip, [
        { sourceSeconds: 1, duration: 1, mediaId: "a" },
      ]),
    ).toThrow();
  });
  it("keeps a held video tail within the original source's bounds", () => {
    const held = { ...clip, sourceEnd: 4 };
    const result = frameHolds(
      { ...sequence, clips: [held] },
      held,
      [{ sourceSeconds: 3.9, duration: 2, mediaId: "edit" }],
      20,
    );
    expect(result.clips.at(-1)!.sourceStart).toBeLessThan(4);
    expect(result.clips.at(-1)!.sourceEnd).toBe(4);
  });
  it("allows unrelated screen title changes but blocks changed source files or clip timing", () => {
    const request = job();
    expect(() =>
      assertEditSource(
        request,
        [media],
        [{ ...sequence, title: "Human edit" }],
      ),
    ).not.toThrow();
    expect(() =>
      assertEditSource(
        request,
        [{ ...media, source: { kind: "asset", assetId: "replacement" } }],
        [sequence],
      ),
    ).toThrow("source changed");
    expect(() =>
      assertEditSource(
        request,
        [media],
        [{ ...sequence, clips: [{ ...clip, sourceStart: 3 }] }],
      ),
    ).toThrow("clip changed");
  });
  it("bounds mask coordinates, frame counts and hold durations", () => {
    expect(
      regionSchema.safeParse({ x: 80, y: 0, width: 21, height: 50 }).success,
    ).toBe(false);
    expect(
      regionSchema.safeParse({ x: 0, y: 0, width: 100, height: 100 }).success,
    ).toBe(true);
    expect(
      captureSchema.safeParse({
        expectedRevision: 0,
        mediaId: "source",
        clipId: "clip",
      }).success,
    ).toBe(false);
    expect(
      captureSchema.safeParse({
        expectedRevision: 0,
        mediaId: "source",
        sourceSeconds: Array(9).fill(0),
      }).success,
    ).toBe(false);
    expect(
      resultSchema.safeParse({
        jobId: "job",
        expectedVersion: 0,
        expectedRevision: 0,
        placement: "frame-holds",
        results: [{ frameId: "f", mediaId: "m", holdSeconds: 0 }],
      }).success,
    ).toBe(false);
  });
  it("persists editing requests with atomic version checks and project isolation", async () => {
    const store = new BrowserWorkspaceStore(`retouch-${id()}`),
      request = job();
    await store.saveRetouch(request);
    const reopened = new BrowserWorkspaceStore(`unused-${id()}`);
    expect((await store.retouchJobs("project"))[0]).toEqual(request);
    expect(await store.retouchJobs("another-project")).toEqual([]);
    await store.saveRetouch({ ...request, version: 1 }, 0);
    await expect(
      store.saveRetouch({ ...request, version: 2 }, 0),
    ).rejects.toThrow("request changed");
    expect((await store.retouchJob(request.id))?.version).toBe(1);
    expect(await reopened.retouchJob(request.id)).toBeUndefined();
  });
  it("does not expose another request or arbitrary local asset bytes", async () => {
    const { storage } = await import("../../src/storage/BrowserWorkspaceStore");
    const request = job();
    await storage.saveRetouch(request);
    await expect(editJob("different", request.id)).rejects.toThrow("not found");
    await expect(
      readEditAsset("project", { jobId: request.id, assetId: "private-asset" }),
    ).rejects.toThrow("does not belong");
  });
});
