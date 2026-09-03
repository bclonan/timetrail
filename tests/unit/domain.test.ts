import { describe, it, expect } from "vitest";
import { isValid } from "ulid";
import {
  createProject,
  id,
  now,
  projectSchema,
  applyOperations,
  clone,
  type Operation,
} from "../../src/domain/model";
import {
  allocateDurations,
  clampTime,
  TimelineCompiler,
} from "../../src/services/TimelineCompiler";
import { makeDemo, dnaPlan } from "../../src/demo/demoProject";
import { BrowserWorkspaceStore } from "../../src/storage/BrowserWorkspaceStore";
import { ProjectService } from "../../src/services/ProjectService";
import { ProposalService } from "../../src/services/ProposalService";
import {
  detectUrl,
  mediaFromUrl,
  srtToVtt,
  parseVtt,
} from "../../src/services/MediaImportService";
import { ShareService } from "../../src/services/ShareService";
import {
  toFrameTrailContents,
  toFrameTrailResources,
  captionsVtt,
} from "../../src/runtime/frameTrailMapper";
import {
  runtimeMessage,
  parentMessage,
  validBridgeEvent,
} from "../../src/runtime/bridgeMessages";
import { searchGallery } from "../../src/services/GalleryService";
import { compact } from "../../src/webmcp/registry";
import { zipManifest } from "../../src/services/ExportService";
const setup = async () => {
  const db = new BrowserWorkspaceStore("test-" + id());
  const ps = new ProjectService(db);
  const proposal = new ProposalService(db);
  const p = await ps.create({ title: "Test story", topic: "Biology" });
  return { db, ps, proposal, p, r: (await db.record(p.id))! };
};
const note = (sequenceId: string): Operation => ({
  type: "add_cue",
  sequenceId,
  value: {
    id: id(),
    kind: "note",
    start: 0,
    end: 10,
    title: "A note",
    body: "Context",
    provenance: { createdBy: "human", createdAt: now() },
  },
});
describe("portable projects", () => {
  it("generates ULIDs and valid empty projects", () => {
    const p = createProject({ title: "A film", topic: "A topic" });
    expect(isValid(p.id)).toBe(true);
    expect(isValid(p.activeSequenceId)).toBe(true);
    expect(projectSchema.safeParse(p).success).toBe(true);
  });
  it("rejects unknown versions, missing active sequence, and duplicate IDs", () => {
    const p = makeDemo();
    expect(projectSchema.safeParse({ ...p, schemaVersion: "2" }).success).toBe(
      false,
    );
    expect(
      projectSchema.safeParse({ ...p, activeSequenceId: "missing" }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({ ...p, media: [...p.media, p.media[0]] })
        .success,
    ).toBe(false);
  });
  it("rejects overlapping clips and out of range cues", () => {
    const p = makeDemo();
    p.sequences[0]!.clips[1]!.timelineStart = 1;
    expect(projectSchema.safeParse(p).success).toBe(false);
    const q = makeDemo();
    q.sequences[0]!.cues[0]!.end = 100;
    expect(projectSchema.safeParse(q).success).toBe(false);
  });
  it("rejects invalid quiz answers and broken branch targets", () => {
    const p = makeDemo();
    p.sequences[0]!.cues.find((c) => c.quiz)!.quiz!.answerIndex = 50;
    expect(projectSchema.safeParse(p).success).toBe(false);
    const q = makeDemo();
    q.sequences[0]!.cues.find((c) => c.branch)!.branch!.targetSequenceId =
      "gone";
    expect(projectSchema.safeParse(q).success).toBe(false);
  });
  it("applies idempotent operations without mutating source", () => {
    const p = createProject({ title: "A", topic: "B" });
    const op = note(p.activeSequenceId);
    const next = applyOperations(p, [op]);
    expect(p.sequences[0]!.cues).toHaveLength(0);
    expect(applyOperations(next, [op])).toEqual(next);
  });
});
describe("compiler", () => {
  it("allocates weighted duration exactly", () => {
    expect(allocateDurations(90, [1, 2, 1])).toEqual([22.5, 45, 22.5]);
    expect(allocateDurations(91, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(
      91,
    );
  });
  it("rejects negative and zero duration weights", () => {
    expect(() => allocateDurations(90, [1, -1])).toThrow();
    expect(() => allocateDurations(-1, [1])).toThrow();
  });
  it("clamps to the sequence duration", () => {
    expect(clampTime(-1, 90)).toBe(0);
    expect(clampTime(100, 90)).toBe(90);
  });
  it("compiles deterministically with chapters, captions, quiz and branches", () => {
    const p = createProject({ title: "DNA", topic: "DNA" });
    const c = new TimelineCompiler();
    const first = c.compile(p, dnaPlan);
    expect(c.compile(p, dnaPlan)).toEqual(first);
    const result = applyOperations(p, first.operations);
    expect(result.sequences).toHaveLength(2);
    expect(result.sequences[0]!.clips).toHaveLength(4);
    expect(
      result.sequences[0]!.cues.filter((c) => c.kind === "chapter"),
    ).toHaveLength(4);
    expect(result.sequences[0]!.cues.some((c) => c.quiz)).toBe(true);
    expect(
      result.sequences[0]!.clips.at(-1)!.timelineStart +
        result.sequences[0]!.clips.at(-1)!.durationSeconds,
    ).toBe(90);
  });
  it("marks unknown media duration for human review", () => {
    const p = createProject({ title: "A", topic: "B" });
    const m = mediaFromUrl("https://www.youtube.com/watch?v=abc");
    p.media.push(m);
    const r = new TimelineCompiler().compile(p, {
      title: "A",
      topic: "B",
      targetSeconds: 90,
      segments: [{ title: "A video", mediaId: m.id }],
    });
    expect(r.warnings[0]).toContain("estimated");
    expect(
      applyOperations(p, r.operations).sequences[0]!.clips[0]!.timingEstimated,
    ).toBe(true);
  });
  it("preserves and clamps human notes during storyboard replacement", () => {
    const p = createProject({ title: "A", topic: "B", targetSeconds: 90 });
    const op = note(p.activeSequenceId);
    if (op.type === "add_cue") {
      op.value.start = 65;
      op.value.end = 85;
    }
    const withNote = applyOperations(p, [op]);
    const result = new TimelineCompiler().compile(withNote, {
      ...dnaPlan,
      targetSeconds: 50,
    });
    const noteCue = applyOperations(
      withNote,
      result.operations,
    ).sequences[0]!.cues.find((c) => c.provenance.createdBy === "human");
    expect(noteCue?.end).toBe(50);
  });
});
describe("transactional storage and proposals", () => {
  it("persists metadata across a new store connection", async () => {
    const { db, p } = await setup();
    const reopened = new BrowserWorkspaceStore((db as any).name);
    expect((await reopened.record(p.id))?.project.title).toBe("Test story");
  });
  it("creation and preview never mutate approved state", async () => {
    const { db, proposal, r, p } = await setup();
    const prop = await proposal.create(r, "Draft", [note(p.activeSequenceId)]);
    expect((await db.record(p.id))?.revision).toBe(0);
    expect((await proposal.preview(r, prop)).sequences[0]!.cues).toHaveLength(
      1,
    );
    expect((await db.record(p.id))?.project.sequences[0]!.cues).toHaveLength(0);
  });
  it("accepts an entire proposal atomically and once", async () => {
    const { proposal, r, p, db } = await setup();
    const prop = await proposal.create(r, "Draft", [
      note(p.activeSequenceId),
      note(p.activeSequenceId),
    ]);
    const accepted = await proposal.review(p.id, [prop.id], "accept", 0);
    expect(accepted.revision).toBe(1);
    expect(accepted.project.sequences[0]!.cues).toHaveLength(2);
    expect((await proposal.review(p.id, [prop.id], "accept", 1)).revision).toBe(
      1,
    );
    expect((await db.proposals(p.id))[0]!.status).toBe("accepted");
  });
  it("rolls back all changes when validation fails at acceptance", async () => {
    const { proposal, r, p, db } = await setup();
    const prop = await proposal.create(r, "Draft", [note(p.activeSequenceId)]);
    prop.operations.push({ type: "remove_sequence", id: p.activeSequenceId });
    await db.putProposal(prop);
    await expect(
      proposal.review(p.id, [prop.id], "accept", 0),
    ).rejects.toThrow();
    expect((await db.record(p.id))?.revision).toBe(0);
    expect((await db.proposals(p.id))[0]!.status).toBe("pending");
  });
  it("rejects without modifying the project", async () => {
    const { proposal, r, p, db } = await setup();
    const prop = await proposal.create(r, "Draft", [note(p.activeSequenceId)]);
    await proposal.review(p.id, [prop.id], "reject", 0);
    expect((await db.record(p.id))?.project).toEqual(p);
    expect((await db.proposals(p.id))[0]!.status).toBe("rejected");
  });
  it("supports item acceptance and rejection", async () => {
    const { proposal, r, p, db } = await setup();
    const prop = await proposal.create(r, "Draft", [
      note(p.activeSequenceId),
      note(p.activeSequenceId),
    ]);
    await proposal.review(p.id, [prop.id], "accept", 0, [0]);
    await proposal.review(p.id, [prop.id], "reject", 1, [1]);
    expect((await db.record(p.id))?.project.sequences[0]!.cues).toHaveLength(1);
    expect((await db.proposals(p.id))[0]!.reviewedOperations).toEqual({
      "0": "accepted",
      "1": "rejected",
    });
  });
  it("accepts an unrelated older proposal but rejects concurrent commits", async () => {
    const { proposal, r, p, ps } = await setup();
    const prop = await proposal.create(r, "Draft", [note(p.activeSequenceId)]);
    await ps.commit(p.id, [note(p.activeSequenceId)], 0);
    expect(
      (await proposal.review(p.id, [prop.id], "accept", 1)).project
        .sequences[0]!.cues,
    ).toHaveLength(2);
    await expect(
      ps.commit(p.id, [note(p.activeSequenceId)], 0),
    ).rejects.toThrow("changed");
  });
  it("undo and redo preserve revision monotonicity", async () => {
    const { p, ps } = await setup();
    await ps.commit(p.id, [note(p.activeSequenceId)], 0);
    const undone = await ps.travel(p.id, "undo", 1);
    expect(undone.project.sequences[0]!.cues).toHaveLength(0);
    expect(undone.revision).toBe(2);
    const redone = await ps.travel(p.id, "redo", 2);
    expect(redone.project.sequences[0]!.cues).toHaveLength(1);
    expect(redone.revision).toBe(3);
  });
  it("remixes all IDs and rewires branches", async () => {
    const { ps } = await setup();
    const source = makeDemo();
    const remix = await ps.remix(source);
    expect(remix.id).not.toBe(source.id);
    expect(projectSchema.safeParse(remix).success).toBe(true);
    expect(
      remix.sequences[0]!.cues.find((c) => c.branch)!.branch!.targetSequenceId,
    ).toBe(remix.sequences[1]!.id);
  });
  it("stores blobs in IndexedDB when OPFS is absent", async () => {
    const { db } = await setup();
    const m = await db.putAsset(
      new Blob(["abc"], { type: "text/plain" }),
      "a.txt",
    );
    expect(m.backend).toBe("indexeddb");
    expect((await db.getAsset(m.id)).size).toBe(3);
  });
});
describe("media and safety", () => {
  it.each([
    ["https://youtu.be/123", "youtube"],
    ["https://vimeo.com/123", "vimeo"],
    ["https://a.org/video.mp4?x=1", "video"],
    ["https://a.org/pic.webp", "image"],
    ["https://a.org/a.mp3", "audio"],
    ["https://a.org/a.pdf", "pdf"],
    ["https://a.org/article", "webpage"],
  ])("detects %s", (url, type) => expect(detectUrl(url)).toBe(type));
  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>",
    "file:///C:/secret",
    "https://user:pass@example.com",
  ])("rejects unsafe %s", (url) => expect(() => mediaFromUrl(url)).toThrow());
  it("converts SRT and imports timed captions", () => {
    const vtt = srtToVtt("1\n00:00:01,000 --> 00:00:03,000\nHello");
    expect(vtt).toContain("00:00:01.000");
    expect(parseVtt(vtt)).toEqual([{ start: 1, end: 3, body: "Hello" }]);
  });
});
describe("FrameTrail and bridge", () => {
  it("maps the demo into stable FrameTrail contents and W3C annotations", () => {
    const p = makeDemo();
    const contents = toFrameTrailContents(p, p.activeSequenceId);
    expect(contents).toEqual(toFrameTrailContents(p, p.activeSequenceId));
    // Four scene images, one quiz, one branch and seven compact annotation markers.
    expect(contents[0]!.hypervideo.contents).toHaveLength(13);
    expect(
      contents[0]!.hypervideo.contents.some(
        (c) => c.body["frametrail:type"] === "quiz",
      ),
    ).toBe(true);
    expect(
      contents[0]!.hypervideo.contents.some(
        (c) => c.body["frametrail:type"] === "hotspot",
      ),
    ).toBe(true);
    expect(contents[0]!.hypervideo.contents[0]!.body["frametrail:type"]).toBe(
      "image",
    );
    expect(contents[0]!.hypervideo.globalEvents).toEqual({});
    expect(toFrameTrailResources(p)[0]!.data[p.media[0]!.id]).toBeDefined();
    expect(captionsVtt(p, p.activeSequenceId)).toContain("WEBVTT");
  });
  it("never maps code snippets or executable metadata", () => {
    const p = makeDemo();
    p.sequences[0]!.cues[0]!.body = "<script>alert(1)</script>";
    p.media[0]!.name = "<img src=x onerror=alert(1)>";
    const mapped = JSON.stringify(toFrameTrailContents(p, p.activeSequenceId));
    expect(mapped).not.toContain('"CodeSnippet"');
    expect(mapped).not.toContain("<script>");
    expect(mapped).toContain("&lt;script&gt;");
  });
  it("validates message ranges and event origin/source", () => {
    expect(
      runtimeMessage.safeParse({
        type: "TIMETRAIL_PLAYHEAD",
        currentTime: -1,
        duration: 90,
        paused: false,
        sequenceId: "a",
      }).success,
    ).toBe(false);
    expect(
      parentMessage.safeParse({
        type: "TIMETRAIL_PLAYBACK",
        action: "execute-code",
      }).success,
    ).toBe(false);
    expect(
      validBridgeEvent(
        new MessageEvent("message", {
          origin: "https://evil.test",
          source: window,
        }),
        window,
        "https://safe.test",
      ),
    ).toBe(false);
  });
});
describe("sharing, exports, gallery, tool outputs", () => {
  it("round trips share codes without local state", () => {
    const p = makeDemo();
    const s = new ShareService();
    expect(s.decode(s.encode(p))).toEqual(p);
    expect(s.encode(p)).toMatch(/^TT1\.[\w-]+$/);
  });
  it("rejects uploaded assets and malformed share codes", () => {
    const p = makeDemo();
    p.media[0]!.source = { kind: "asset", assetId: "local_blob" };
    expect(() => new ShareService().encode(p)).toThrow("local files");
    expect(() => new ShareService().decode("TT0.xyz")).toThrow();
  });
  it("generates an asset manifest with portable references", () => {
    const p = clone(makeDemo());
    p.media[0]!.source = { kind: "asset", assetId: "asset_a" };
    expect(
      zipManifest(p, ["project.json", "assets/asset_a.png"]).assetReferences,
    ).toEqual(["asset://asset_a"]);
  });
  it("searches local and static creation metadata", () => {
    const items = [
      {
        id: "a",
        title: "DNA to protein",
        summary: "A lesson",
        tags: ["Biology"],
        durationSeconds: 90,
        source: "published" as const,
      },
      {
        id: "b",
        title: "Forest",
        summary: "Trees",
        tags: ["Nature"],
        durationSeconds: 30,
        source: "local" as const,
      },
    ];
    expect(searchGallery(items, "protein")[0]?.id).toBe("a");
    expect(searchGallery(items, "", [], "local")[0]?.id).toBe("b");
  });
  it("returns valid JSON within the WebMCP character budget", () => {
    const result = compact(
      Array.from({ length: 100 }, (_, i) => ({ id: i, body: "x".repeat(200) })),
    );
    expect(result.length).toBeLessThanOrEqual(1500);
    expect(() => JSON.parse(result)).not.toThrow();
    expect(
      compact({ title: "x".repeat(10000), media: Array(100).fill("abc") })
        .length,
    ).toBeLessThanOrEqual(1500);
  });
});
