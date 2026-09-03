import playerStyles from "../player.css?inline";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { clone, projectSchema, type Project } from "../domain/model";
import { storage } from "../storage/BrowserWorkspaceStore";
import { escapeHtml, cardSvg } from "../runtime/generatedCard";
import { fromFrameTrailExport, captionsVtt } from "../runtime/frameTrailMapper";
export const exportFormats = [
  "project-json",
  "project-zip",
  "standalone-html",
  "static-pack",
] as const;
export type ExportFormat = (typeof exportFormats)[number];
export interface PreparedExport {
  filename: string;
  blob: Blob;
  format: ExportFormat;
  assetsIncluded: boolean;
}
export function zipManifest(project: Project, files: string[]) {
  return {
    format: "timetrail-pack",
    schemaVersion: "1.0",
    projectId: project.id,
    files: files.sort(),
    assetReferences: project.media
      .filter((m) => m.source.kind === "asset")
      .map((m) =>
        m.source.kind === "asset" ? `asset://${m.source.assetId}` : "",
      ),
  };
}
async function thumbnail(project: Project): Promise<Uint8Array | undefined> {
  const m = project.media.find((m) => m.source.kind === "generated");
  if (!m || m.source.kind !== "generated") return;
  const url = URL.createObjectURL(
    new Blob([cardSvg({ ...m.source.document, image: undefined })], {
      type: "image/svg+xml",
    }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 270;
    canvas.getContext("2d")!.drawImage(image, 0, 0, 480, 270);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}
function viewerHtml(
  project: Project,
  runtime: string | undefined,
  assets: Record<string, string>,
  client: string,
) {
  const json = JSON.stringify({ project, assets }).replace(/</g, "\\u003c");
  const src = runtime
    ? `srcdoc="${escapeHtml(runtime)}"`
    : 'src="./runtime/runtime.html"';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(project.title)}</title><style>body{margin:0;background:#111812;color:#e8edde;font:16px system-ui}main{max-width:1300px;margin:auto;padding:30px}h1{font:38px Georgia}button,a{font:inherit;color:inherit}button{background:#293929;border:1px solid #526449;border-radius:8px;padding:10px;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #c5ef91}iframe{width:100%;aspect-ratio:16/9;border:0}.grid{display:grid;grid-template-columns:3fr 1fr;gap:24px}.card{padding:16px;background:#213125;border-radius:8px;margin:12px 0}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}#seek{flex:1}#caption{min-height:30px}a{color:#c5ef91}@media(max-width:800px){.grid{display:block}}[hidden]{display:none!important}${playerStyles}</style></head><body class="film-player"><main><p>TIMETRAIL / INTERACTIVE FILM</p><h1>${escapeHtml(project.title)}</h1><nav id="views" class="view-switcher" aria-label="Player views"></nav><div class="grid film-layout"><section class="film-stage"><iframe title="FrameTrail interactive film" ${src}></iframe><div class="controls"><button id="play">Play</button><button id="pause">Pause</button><input id="seek" aria-label="Seek" type="range" min="0" step="0.1"><span id="time"></span><button id="back">Return</button><button id="restart">Start again</button><button id="cc">Captions on</button><button id="narrate">Narration off</button><button id="full">Fullscreen</button></div><p id="caption" aria-live="off"></p><nav id="chapters" class="controls" aria-label="Chapters"></nav></section><aside class="film-sidebar"><div id="panels" class="player-panels"></div><h2 id="context-heading">In this moment</h2><div id="context"></div></aside></div><p id="status" role="status">Opening your film...</p><p>Made with TimeTrail and FrameTrail. MIT. External media needs an internet connection.</p></main><script type="application/json" id="data">${json}</script><script>
${client.replace(/<\/script/gi, "<\\/script")}
</script></body></html>`;
}
export class ExportService {
  async prepare(
    project: Project,
    format: ExportFormat,
  ): Promise<PreparedExport> {
    projectSchema.parse(project);
    const stem = project.slug || "timetrail";
    if (format === "project-json")
      return {
        filename: stem + ".json",
        blob: new Blob([JSON.stringify(project, null, 2)], {
          type: "application/json",
        }),
        format,
        assetsIncluded: false,
      };
    const files: Record<string, Uint8Array> = {
      "project.json": strToU8(JSON.stringify(project, null, 2)),
      "attribution.json": strToU8(
        JSON.stringify(
          {
            project: project.provenance,
            media: project.media.map((m) => ({ id: m.id, ...m.attribution })),
          },
          null,
          2,
        ),
      ),
      "README.txt": strToU8(
        "TimeTrail portable project. Import project.json or this ZIP into TimeTrail. For a static pack, serve index.html on a static HTTP host. Local assets are included. Remote media requires internet. FrameTrail and TimeTrail use MIT licensing.",
      ),
    };
    const urls: Record<string, string> = {};
    for (const sequence of project.sequences)
      if (sequence.cues.some((c) => c.kind === "caption"))
        files[`captions/${sequence.id}.vtt`] = strToU8(
          captionsVtt(project, sequence.id),
        );
    const thumb = await thumbnail(project);
    if (thumb) files["thumbnail.webp"] = thumb;
    for (const m of project.media) {
      if (m.source.kind !== "asset") continue;
      const assetId = m.source.assetId;
      const blob = await storage.getAsset(assetId);
      const meta = await storage.assetMetadata(assetId);
      const path = "assets/" + meta.path;
      files[path] = new Uint8Array(await blob.arrayBuffer());
      urls[assetId] = path;
    }
    if (format === "standalone-html" || format === "static-pack") {
      const response = await fetch("/standalone-runtime.html");
      if (!response.ok)
        throw new Error(
          "Runtime export bundle is unavailable. Build the application first.",
        );
      const runtime = await response.text();
      const clientResponse = await fetch("/standalone-viewer.js");
      if (!clientResponse.ok)
        throw new Error("Viewer export bundle is unavailable.");
      const client = await clientResponse.text();
      if (format === "standalone-html") {
        const dataUrls: Record<string, string> = {};
        for (const [asset, path] of Object.entries(urls)) {
          const mime =
            (await storage.assetMetadata(asset)).mimeType ||
            "application/octet-stream";
          let binary = "";
          for (const byte of files[path]!) binary += String.fromCharCode(byte);
          dataUrls[asset] = `data:${mime};base64,${btoa(binary)}`;
        }
        return {
          filename: stem + ".html",
          blob: new Blob([viewerHtml(project, runtime, dataUrls, client)], {
            type: "text/html",
          }),
          format,
          assetsIncluded: true,
        };
      }
      files["index.html"] = strToU8(
        viewerHtml(project, undefined, urls, client),
      );
      files["runtime/runtime.html"] = strToU8(runtime);
      files["runtime/LICENSE.md"] = new Uint8Array(
        await (await fetch("/frametrail/LICENSE.md")).arrayBuffer(),
      );
      files["catalog-entry.json"] = strToU8(
        JSON.stringify(
          {
            id: project.id,
            title: project.title,
            summary: project.description,
            creator: project.provenance.creator,
            tags: project.tags,
            durationSeconds: project.sequences[0]!.durationSeconds,
            projectUrl: "./project.json",
            watchUrl: "./index.html",
            license: project.provenance.license,
          },
          null,
          2,
        ),
      );
      files["_headers"] = strToU8(
        "/*\n  Permissions-Policy: tools=(self)\n  Origin-Agent-Cluster: ?1\n",
      );
    }
    files["manifest.json"] = strToU8(
      JSON.stringify(zipManifest(project, Object.keys(files)), null, 2),
    );
    const bytes = zipSync(files, { level: 6 });
    return {
      filename: stem + (format === "static-pack" ? "-static" : "") + ".zip",
      blob: new Blob([bytes as BlobPart], { type: "application/zip" }),
      format,
      assetsIncluded: true,
    };
  }
  async import(file: File): Promise<Project> {
    if (file.size > 150 * 1024 * 1024)
      throw new Error("Project pack exceeds 150 MB.");
    if (file.name.endsWith(".html")) {
      const doc = new DOMParser().parseFromString(
        await file.text(),
        "text/html",
      );
      const data = JSON.parse(doc.querySelector("#data")?.textContent || "{}");
      const p = projectSchema.parse(data.project);
      for (const m of p.media) {
        if (m.source.kind === "asset") {
          const url = data.assets?.[m.source.assetId];
          if (
            typeof url !== "string" ||
            (!/^data:(image|video|audio)\//.test(url) &&
              !url?.startsWith("data:application/pdf") &&
              !url?.startsWith("data:text/vtt"))
          )
            throw new Error(
              "HTML has a missing or unsupported embedded asset.",
            );
          const blob = await (await fetch(url)).blob();
          m.source.assetId = (await storage.putAsset(blob, m.name)).id;
        }
      }
      return p;
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      const raw = JSON.parse(await file.text());
      return raw.schemaVersion
        ? projectSchema.parse(raw)
        : fromFrameTrailExport(raw);
    }
    let total = 0;
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => {
        total += f.originalSize;
        if (f.originalSize > 100 * 1024 * 1024 || total > 200 * 1024 * 1024)
          throw new Error("Expanded pack is too large.");
        if (
          f.name.includes("..") ||
          f.name.startsWith("/") ||
          f.name.includes("\\")
        )
          throw new Error("Unsafe path in ZIP.");
        return (
          f.name === "project.json" ||
          f.name === "manifest.json" ||
          f.name.startsWith("assets/")
        );
      },
    });
    if (!files["project.json"])
      throw new Error("ZIP does not contain project.json.");
    const p = projectSchema.parse(JSON.parse(strFromU8(files["project.json"])));
    const draft = clone(p);
    for (const m of draft.media) {
      if (m.source.kind !== "asset") continue;
      const path = Object.keys(files).find((p) =>
        p.startsWith(
          `assets/${m.source.kind === "asset" ? m.source.assetId : ""}.`,
        ),
      );
      if (!path) throw new Error(`Missing asset for ${m.name}.`);
      const blob = new Blob([files[path] as BlobPart], { type: m.mimeType });
      m.source.assetId = (await storage.putAsset(blob, m.name)).id;
    }
    return draft;
  }
}
export const exportsService = new ExportService();
