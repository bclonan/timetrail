import { describe, it, expect, vi } from "vitest";
import { File as NodeFile } from "node:buffer";
import { createPinia, setActivePinia } from "pinia";
import { makeExample, recipe, recipeIds } from "../../src/demo/exampleRecipes";
import { compileProduction } from "../../src/services/ProductionService";
import {
  applyOperations,
  clone,
  createProject,
  id,
  projectSchema,
} from "../../src/domain/model";
import { presentationSchema } from "../../src/domain/presentation";
import {
  BrowserWorkspaceStore,
  storage,
} from "../../src/storage/BrowserWorkspaceStore";
import { ProjectService } from "../../src/services/ProjectService";
import {
  uploadAsset,
  fetchAsset,
} from "../../src/services/AssetTransferService";
import { resolveNasa } from "../../src/services/MediaSearchService";
import { useWorkspace } from "../../src/stores/workspace";

describe("complete production data", () => {
  it.each(recipeIds)(
    "compiles %s deterministically with valid references and saved views",
    (name) => {
      const p = createProject({ title: "Empty", topic: "Empty" });
      const { spec, media } = recipe(name, "https://example.com");
      const a = compileProduction(p, spec, media);
      const b = compileProduction(p, spec, media);
      expect(a.operations).toEqual(b.operations);
      const next = applyOperations(p, a.operations);
      expect(projectSchema.safeParse(next).success).toBe(true);
      expect(next.presentation?.views).toHaveLength(3);
      expect(p.media).toHaveLength(0);
      expect(p.sequences[0]!.clips).toHaveLength(0);
    },
  );
  it("uses neutral artwork for a non-biology subject", () => {
    const p = makeExample("pizza", "https://example.com");
    expect(
      p.media.every(
        (m) =>
          m.source.kind !== "generated" ||
          m.source.document.illustration === "none",
      ),
    ).toBe(true);
  });
  it("rejects unsafe views, duplicate panels and dangling panel destinations", () => {
    const p = makeExample("europa", "https://example.com");
    const bad = clone(p.presentation!);
    bad.views[0]!.panels.push("missing");
    expect(() => presentationSchema.parse(bad)).toThrow("missing panel");
    const url = clone(p);
    url.presentation!.panels[2]!.entries[0]!.url = "javascript:alert(1)";
    expect(() => projectSchema.parse(url)).toThrow();
    const destination = clone(p);
    destination.presentation!.panels[3]!.entries[0]!.sequenceId = "missing";
    expect(() => projectSchema.parse(destination)).toThrow("destination");
  });
  it("remaps panel navigation and branches when duplicating without changing the source", async () => {
    const db = new BrowserWorkspaceStore("production-remix-" + id());
    const service = new ProjectService(db);
    const p = makeExample("europa", "https://example.com");
    const before = clone(p);
    const copy = await service.remix(p);
    expect(copy.id).not.toBe(p.id);
    expect(
      copy
        .presentation!.panels.flatMap((p) => p.entries)
        .filter((e) => e.sequenceId)
        .every((e) => copy.sequences.some((s) => s.id === e.sequenceId)),
    ).toBe(true);
    expect(p).toEqual(before);
    expect(projectSchema.safeParse(copy).success).toBe(true);
  });
  it("only a presentation operation changes views and keeps timelines byte-identical", () => {
    const p = makeExample("europa", "https://example.com");
    const views = clone(p.presentation!);
    views.views[0]!.aspect = "9:16";
    views.views[0]!.name = "Portrait";
    const next = applyOperations(p, [
      { type: "set_presentation", value: views },
    ]);
    expect(next.sequences).toEqual(p.sequences);
    expect(next.media).toEqual(p.media);
  });
  it("requires an investigation flag for the gated branch and keeps state between sequences", () => {
    setActivePinia(createPinia());
    const w = useWorkspace();
    w.loadEphemeral(makeExample("phishing", "https://example.com"));
    const cue = w.sequence!.cues.find((c) => c.branch?.requiresFlag)!;
    const before = w.sequenceId;
    w.choose(cue);
    expect(w.sequenceId).toBe(before);
    w.viewerFlags.sender_checked = true;
    w.choose(cue);
    expect(w.sequenceId).toBe(cue.branch!.targetSequenceId);
    expect(w.viewerFlags.sender_checked).toBe(true);
    w.back();
    expect(w.sequenceId).toBe(before);
  });
});
describe("asset transfer", () => {
  it("checks chunk offsets, project ownership and completion, then imports sanitized SVG bytes", async () => {
    vi.stubGlobal("File", NodeFile);
    try {
      const bytes = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
      );
      const started = await uploadAsset("owner", {
        action: "begin",
        name: "diagram.svg",
        mimeType: "image/svg+xml",
        sizeBytes: bytes.length,
      });
      await expect(
        uploadAsset("other", { action: "finish", uploadId: started.uploadId }),
      ).rejects.toThrow("another project");
      await expect(
        uploadAsset("owner", { action: "finish", uploadId: started.uploadId }),
      ).rejects.toThrow("incomplete");
      await expect(
        uploadAsset("owner", {
          action: "chunk",
          uploadId: started.uploadId,
          offset: 1,
          base64: Buffer.from(bytes).toString("base64"),
        }),
      ).rejects.toThrow("offset 0");
      await uploadAsset("owner", {
        action: "chunk",
        uploadId: started.uploadId,
        offset: 0,
        base64: Buffer.from(bytes).toString("base64"),
      });
      const result = await uploadAsset("owner", {
        action: "finish",
        uploadId: started.uploadId,
      });
      expect(result.media?.importedBy).toBe("agent");
      const m = result.media!;
      expect(m.source.kind).toBe("asset");
      if (m.source.kind === "asset")
        expect(
          await (await storage.getAsset(m.source.assetId)).text(),
        ).not.toContain("script");
      await expect(
        uploadAsset("owner", { action: "finish", uploadId: started.uploadId }),
      ).rejects.toThrow("expired");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("rejects download HTTP failures and oversized files before storage", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(
        new Response("", {
          headers: { "content-length": String(101 * 1024 * 1024) },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(
        fetchAsset({
          url: "https://example.com/missing.png",
          name: "missing.png",
        }),
      ).rejects.toThrow("404");
      await expect(
        fetchAsset({ url: "https://example.com/large.png", name: "large.png" }),
      ).rejects.toThrow("100 MB");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("resolves actual NASA variants to HTTPS", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              collection: {
                items: [
                  { href: "http://images-assets.nasa.gov/video/a/a~orig.mp4" },
                  {
                    href: "http://images-assets.nasa.gov/video/a/a~medium.mp4",
                  },
                ],
              },
            }),
          ),
        ),
    );
    try {
      expect(await resolveNasa("a", "video")).toBe(
        "https://images-assets.nasa.gov/video/a/a~medium.mp4",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
