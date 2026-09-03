import { describe, expect, it } from "vitest";
import {
  clone,
  id,
  now,
  type Cue,
  type Operation,
} from "../../src/domain/model";
import { defaultPresentation } from "../../src/domain/presentation";
import { BrowserWorkspaceStore } from "../../src/storage/BrowserWorkspaceStore";
import { ProjectService } from "../../src/services/ProjectService";
import { ProposalService } from "../../src/services/ProposalService";

async function setup() {
  const name = "rebase-" + id();
  const store = new BrowserWorkspaceStore(name);
  const projects = new ProjectService(store);
  const p = await projects.create({
    title: "Film",
    topic: "Ocean",
    targetSeconds: 30,
  });
  const cue: Cue = {
    id: id(),
    kind: "hotspot",
    title: "Original",
    body: "Context",
    start: 1,
    end: 8,
    position: { x: 10, y: 10, width: 20, height: 20 },
    style: { backgroundColor: "#112233", textColor: "#ffffff" },
    provenance: { createdBy: "human", createdAt: now() },
  };
  p.sequences[0]!.cues.push(cue);
  p.presentation = defaultPresentation();
  const r = { project: p, revision: 0, past: [], future: [], applied: [] };
  await store.save(r);
  const edit = (value: Cue): Operation => ({
    type: "update_cue",
    sequenceId: p.activeSequenceId,
    value,
  });
  return {
    name,
    store,
    projects,
    service: new ProposalService(store),
    p,
    r,
    cue,
    edit,
  };
}

