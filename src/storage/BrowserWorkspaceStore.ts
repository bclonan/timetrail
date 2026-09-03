import { openDB, type IDBPDatabase } from "idb";
import type { RetouchJob } from "../domain/retouch";
import {
  clone,
  id,
  now,
  type AuditEvent,
  type ProjectRecord,
  type Proposal,
} from "../domain/model";
export interface AssetMetadata {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  backend: "opfs" | "indexeddb";
  path: string;
}
export interface StorageProvider {
  records(): Promise<ProjectRecord[]>;
  record(id: string): Promise<ProjectRecord | undefined>;
  save(record: ProjectRecord): Promise<void>;
  proposals(projectId: string): Promise<Proposal[]>;
  putProposal(proposal: Proposal): Promise<void>;
  putAsset(blob: Blob, name: string, assetId?: string): Promise<AssetMetadata>;
  getAsset(id: string): Promise<Blob>;
}
const stores = [
  "projects",
  "projectRevisions",
  "proposals",
  "toolEvents",
  "settings",
  "assetMetadata",
  "assetBlobs",
  "localGalleryIndex",
] as const;
export class BrowserWorkspaceStore implements StorageProvider {
  private connection?: Promise<IDBPDatabase>;
  constructor(private name = "timetrail-v1") {}
  db() {
    return (this.connection ??= openDB(this.name, 1, {
      upgrade(db) {
        for (const s of stores) db.createObjectStore(s, { keyPath: "id" });
      },
    }));
  }
  async records(): Promise<ProjectRecord[]> {
    return (await this.db()).getAll("projects");
  }
  async retouchJobs(projectId: string): Promise<RetouchJob[]> {
    return (await (await this.db()).getAll("settings"))
      .filter(
        (j) =>
          j.id.startsWith("retouch_job_") && j.value.projectId === projectId,
      )
      .map((j) => j.value)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async retouchJob(jobId: string): Promise<RetouchJob | undefined> {
    return (await (await this.db()).get("settings", `retouch_job_${jobId}`))
      ?.value;
  }
  async saveRetouch(job: RetouchJob, expectedVersion?: number) {
    const tx = (await this.db()).transaction("settings", "readwrite");
    const key = `retouch_job_${job.id}`;
    const existing = await tx.store.get(key);
    if (existing?.value.version !== expectedVersion) {
      await tx.done;
      throw new Error(
        "The editing request changed. Inspect it again before continuing.",
      );
    }
    await tx.store.put({ id: key, value: clone(job) });
    await tx.done;
  }
  async record(projectId: string): Promise<ProjectRecord | undefined> {
    return (await this.db()).get("projects", projectId);
  }
  async save(record: ProjectRecord) {
    const db = await this.db();
    const tx = db.transaction(
      ["projects", "projectRevisions", "localGalleryIndex"],
      "readwrite",
    );
    await tx
      .objectStore("projects")
      .put({ ...clone(record), id: record.project.id });
    await tx.objectStore("projectRevisions").put({
      id: `${record.project.id}_${record.revision}`,
      project: clone(record.project),
      revision: record.revision,
    });
    await tx.objectStore("localGalleryIndex").put({
      id: record.project.id,
      title: record.project.title,
      tags: record.project.tags,
    });
    await tx.done;
  }
  async proposals(projectId: string): Promise<Proposal[]> {
    return (await this.db())
      .getAll("proposals")
      .then((ps) =>
        ps
          .filter((p) => p.projectId === projectId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
  }
  async putProposal(p: Proposal) {
    await (await this.db()).put("proposals", clone(p));
  }
  async events(): Promise<AuditEvent[]> {
    return (await (await this.db()).getAll("toolEvents")).sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    );
  }
  async log(
    event: Partial<AuditEvent> & { toolName: string; message: string },
  ) {
    const stamp = now();
    await (
      await this.db()
    ).put("toolEvents", {
      id: id(),
      arguments: {},
      startedAt: stamp,
      completedAt: stamp,
      duration: 0,
      status: "ok",
      ...clone(event),
    });
  }
  async clearLog() {
    await (await this.db()).clear("toolEvents");
  }
  async setting<T>(key: string): Promise<T | undefined> {
    return (await (await this.db()).get("settings", key))?.value;
  }
  async setSetting(key: string, value: unknown) {
    await (await this.db()).put("settings", { id: key, value: clone(value) });
  }
  async putAsset(
    blob: Blob,
    name: string,
    assetId = id(),
  ): Promise<AssetMetadata> {
    if (blob.size > 100 * 1024 * 1024)
      throw new Error("This file exceeds the 100 MB per-file limit.");
    const ext =
      name
        .split(".")
        .pop()
        ?.replace(/[^a-z0-9]/gi, "")
        .slice(0, 8) || "bin";
    const path = `${assetId}.${ext}`;
    let backend: "opfs" | "indexeddb" = "indexeddb";
    try {
      if (navigator.storage?.getDirectory) {
        const root = await navigator.storage.getDirectory();
        const app = await root.getDirectoryHandle("timetrail", {
          create: true,
        });
        const dir = await app.getDirectoryHandle("assets", { create: true });
        const file = await dir.getFileHandle(path, { create: true });
        const writer = await file.createWritable();
        await writer.write(blob);
        await writer.close();
        backend = "opfs";
      }
    } catch {
      /* A denied OPFS permission can fall back to IndexedDB. */
    }
    try {
      const db = await this.db();
      const tx = db.transaction(["assetMetadata", "assetBlobs"], "readwrite");
      if (backend === "indexeddb")
        await tx.objectStore("assetBlobs").put({ id: assetId, blob });
      const metadata = {
        id: assetId,
        name,
        mimeType: blob.type,
        sizeBytes: blob.size,
        backend,
        path,
      };
      await tx.objectStore("assetMetadata").put(metadata);
      await tx.done;
      return metadata;
    } catch {
      throw new Error(
        "Could not store the asset. Free browser storage and try again.",
      );
    }
  }
  async getAsset(assetId: string): Promise<Blob> {
    const db = await this.db();
    const meta: AssetMetadata | undefined = await db.get(
      "assetMetadata",
      assetId,
    );
    if (!meta)
      throw new Error(`Asset ${assetId} is missing. Import its ZIP pack.`);
    if (meta.backend === "opfs") {
      const root = await navigator.storage.getDirectory();
      const app = await root.getDirectoryHandle("timetrail");
      const dir = await app.getDirectoryHandle("assets");
      return (await dir.getFileHandle(meta.path)).getFile();
    }
    const item = await db.get("assetBlobs", assetId);
    if (!item) throw new Error("Stored asset could not be read.");
    return item.blob;
  }
  async assetMetadata(assetId: string): Promise<AssetMetadata> {
    return (await this.db()).get("assetMetadata", assetId);
  }
  async quota() {
    return navigator.storage?.estimate
      ? navigator.storage.estimate()
      : { usage: 0, quota: 0 };
  }
}
export const storage = new BrowserWorkspaceStore();
