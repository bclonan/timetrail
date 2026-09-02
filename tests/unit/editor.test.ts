import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useEditor } from "../../src/stores/editor";
import { useWorkspace } from "../../src/stores/workspace";
import { applyOperations, clone } from "../../src/domain/model";

beforeEach(() => setActivePinia(createPinia()));
async function setup() {
  const w = useWorkspace();
  await w.create({ title: "Editor test", topic: "A film", targetSeconds: 90 });
  return { w, e: useEditor() };
}
describe("shared editor drafts", () => {
  it("preserves an existing card background when filling unrelated fields", async () => {
    const { e } = await setup();
    e.open("card");
    e.fill({ form: "card", fields: { background: "ink" } }, 0);
    e.fill({ form: "card", fields: { heading: "New heading" } }, 0);
    expect(e.card.background).toBe("ink");
  });
  it("fills and stages a card, chapter and narration without changing the approved project", async () => {
    const { w, e } = await setup();
    const before = clone(w.approved);
    e.open("card");
    e.fill(
      {
        form: "card",
        fields: {
          heading: "First screen",
          body: "Content",
          narration: "Read this",
          duration: 12,
          background: "ink",
        },
      },
      0,
    );
    expect(e.card.heading).toBe("First screen");
    const result = await e.submit("save", true);
    expect(result.status).toBe("pending_human_review");
    expect(w.approved).toEqual(before);
    const preview = applyOperations(w.approved!, w.pending[0]!.operations);
    expect(preview.sequences[0]!.clips[0]!.durationSeconds).toBe(12);
    expect(preview.sequences[0]!.cues.map((c) => c.kind)).toEqual([
      "chapter",
      "caption",
      "narration",
    ]);
    expect(preview.media[0]!.importedBy).toBe("agent");
  });
  it("rejects stale form edits and saves after a human commit", async () => {
    const { w, e } = await setup();
    e.open("project");
    await w.commit([
      { type: "set_project_meta", value: { title: "New human title" } },
    ]);
    expect(() =>
      e.fill({ form: "project", fields: { title: "Late edit" } }, 0),
    ).toThrow(/stale/);
    await expect(e.submit("save", true)).rejects.toThrow(/stale/);
    expect(w.approved!.title).toBe("New human title");
    expect(w.pending).toHaveLength(0);
  });
  it("requires the matching form and rejects unknown fields and unsafe URLs", async () => {
    const { e } = await setup();
    e.open("card");
    expect(() =>
      e.fill({ form: "project", fields: { title: "Wrong form" } }, 0),
    ).toThrow(/Open this form/);
    expect(() =>
      e.fill({ form: "card", fields: { image: "javascript:alert(1)" } }, 0),
    ).toThrow();
    expect(() =>
      e.fill({ form: "card", fields: { script: "alert(1)" } } as never, 0),
    ).toThrow();
  });
  it("creates a screen and blocks deleting the active screen", async () => {
    const { w, e } = await setup();
    e.open("sequence");
    e.fill(
      { form: "sequence", fields: { title: "A detour", durationSeconds: 20 } },
      0,
    );
    await e.submit();
    expect(w.approved!.sequences).toHaveLength(2);
    e.open("sequence", w.approved!.activeSequenceId);
    await expect(e.submit("delete", true)).rejects.toThrow(/Active sequence/);
    expect(w.pending).toHaveLength(0);
  });
  it("duplicates screens with distinct cue and clip IDs", async () => {
    const { w, e } = await setup();
    e.open("card");
    e.card.heading = "Hello";
    await e.submit();
    e.open("sequence", w.sequenceId);
    const ops = await e.operations("duplicate", "agent");
    const p = applyOperations(w.approved!, ops);
    expect(p.sequences).toHaveLength(2);
    expect(p.sequences[1]!.clips[0]!.id).not.toBe(p.sequences[0]!.clips[0]!.id);
    expect(p.sequences[1]!.cues[0]!.id).not.toBe(p.sequences[0]!.cues[0]!.id);
  });
  it("checks clip overlap and extends the sequence when duplicating", async () => {
    const { w, e } = await setup();
    e.open("card");
    e.card.heading = "Hello";
    e.card.duration = 60;
    await e.submit();
    const c = w.sequence!.clips[0]!;
    e.open("clip", c.id);
    await e.submit("duplicate");
    expect(w.sequence!.durationSeconds).toBe(120);
    e.open("clip", w.sequence!.clips[1]!.id);
    e.clip!.timelineStart = 2;
    await expect(e.submit("save", true)).rejects.toThrow(/overlap/);
    expect(w.pending).toHaveLength(0);
  });
  it("updates generated card text and linked narration while preserving unrelated cues", async () => {
    const { w, e } = await setup();
    e.open("card");
    e.card.heading = "Before";
    e.card.narration = "Old words";
    await e.submit();
    e.open("card", w.approved!.media[0]!.id);
    e.card.heading = "After";
    e.card.narration = "New words";
    await e.submit();
    expect(w.sequence!.cues.find((c) => c.kind === "chapter")!.title).toBe(
      "After",
    );
    expect(w.sequence!.cues.find((c) => c.kind === "narration")!.body).toBe(
      "New words",
    );
    e.open("card", w.approved!.media[0]!.id);
    e.card.narration = "";
    await e.submit();
    expect(w.sequence!.cues.map((c) => c.kind)).toEqual(["chapter"]);
  });
  it("prevents deletion of referenced card media", async () => {
    const { w, e } = await setup();
    e.open("card");
    e.card.heading = "Hello";
    await e.submit();
    e.open("card", w.approved!.media[0]!.id);
    await expect(e.submit("delete", true)).rejects.toThrow(
      /Missing clip media/,
    );
  });
  it("edits all quiz fields, clears optional cue fields, and rejects broken branches", async () => {
    const { w, e } = await setup();
    e.open("cue");
    e.fill(
      {
        form: "cue",
        fields: {
          kind: "quiz",
          start: 0,
          end: 5,
          quiz: { question: "Which?", options: ["A", "B"], answerIndex: 1 },
          position: { x: 10, y: 10, width: 30, height: 30 },
        },
      },
      0,
    );
    await e.submit();
    expect(w.sequence!.cues[0]!.quiz!.options).toEqual(["A", "B"]);
    e.fill({ form: "cue", fields: { kind: "note" }, clear: ["position"] }, 1);
    expect(e.cue!.quiz).toBeUndefined();
    expect(e.cue!.position).toBeUndefined();
    e.fill(
      {
        form: "cue",
        fields: {
          kind: "branch",
          branch: { label: "Go", targetSequenceId: "missing" },
        },
      },
      1,
    );
    await expect(e.submit("save", true)).rejects.toThrow(/Branch destination/);
  });
});
