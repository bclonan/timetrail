import Fuse from "fuse.js";
import { z } from "zod";
import { projectSchema, safeUrl, type Project } from "../domain/model";
import { storage } from "../storage/BrowserWorkspaceStore";
import { recipeIds, makeExample, type RecipeId } from "../demo/exampleRecipes";
export const gallerySchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  items: z
    .array(
      z.object({
        id: z.string().max(100),
        title: z.string().max(300),
        summary: z.string().max(2000),
        creator: z.string().max(300),
        tags: z.array(z.string().max(60)).max(30),
        durationSeconds: z.number().nonnegative(),
        thumbnail: z.string().max(3000).optional(),
        projectUrl: z.string().max(3000),
        watchUrl: z.string().max(3000).optional(),
        license: z.string().max(300),
      }),
    )
    .max(200),
});
export interface GalleryItem {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  durationSeconds: number;
  source: "local" | "published";
  projectUrl?: string;
  thumbnail?: string;
  creator?: string;
  untrusted?: boolean;
}
export interface GalleryProvider {
  list(): Promise<GalleryItem[]>;
}
export class LocalGalleryProvider implements GalleryProvider {
  async list() {
    return (await storage.records()).map((r) => ({
      id: r.project.id,
      title: r.project.title,
      summary: r.project.description,
      tags: r.project.tags,
      durationSeconds: r.project.sequences[0]!.durationSeconds,
      source: "local" as const,
    }));
  }
}
export class StaticManifestGalleryProvider implements GalleryProvider {
  constructor(private url: string) {}
  async list() {
    const url = safeUrl(new URL(this.url, location.origin).href);
    const r = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      credentials: "omit",
    });
    if (!r.ok) throw new Error("Could not load gallery.");
    const text = await r.text();
    if (text.length > 500000) throw new Error("Gallery manifest is too large.");
    const parsed = gallerySchema.parse(JSON.parse(text));
    return parsed.items.map((i) => ({
      ...i,
      projectUrl: safeUrl(new URL(i.projectUrl, url).href),
      thumbnail: i.thumbnail
        ? safeUrl(new URL(i.thumbnail, url).href)
        : undefined,
      source: "published" as const,
      untrusted: true,
    }));
  }
}
export function searchGallery(
  items: GalleryItem[],
  query = "",
  tags: string[] = [],
  source = "all",
) {
  const filtered = items.filter(
    (i) =>
      (source === "all" || i.source === source) &&
      tags.every((t) => i.tags.includes(t)),
  );
  return query
    ? new Fuse(filtered, {
        keys: ["title", "summary", "tags"],
        threshold: 0.35,
      })
        .search(query)
        .map((r) => r.item)
    : filtered;
}
export class GalleryService {
  warnings: string[] = [];
  async list() {
    this.warnings = [];
    const sources: GalleryProvider[] = [
      new LocalGalleryProvider(),
      ...[
        "/gallery/catalog.json",
        ...(import.meta.env.VITE_GALLERY_MANIFEST_URLS || "")
          .split(",")
          .filter(Boolean),
      ].map((u) => new StaticManifestGalleryProvider(u)),
    ];
    const result = await Promise.allSettled(sources.map((s) => s.list()));
    return result.flatMap((r) => {
      if (r.status === "fulfilled") return r.value;
      this.warnings.push(String(r.reason));
      return [];
    });
  }
  async open(item: GalleryItem): Promise<Project> {
    if (item.source === "local") {
      const r = await storage.record(item.id);
      if (!r) throw new Error("Local project not found.");
      return r.project;
    }
    if (
      recipeIds.some((id) => item.id === `example_${id}`) &&
      new URL(item.projectUrl!).origin === location.origin
    )
      return makeExample(
        item.id.replace("example_", "") as RecipeId,
        location.origin,
      );
    const r = await fetch(safeUrl(item.projectUrl!), {
      signal: AbortSignal.timeout(8000),
      credentials: "omit",
    });
    if (!r.ok) throw new Error("Published project is unavailable.");
    const text = await r.text();
    if (text.length > 2000000)
      throw new Error("Published project exceeds the size limit.");
    return projectSchema.parse(JSON.parse(text));
  }
}
export const gallery = new GalleryService();
