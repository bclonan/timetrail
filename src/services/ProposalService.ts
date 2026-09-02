import {
  applyOperations,
  clone,
  id,
  now,
  summarize,
  type Operation,
  type ProjectRecord,
  type Proposal,
} from "../domain/model";
import {
  BrowserWorkspaceStore,
  storage,
} from "../storage/BrowserWorkspaceStore";
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
  preview(record: ProjectRecord, p: Proposal) {
    return applyOperations(
      record.project,
      p.operations.filter((_, i) => !p.reviewedOperations[String(i)]),
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
      for (const pid of [...new Set(proposalIds)]) {
        const p: Proposal = await tx.objectStore("proposals").get(pid);
        if (!p || p.projectId !== projectId)
          throw new Error("Proposal does not belong to this project.");
        if (p.status !== "pending") continue;
        if (decision === "accept" && p.baseRevision !== r.revision)
          throw new Error(
            "This proposal is stale. Create a fresh proposal against the current revision.",
          );
        p.operations.forEach((op, i) => {
          if (
            !p.reviewedOperations[String(i)] &&
            (!operationIndexes || operationIndexes.includes(i))
          ) {
            p.reviewedOperations[String(i)] =
              decision === "accept" ? "accepted" : "rejected";
            if (decision === "accept") ops.push(op);
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
        if (p.status === "pending") p.baseRevision = r.revision;
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
}
export const proposals = new ProposalService(storage);
