import {
  applyOperations,
  clone,
  id,
  now,
  summarize,
  type Operation,
  type ProjectRecord,
  type Project,
  type Proposal,
} from "../domain/model";
import {
  BrowserWorkspaceStore,
  storage,
} from "../storage/BrowserWorkspaceStore";
import {
  rebaseProposal,
  planPreparedReview,
  conflictingOperations,
  reviewIndexes,
} from "./ProposalReviewPlan";
export class ProposalService {
  constructor(public storage: BrowserWorkspaceStore) {}
  async create(
    record: ProjectRecord,
    title: string,
    operations: Operation[],
    warnings: string[] = [],
    correlationId?: string,
  ) {
    applyOperations(record.project, operations);
    const existing = await this.storage.proposals(record.project.id);
    const duplicate = existing.find(
      (p) =>
        p.status === "pending" &&
        p.baseRevision === record.revision &&
        JSON.stringify(p.operations) === JSON.stringify(operations),
    );
    if (duplicate) return duplicate;
    // Revision zero was not stored by early releases. Keep the exact proposal
    // baseline so later human edits and undo do not invalidate unrelated work.
    const db = await this.storage.db();
    const revisionId = `${record.project.id}_${record.revision}`;
    const snapshotTx = db.transaction("projectRevisions", "readwrite");
    if (!(await snapshotTx.store.get(revisionId)))
      await snapshotTx.store.put({
        id: revisionId,
        project: clone(record.project),
        revision: record.revision,
      });
    await snapshotTx.done;
    const p: Proposal = {
      id: id(),
      projectId: record.project.id,
      status: "pending",
      title,
      createdAt: now(),
      createdBy: "agent",
      baseRevision: record.revision,
      operations: clone(operations),
      summary: summarize(operations),
      warnings,
      correlationId,
      reviewedOperations: {},
    };
    await this.storage.putProposal(p);
    await this.storage.log({
      projectId: p.projectId,
      toolName: "proposal.created",
      message: `Agent proposed ${p.summary.chapters} chapters and ${p.summary.cuesAdded} timed cards`,
      proposalIds: [p.id],
      correlationId,
    });
    return p;
  }
  private baseline(
    record: ProjectRecord,
    p: Proposal,
    snapshot?: { project: Project },
  ) {
    if (p.baseRevision === record.revision) return record.project;
    if (snapshot) return snapshot.project;
    // Legacy projects with a complete, unbroken undo history still have the
    // original revision. A shorter stack cannot prove which revision it holds.
    if (record.past.length === record.revision)
      return record.past[p.baseRevision];
    return undefined;
  }
  async prepare(record: ProjectRecord, p: Proposal) {
    if (p.projectId !== record.project.id)
      throw new Error("Proposal does not belong to this project.");
    if (p.baseRevision === record.revision)
      return { proposal: clone(p), conflicts: new Map<number, string>() };
    const snapshot = await (
      await this.storage.db()
    ).get("projectRevisions", `${p.projectId}_${p.baseRevision}`);
    return rebaseProposal(
      this.baseline(record, p, snapshot),
      record.project,
      p,
    );
  }
  async plan(
    record: ProjectRecord,
    p: Proposal,
    decision: "accept" | "reject",
    indexes?: number[],
  ) {
    return decision === "reject"
      ? reviewIndexes(record.project, p, decision, indexes)
      : planPreparedReview(
          record.project,
          await this.prepare(record, p),
          indexes,
        );
  }
  async preview(record: ProjectRecord, p: Proposal) {
    const prepared = await this.prepare(record, p);
    planPreparedReview(record.project, prepared);
    return applyOperations(
      record.project,
      prepared.proposal.operations.filter(
        (_, i) => !p.reviewedOperations[String(i)],
      ),
    );
  }
  async review(
    projectId: string,
    proposalIds: string[],
    decision: "accept" | "reject",
    expectedRevision: number,
    operationIndexes?: number[],
  ) {
    const db = await this.storage.db();
    const tx = db.transaction(
      [
        "projects",
        "projectRevisions",
        "proposals",
        "toolEvents",
        "localGalleryIndex",
      ],
      "readwrite",
    );
    try {
      const r: ProjectRecord = await tx.objectStore("projects").get(projectId);
      if (!r) throw new Error("Project not found.");
      if (r.revision !== expectedRevision)
        throw new Error(
          "Project changed during review. Please review the latest version.",
        );
      const selected: Proposal[] = [];
      const ops: Operation[] = [];
      const writes: { proposalId: string; operation: Operation }[] = [];
      if (operationIndexes && proposalIds.length !== 1)
        throw new Error("Select one proposal for item review.");
      for (const pid of [...new Set(proposalIds)]) {
        const p: Proposal = await tx.objectStore("proposals").get(pid);
        if (!p || p.projectId !== projectId)
          throw new Error("Proposal does not belong to this project.");
        if (p.status !== "pending") continue;
        const prepared =
          decision === "accept" && p.baseRevision !== r.revision
            ? rebaseProposal(
                this.baseline(
                  r,
                  p,
                  await tx
                    .objectStore("projectRevisions")
                    .get(`${projectId}_${p.baseRevision}`),
                ),
                r.project,
                p,
              )
            : { proposal: clone(p), conflicts: new Map<number, string>() };
        const plan =
          decision === "accept"
            ? planPreparedReview(r.project, prepared, operationIndexes)
            : reviewIndexes(r.project, p, decision, operationIndexes);
        if (operationIndexes) {
          if (plan.some((i) => !operationIndexes.includes(i)))
            throw new Error(
              `This item requires related changes. Review items ${plan.map((i) => i + 1).join(", ")} together.`,
            );
        }
        prepared.proposal.operations.forEach((op, i) => {
          if (
            !p.reviewedOperations[String(i)] &&
            (!operationIndexes || operationIndexes.includes(i))
          ) {
            p.reviewedOperations[String(i)] =
              decision === "accept" ? "accepted" : "rejected";
            if (decision === "accept") {
              if (
                writes.some(
                  (w) =>
                    w.proposalId !== p.id &&
                    conflictingOperations(w.operation, op),
                )
              )
                throw new Error(
                  "Selected proposals contain conflicting changes. Accept the intended proposal separately and regenerate the conflicting draft.",
                );
              writes.push({ proposalId: p.id, operation: op });
              ops.push(op);
            }
          }
        });
        if (Object.keys(p.reviewedOperations).length === p.operations.length)
          p.status = Object.values(p.reviewedOperations).includes("accepted")
            ? "accepted"
            : "rejected";
        selected.push(p);
      }
      if (ops.length) {
        const before = clone(r.project);
        r.project = applyOperations(r.project, ops);
        r.project.updatedAt = now();
        r.past = [...r.past, before].slice(-30);
        r.future = [];
        r.revision++;
        r.applied.push(...selected.map((p) => p.id));
        await tx.objectStore("projectRevisions").put({
          id: `${projectId}_${r.revision}`,
          project: r.project,
          revision: r.revision,
        });
        await tx.objectStore("projects").put({ ...r, id: projectId });
        await tx
          .objectStore("localGalleryIndex")
          .put({ id: projectId, title: r.project.title, tags: r.project.tags });
      }
      for (const p of selected) {
        await tx.objectStore("proposals").put(p);
      }
      await tx.objectStore("toolEvents").put({
        id: id(),
        projectId,
        toolName: "proposal.reviewed",
        arguments: {},
        startedAt: now(),
        completedAt: now(),
        duration: 0,
        status: "ok",
        approval: "human_confirmed",
        revision: r.revision,
        proposalIds: selected.map((p) => p.id),
        message: `Human ${decision === "accept" ? "accepted" : "rejected"} ${selected.length} proposal(s)`,
      });
      await tx.done;
      return r;
    } catch (e) {
      tx.abort();
      await tx.done.catch(() => {});
      throw e;
    }
  }
  async restoreItem(
    projectId: string,
    proposalId: string,
    index: number,
    expectedRevision: number,
  ) {
    const db = await this.storage.db();
    const tx = db.transaction(["projects", "proposals"], "readwrite");
    try {
      const r: ProjectRecord = await tx.objectStore("projects").get(projectId);
      const p: Proposal = await tx.objectStore("proposals").get(proposalId);
      if (
        !r ||
        r.revision !== expectedRevision ||
        !p ||
        p.projectId !== projectId
      )
        throw new Error("Project changed. Review the latest proposal.");
      if (p.reviewedOperations[String(index)] !== "rejected")
        throw new Error("Only rejected items can be restored.");
      delete p.reviewedOperations[String(index)];
      p.status = "pending";
      await tx.objectStore("proposals").put(p);
      await tx.done;
    } catch (error) {
      tx.abort();
      await tx.done.catch(() => {});
      throw error;
    }
  }
}
export const proposals = new ProposalService(storage);
