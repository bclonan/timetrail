import {
  applyOperations,
  clone,
  createProject,
  id,
  now,
  projectSchema,
  type Operation,
  type Project,
  type ProjectRecord,
} from "../domain/model";
import {
  BrowserWorkspaceStore,
  storage,
} from "../storage/BrowserWorkspaceStore";
export class ProjectService {
  constructor(public storage: BrowserWorkspaceStore) {}
  async create(input: unknown) {
    const project = createProject(input);
    await this.storage.save({
      project,
      revision: 0,
      past: [],
      future: [],
      applied: [],
    });
    return project;
  }
  async import(raw: unknown) {
    const project = projectSchema.parse(raw);
    return this.remix(project);
  }
  async remix(source: Project) {
    const p = clone(projectSchema.parse(source));
    const ids = new Map<string, string>();
    const remap = (v: string) => {
      if (!ids.has(v)) ids.set(v, id());
      return ids.get(v)!;
    };
    p.id = remap(p.id);
    p.activeSequenceId = remap(p.activeSequenceId);
    p.title = `${p.title} remix`;
    p.createdAt = now();
    p.updatedAt = p.createdAt;
    p.provenance = { ...p.provenance, remixedFrom: source.id, creator: "You" };
    p.media.forEach((m) => (m.id = remap(m.id)));
    p.sequences.forEach((s) => {
      s.id = remap(s.id);
      s.clips.forEach((c) => {
        c.id = remap(c.id);
        c.mediaId = remap(c.mediaId);
      });
      s.cues.forEach((c) => {
        c.id = remap(c.id);
        if (c.resourceId) c.resourceId = remap(c.resourceId);
        if (c.branch)
          c.branch.targetSequenceId = remap(c.branch.targetSequenceId);
      });
    });
    p.presentation?.panels.forEach((panel) => {
      if (panel.sequenceId) panel.sequenceId = remap(panel.sequenceId);
      panel.entries.forEach((entry) => {
        if (entry.sequenceId) entry.sequenceId = remap(entry.sequenceId);
      });
    });
    await this.storage.save({
      project: projectSchema.parse(p),
      revision: 0,
      past: [],
      future: [],
      applied: [],
    });
    return p;
  }
  async commit(
    projectId: string,
    operations: Operation[],
    expectedRevision: number,
    transactionId = id(),
  ) {
    const db = await this.storage.db();
    const tx = db.transaction(
      ["projects", "projectRevisions", "toolEvents", "localGalleryIndex"],
      "readwrite",
    );
    try {
      const current: ProjectRecord = await tx
        .objectStore("projects")
        .get(projectId);
      if (!current) throw new Error("Project not found.");
      if (current.applied.includes(transactionId)) {
        await tx.done;
        return current;
      }
      if (current.revision !== expectedRevision)
        throw new Error("Project changed. Refresh the review before saving.");
      const project = applyOperations(current.project, operations);
      project.updatedAt = now();
      const record: ProjectRecord = {
        project,
        revision: current.revision + 1,
        past: [...current.past, current.project].slice(-30),
        future: [],
        applied: [...current.applied, transactionId],
      };
      await tx.objectStore("projects").put({ ...record, id: projectId });
      await tx.objectStore("projectRevisions").put({
        id: `${projectId}_${record.revision}`,
        project,
        revision: record.revision,
      });
      await tx
        .objectStore("localGalleryIndex")
        .put({ id: projectId, title: project.title, tags: project.tags });
      await tx.objectStore("toolEvents").put({
        id: id(),
        projectId,
        toolName: "project.commit",
        arguments: {},
        startedAt: now(),
        completedAt: now(),
        duration: 0,
        status: "ok",
        revision: record.revision,
        message: `Human saved revision ${record.revision}`,
      });
      await tx.done;
      return record;
    } catch (e) {
      tx.abort();
      await tx.done.catch(() => {});
      throw e;
    }
  }
  async travel(
    projectId: string,
    direction: "undo" | "redo",
    expectedRevision: number,
  ) {
    const db = await this.storage.db();
    const tx = db.transaction(["projects", "projectRevisions"], "readwrite");
    try {
      const r: ProjectRecord = await tx.objectStore("projects").get(projectId);
      if (r.revision !== expectedRevision)
        throw new Error("Project changed. Reload before undo or redo.");
      const stack = direction === "undo" ? r.past : r.future;
      if (!stack.length) {
        await tx.done;
        return r;
      }
      const project = stack.pop()!;
      if (direction === "undo") r.future.push(r.project);
      else r.past.push(r.project);
      r.project = project;
      r.project.updatedAt = now();
      r.revision++;
      await tx.objectStore("projects").put({ ...r, id: projectId });
      await tx.objectStore("projectRevisions").put({
        id: `${projectId}_${r.revision}`,
        project,
        revision: r.revision,
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
export const projects = new ProjectService(storage);