describe("proposal recovery against saved revisions", () => {
  it("recovers old cue drafts whose editor rewrote creation metadata", async () => {
    const { projects, service, p, r, cue, edit } = await setup();
    const draft = await service.create(r, "Legacy editor", [
      edit({
        ...cue,
        title: "Agent text",
        provenance: {
          ...cue.provenance,
          createdBy: "agent",
          createdAt: "2026-09-02T12:00:00.000Z",
        },
      }),
    ]);
    const provenance = {
      ...cue.provenance,
      createdAt: "2026-09-02T13:00:00.000Z",
    };
    await projects.commit(
      p.id,
      [edit({ ...cue, body: "Human text", provenance })],
      0,
    );
    const next = await service.review(p.id, [draft.id], "accept", 1);
    expect(next.project.sequences[0]!.cues[0]).toMatchObject({
      title: "Agent text",
      body: "Human text",
      provenance,
    });
  });
  it("previews and accepts an old draft after multiple human saves and reopening storage", async () => {
    const { name, projects, service, p, r, cue, edit } = await setup();
    const draft = await service.create(r, "Text", [
      edit({ ...cue, title: "Proposed" }),
    ]);
    await projects.commit(
      p.id,
      [{ type: "set_project_meta", value: { title: "Human title" } }],
      0,
    );
    const current = await projects.commit(
      p.id,
      [
        edit({
          ...cue,
          position: { ...cue.position!, x: 60 },
          style: { ...cue.style, textColor: "#ffcc00" },
        }),
      ],
      1,
    );
    const reopened = new BrowserWorkspaceStore(name);
    const nextService = new ProposalService(reopened);
    const preview = await nextService.preview(
      current,
      (await reopened.proposals(p.id))[0]!,
    );
    expect(preview.title).toBe("Human title");
    expect(preview.sequences[0]!.cues[0]).toMatchObject({
      title: "Proposed",
      position: { x: 60 },
      style: { textColor: "#ffcc00" },
    });
    expect((await reopened.record(p.id))!.revision).toBe(2);
    const accepted = await nextService.review(p.id, [draft.id], "accept", 2);
    expect(accepted.project).toEqual({
      ...preview,
      updatedAt: accepted.project.updatedAt,
    });
    expect(accepted.revision).toBe(3);
  });
  it("preserves independent saved cues inside a proposed whole-screen replacement", async () => {
    const { projects, service, p, r, cue } = await setup();
    const sequence = clone(p.sequences[0]!);
    sequence.title = "Proposed screen";
    sequence.cues[0]!.body = "Proposed explanation";
    const draft = await service.create(r, "Screen", [
      { type: "upsert_sequence", value: sequence },
    ]);
    const extra = { ...cue, id: id(), title: "Human note" };
    await projects.commit(
      p.id,
      [{ type: "add_cue", sequenceId: sequence.id, value: extra }],
      0,
    );
    const accepted = await service.review(p.id, [draft.id], "accept", 1);
    expect(accepted.project.sequences[0]!.title).toBe("Proposed screen");
    expect(accepted.project.sequences[0]!.cues).toEqual([
      { ...cue, body: "Proposed explanation" },
      extra,
    ]);
  });
  it("merges distinct custom-view properties by view ID", async () => {
    const { projects, service, p, r } = await setup();
    const proposed = clone(p.presentation!);
    proposed.views[0]!.theme = "paper";
    const draft = await service.create(r, "View", [
      { type: "set_presentation", value: proposed },
    ]);
    const saved = clone(p.presentation!);
    saved.views[0]!.accent = "#aa2233";
    await projects.commit(
      p.id,
      [{ type: "set_presentation", value: saved }],
      0,
    );
    const next = await service.review(p.id, [draft.id], "accept", 1);
    expect(next.project.presentation!.views[0]).toMatchObject({
      theme: "paper",
      accent: "#aa2233",
    });
  });
  it("names real conflicts, keeps preview read-only, and allows other items to be accepted", async () => {
    const { store, projects, service, p, r, cue, edit } = await setup();
    const draft = await service.create(r, "Mixed", [
      edit({ ...cue, title: "Agent title" }),
      {
        type: "set_project_meta",
        value: { description: "Proposed description" },
      },
    ]);
    const current = await projects.commit(
      p.id,
      [edit({ ...cue, title: "Human title" })],
      0,
    );
    await expect(service.preview(current, draft)).rejects.toThrow(
      "Item 1 conflicts with newer edits at update cue.title",
    );
    await expect(service.review(p.id, [draft.id], "accept", 1)).rejects.toThrow(
      "Item 1 conflicts",
    );
    expect((await store.record(p.id))!.revision).toBe(1);
    expect(await service.plan(current, draft, "accept", [1])).toEqual([1]);
    await service.review(p.id, [draft.id], "accept", 1, [1]);
    await expect(
      service.review(p.id, [draft.id], "accept", 2, [0]),
    ).rejects.toThrow("Item 1 conflicts");
    await service.review(p.id, [draft.id], "reject", 2, [0]);
    await service.restoreItem(p.id, draft.id, 0, 2);
    await expect(
      service.review(p.id, [draft.id], "accept", 2, [0]),
    ).rejects.toThrow("Item 1 conflicts");
    expect(
      (await store.record(p.id))!.project.sequences[0]!.cues[0]!.title,
    ).toBe("Human title");
  });
  it("does not resurrect a cue removed by the human", async () => {
    const { projects, service, p, r, cue, edit } = await setup();
    const draft = await service.create(r, "Text", [
      edit({ ...cue, body: "Agent text" }),
    ]);
    await projects.commit(
      p.id,
      [{ type: "remove_cue", sequenceId: p.activeSequenceId, id: cue.id }],
      0,
    );
    await expect(service.review(p.id, [draft.id], "accept", 1)).rejects.toThrow(
      "conflicts",
    );
  });
  it("does not delete a cue that the human changed after the deletion proposal", async () => {
    const { projects, service, p, r, cue, edit } = await setup();
    const draft = await service.create(r, "Remove", [
      { type: "remove_cue", sequenceId: p.activeSequenceId, id: cue.id },
    ]);
    await projects.commit(p.id, [edit({ ...cue, body: "Saved text" })], 0);
    await expect(service.review(p.id, [draft.id], "accept", 1)).rejects.toThrow(
      "conflicts",
    );
  });
  it("recovers a legacy revision-zero draft from complete history", async () => {
    const { store, projects, service, p, r, cue, edit } = await setup();
    const draft = await service.create(r, "Text", [
      edit({ ...cue, title: "Recovered" }),
    ]);
    await (await store.db()).delete("projectRevisions", `${p.id}_0`);
    await projects.commit(
      p.id,
      [{ type: "set_project_meta", value: { description: "Human" } }],
      0,
    );
    const next = await service.review(p.id, [draft.id], "accept", 1);
    expect(next.project.sequences[0]!.cues[0]!.title).toBe("Recovered");
    expect(next.project.description).toBe("Human");
  });
  it("uses stored baselines after undo and redo instead of guessing from the history stack", async () => {
    const { projects, service, p, r, cue, edit } = await setup();
    const draft = await service.create(r, "Text", [
      edit({ ...cue, title: "Recovered" }),
    ]);
    await projects.commit(
      p.id,
      [{ type: "set_project_meta", value: { description: "Human" } }],
      0,
    );
    await projects.travel(p.id, "undo", 1);
    await projects.travel(p.id, "redo", 2);
    const next = await service.review(p.id, [draft.id], "accept", 3);
    expect(next.project.description).toBe("Human");
    expect(next.project.sequences[0]!.cues[0]!.title).toBe("Recovered");
  });
  it("refuses to guess when a legacy baseline and complete history are both unavailable", async () => {
    const { store, projects, service, p, r, cue, edit } = await setup();
    const draft = await service.create(r, "Text", [
      edit({ ...cue, title: "Unknown baseline" }),
    ]);
    await (await store.db()).delete("projectRevisions", `${p.id}_0`);
    await projects.commit(
      p.id,
      [{ type: "set_project_meta", value: { description: "Human" } }],
      0,
    );
    await projects.travel(p.id, "undo", 1);
    await expect(service.review(p.id, [draft.id], "accept", 2)).rejects.toThrow(
      "original revision is unavailable",
    );
    expect((await store.record(p.id))!.revision).toBe(2);
  });
});
