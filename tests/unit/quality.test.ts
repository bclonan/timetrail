import { describe, expect, it } from "vitest";
import {
  applyOperations,
  clone,
  createProject,
  id,
  now,
  type Cue,
  type ProjectRecord,
} from "../../src/domain/model";
import {
  analyzeQuality,
  QualityService,
} from "../../src/services/QualityService";
import { organizeHotspots } from "../../src/services/HotspotService";
import { hotspotAppearance } from "../../src/domain/hotspots";
import { interactiveContents } from "../../src/runtime/frameTrailMapper";
import { BrowserWorkspaceStore } from "../../src/storage/BrowserWorkspaceStore";
import { ProjectService } from "../../src/services/ProjectService";
import { ProposalService } from "../../src/services/ProposalService";
import { reviewIndexes } from "../../src/services/ProposalReviewPlan";
import { TimelineCompiler } from "../../src/services/TimelineCompiler";

async function setup() {
  const store = new BrowserWorkspaceStore("quality-" + id());
  const projects = new ProjectService(store);
  const p = await projects.create({
    title: "Review fixture",
    topic: "Test",
    targetSeconds: 30,
  });
  return {
    store,
    projects,
    p,
    r: (await store.record(p.id))!,
    service: new ProposalService(store),
  };
}
const cue = (name: string): Cue => ({
  id: id(),
  kind: "hotspot",
  title: name,
  body: "An explanation",
  start: 1,
  end: 8,
  position: { x: 20, y: 20, width: 60, height: 60 },
  style: { backgroundColor: "#112233", textColor: "#112233" },
  provenance: { createdBy: "agent", createdAt: now() },
});
describe("proposal acceptance repair", () => {
  it("rejects conflicting bulk acceptance atomically", async () => {
    const { service, p, r, store } = await setup();
    const a = await service.create(r, "First", [
      { type: "set_project_meta", value: { title: "First" } },
    ]);
    const b = await service.create(r, "Second", [
      { type: "set_project_meta", value: { title: "Second" } },
    ]);
    await expect(
      service.review(p.id, [a.id, b.id], "accept", 0),
    ).rejects.toThrow("conflicting");
    expect((await store.record(p.id))!.revision).toBe(0);
    expect(
      (await store.proposals(p.id)).every((p) => p.status === "pending"),
    ).toBe(true);
  });
  it("keeps independent sibling proposals reviewable after accepting one", async () => {
    const { service, store, p, r } = await setup();
    const a = await service.create(r, "First", [
      { type: "add_cue", sequenceId: p.activeSequenceId, value: cue("First") },
    ]);
    const b = await service.create(r, "Second", [
      { type: "add_cue", sequenceId: p.activeSequenceId, value: cue("Second") },
    ]);
    await service.review(p.id, [a.id], "accept", 0);
    expect(
      (await store.proposals(p.id)).find((p) => p.id === b.id)?.baseRevision,
    ).toBe(0);
    const next = await service.review(p.id, [b.id], "accept", 1);
    expect(next.project.sequences[0]!.cues).toHaveLength(2);
  });
  it("reports the conflicting title instead of overwriting an accepted title", async () => {
    const { service, p, r } = await setup();
    const a = await service.create(r, "First", [
      { type: "set_project_meta", value: { title: "First" } },
    ]);
    const b = await service.create(r, "Second", [
      { type: "set_project_meta", value: { title: "Second" } },
    ]);
    await service.review(p.id, [a.id], "accept", 0);
    await expect(service.review(p.id, [b.id], "accept", 1)).rejects.toThrow(
      "conflicts with newer edits at set project meta.title",
    );
  });
  it("plans resource dependencies, requires their explicit selection and leaves unrelated metadata out", async () => {
    const { service, p, r, store } = await setup();
    const compiled = new TimelineCompiler().compile(p, {
      title: "New title",
      topic: "Test",
      targetSeconds: 30,
      segments: [{ title: "Card" }],
    });
    const prop = await service.create(
      r,
      "Dependent draft",
      compiled.operations,
    );
    const sequence = prop.operations.findIndex(
      (o) => o.type === "upsert_sequence",
    );
    const resource = prop.operations.findIndex(
      (o) => o.type === "upsert_media",
    );
    const plan = reviewIndexes(p, prop, "accept", [sequence]);
    expect(plan.sort()).toEqual([resource, sequence].sort());
    await expect(
      service.review(p.id, [prop.id], "accept", 0, [sequence]),
    ).rejects.toThrow("related changes");
    expect((await store.record(p.id))!.revision).toBe(0);
    const result = await service.review(p.id, [prop.id], "accept", 0, plan);
    expect(result.project.title).toBe(p.title);
    expect(result.project.sequences[0]!.clips).toHaveLength(1);
    await service.review(p.id, [prop.id], "accept", 1);
    expect((await store.record(p.id))!.project.title).toBe("New title");
  });
  it("does not revive a conflicting stale proposal by rejecting another item", async () => {
    const { service, p, r, store } = await setup();
    const a = await service.create(r, "Chosen", [
      { type: "set_project_meta", value: { title: "Chosen" } },
    ]);
    const b = await service.create(r, "Conflict", [
      { type: "set_project_meta", value: { title: "Conflicting title" } },
      { type: "add_cue", sequenceId: p.activeSequenceId, value: cue("Extra") },
    ]);
    await service.review(p.id, [a.id], "accept", 0);
    await service.review(p.id, [b.id], "reject", 1, [1]);
    expect(
      (await store.proposals(p.id)).find((p) => p.id === b.id)?.baseRevision,
    ).toBe(0);
    await expect(service.review(p.id, [b.id], "accept", 1)).rejects.toThrow(
      "conflicts with newer edits",
    );
    expect((await store.record(p.id))!.project.title).toBe("Chosen");
  });
  it("restores rejected dependencies and rejects invalid indexes without writes", async () => {
    const { service, p, r, store } = await setup();
    const compiled = new TimelineCompiler().compile(p, {
      title: "Card",
      topic: "Test",
      targetSeconds: 30,
      segments: [{ title: "Card" }],
    });
    const prop = await service.create(r, "Draft", compiled.operations);
    const index = prop.operations.findIndex((o) => o.type === "upsert_media");
    await service.review(p.id, [prop.id], "reject", 0, [index]);
    await service.restoreItem(p.id, prop.id, index, 0);
    expect((await store.proposals(p.id))[0]!.reviewedOperations).toEqual({});
    await expect(
      service.review(p.id, [prop.id], "accept", 0, [999]),
    ).rejects.toThrow("out of range");
    expect((await store.record(p.id))!.revision).toBe(0);
  });
});
describe("hotspot and full-film quality review", () => {
  it("renders validated custom styles and rejects unsafe color strings", () => {
    const c = cue("Custom");
    c.style = {
      shape: "rectangle",
      preset: "filled",
      color: "#123456",
      backgroundColor: "#112233",
      textColor: "#ffffff",
      borderWidth: 3,
    };
    const attrs = interactiveContents([c], "main")[0]!.body[
      "frametrail:attributes"
    ];
    expect(attrs).toMatchObject({
      shape: "rectangle",
      backgroundColor: "#112233",
      borderWidth: 3,
    });
    expect(() =>
      hotspotAppearance({ color: "red; background:url(https://bad.test)" }),
    ).toThrow();
  });
  it("groups, styles, lays out and shifts selected hotspots without moving other cues", () => {
    const p = createProject({
      title: "Test",
      topic: "Test",
      targetSeconds: 30,
    });
    const a = cue("A"),
      b = cue("B");
    p.sequences[0]!.cues = [a, b];
    const next = applyOperations(
      p,
      organizeHotspots(p, {
        cueIds: [a.id],
        group: "Labels",
        layout: "stack-right",
        style: { preset: "outline" },
        shiftSeconds: 2,
      }),
    );
    expect(next.sequences[0]!.cues[0]).toMatchObject({
      group: "Labels",
      start: 3,
      position: { x: 68 },
      style: { preset: "outline" },
    });
    expect(next.sequences[0]!.cues[1]).toEqual(b);
    expect(() =>
      organizeHotspots(p, { cueIds: [a.id], shiftSeconds: -10 }),
    ).toThrow();
  });
  it("reviews every screen and merges contrast/layout/duplicate fixes without losing content", async () => {
    const p = createProject({
      title: "Test",
      topic: "Test",
      targetSeconds: 30,
    });
    const a = cue("A"),
      b = { ...clone(a), id: id() };
    p.sequences[0]!.cues = [a, b];
    p.sequences.push({
      ...clone(p.sequences[0]!),
      id: id(),
      cues: [{ ...cue("Later"), start: 15, end: 15.2 }],
    });
    const r = { project: p, revision: 0 } as ProjectRecord;
    const service = new QualityService();
    const report = await service.scan(r, false);
    expect(report.sequences).toBe(2);
    expect(report.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining([
        "timeline_gap",
        "duplicate_cue",
        "blocking_hotspots",
        "low_contrast",
        "brief_interaction",
      ]),
    );
    const next = applyOperations(
      p,
      service.fixes(
        r,
        report.id,
        report.findings.filter((f) => f.changes?.length).map((f) => f.id),
      ),
    );
    expect(next.sequences[0]!.cues).toHaveLength(1);
    expect(next.sequences[0]!.cues[0]!.body).toBe(a.body);
    const again = analyzeQuality(next, 1);
    expect(
      again.findings.some((f) =>
        [
          "duplicate_cue",
          "blocking_hotspots",
          "low_contrast",
          "brief_interaction",
        ].includes(f.code),
      ),
    ).toBe(false);
    expect(() =>
      service.fixes({ ...r, revision: 1 }, report.id, [report.findings[0]!.id]),
    ).toThrow("stale");
    expect(report.remainingMediaIds).toHaveLength(0);
  });
  it("reports unreachable required flags and quiz collisions without inventing a repair", () => {
    const p = createProject({
      title: "Test",
      topic: "Test",
      targetSeconds: 30,
    });
    const branch = {
      ...cue("Blocked"),
      kind: "branch" as const,
      branch: {
        label: "Continue",
        targetSequenceId: p.activeSequenceId,
        requiresFlag: "missing",
      },
    };
    const quiz = {
      ...cue("Question"),
      kind: "quiz" as const,
      quiz: { question: "Q", options: ["A", "B"], answerIndex: 0 },
    };
    p.sequences[0]!.cues = [branch, quiz];
    const findings = analyzeQuality(p, 0).findings;
    expect(
      findings.some((f) => f.code === "unreachable_choice" && !f.changes),
    ).toBe(true);
    expect(findings.some((f) => f.code === "quiz_obstruction")).toBe(true);
  });
});
