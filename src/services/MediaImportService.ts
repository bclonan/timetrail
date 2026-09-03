import { id, now, safeUrl, type Media } from "../domain/model";
import { storage } from "../storage/BrowserWorkspaceStore";
import DOMPurify from "dompurify";
export function detectUrl(raw: string): Media["type"] {
  const u = new URL(safeUrl(raw));
  const host = u.hostname.replace(/^www\./, "");
  if (["youtube.com", "m.youtube.com", "youtu.be"].includes(host))
    return "youtube";
  if (["vimeo.com", "player.vimeo.com"].includes(host)) return "vimeo";
  if (/\.(mp4|webm|m3u8)$/i.test(u.pathname)) return "video";
  if (/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(u.pathname)) return "image";
  if (/\.(mp3|wav|ogg|m4a|aac)$/i.test(u.pathname)) return "audio";
  if (/\.pdf$/i.test(u.pathname)) return "pdf";
  return "webpage";
}
export function mediaFromUrl(
  raw: string,
  label?: string,
  by: Media["importedBy"] = "human",
): Media {
  const url = safeUrl(raw);
  const u = new URL(url);
  return {
    id: id(),
    name:
      label ||
      decodeURIComponent(u.pathname.split("/").pop() || u.hostname).slice(
        0,
        300,
      ),
    type: detectUrl(url),
    source: { kind: "remote", url },
    tags: [],
    importedAt: now(),
    importedBy: by,
    attribution: { sourceUrl: url },
  };
}
export async function importUrls(
  items: {
    url: string;
    label?: string;
    typeHint?: string;
    attribution?: Media["attribution"];
  }[],
  existing: Media[],
  by: Media["importedBy"] = "human",
) {
  const media: Media[] = [];
  const warnings: string[] = [];
  const probe: Media[] = [];
  for (const item of items) {
    try {
      const url = safeUrl(item.url);
      const duplicate = [...existing, ...media].find(
        (m) => m.source.kind === "remote" && m.source.url === url,
      );
      if (duplicate) {
        if (!media.some((m) => m.id === duplicate.id)) media.push(duplicate);
        continue;
      }
      const m = mediaFromUrl(url, item.label, by);
      if (item.attribution) m.attribution = item.attribution;
      if (
        m.type === "webpage" &&
        item.typeHint &&
        ["video", "image", "audio", "pdf"].includes(item.typeHint)
      )
        m.type = item.typeHint as Media["type"];
      if (["video", "audio", "image"].includes(m.type)) probe.push(m);
      media.push(m);
    } catch (e) {
      warnings.push(
        `${item.url.slice(0, 80)}: ${e instanceof Error ? e.message : "Could not import"}`,
      );
    }
  }
  for (let i = 0; i < probe.length; i += 4)
    await Promise.all(
      probe.slice(i, i + 4).map(async (m) => {
        const result = await probeMetadata(
          m.source.kind === "remote" ? m.source.url : "",
          m.type,
        );
        if (result.duration) m.durationSeconds = result.duration;
        if (!result.ok)
          warnings.push(
            `${m.name}: source could not be loaded; check its URL and playback before accepting.`,
          );
      }),
    );
  return { media, warnings };
}
export function probeMetadata(
  url: string,
  type: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ duration?: number; ok: boolean; reason?: string }> {
  options.signal?.throwIfAborted();
  return new Promise((resolve) => {
    const el = document.createElement(
      type === "image" ? "img" : type === "audio" ? "audio" : "video",
    );
    let done = false;
    const finish = (duration?: number, ok = false, reason?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      el.onerror = null;
      if (el instanceof HTMLMediaElement) el.onloadedmetadata = null;
      else el.onload = null;
      el.removeAttribute("src");
      if (el instanceof HTMLMediaElement) el.load();
      resolve({ duration, ok, reason });
    };
    const abort = () => finish(undefined, false, "aborted");
    const timer = setTimeout(
      () => finish(undefined, false, "timeout"),
      options.timeoutMs ?? 1800,
    );
    options.signal?.addEventListener("abort", abort, { once: true });
    el.onerror = () => finish(undefined, false, "load_error");
    if (el instanceof HTMLMediaElement) {
      el.preload = "metadata";
      el.onloadedmetadata = () =>
        finish(Number.isFinite(el.duration) ? el.duration : undefined, true);
    } else el.onload = () => finish(undefined, true);
    el.src = url;
  });
}
export function srtToVtt(text: string) {
  return `WEBVTT\n\n${text
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/(\d\d:\d\d:\d\d),(\d{3})/g, "$1.$2")}`;
}
export function parseVtt(text: string) {
  const normalized = text.replace(/\r/g, "");
  const time = (s: string) =>
    s.split(":").reduce((n, v) => n * 60 + Number(v), 0);
  return normalized.split(/\n\s*\n/).flatMap((block) => {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) return [];
    const match = lines[i]!.match(/([\d:.]+)\s+-->\s+([\d:.]+)/);
    if (!match) return [];
    return [
      {
        start: time(match[1]!),
        end: time(match[2]!),
        body: lines.slice(i + 1).join("\n"),
      },
    ];
  });
}
export async function importFile(
  file: File,
  by: Media["importedBy"] = "human",
): Promise<Media> {
  if (!file.size || file.size > 100 * 1024 * 1024)
    throw new Error("Choose a nonempty file smaller than 100 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  const allowed: Record<string, Media["type"]> = {
    mp4: "video",
    webm: "video",
    png: "image",
    jpg: "image",
    jpeg: "image",
    gif: "image",
    webp: "image",
    avif: "image",
    svg: "image",
    mp3: "audio",
    wav: "audio",
    ogg: "audio",
    m4a: "audio",
    aac: "audio",
    pdf: "pdf",
    vtt: "subtitle",
    srt: "subtitle",
  };
  const type = allowed[ext || ""];
  if (!type) throw new Error(`Unsupported file: ${file.name}`);
  if (
    file.type &&
    !(
      file.type.startsWith(`${type}/`) ||
      (type === "subtitle" &&
        ["text/plain", "text/vtt", "application/x-subrip"].includes(
          file.type,
        )) ||
      (type === "pdf" && file.type === "application/pdf")
    )
  )
    throw new Error(`File type does not match ${file.name}.`);
  let blob: Blob = file;
  if (ext === "svg") {
    const clean = DOMPurify.sanitize(await file.text(), {
      USE_PROFILES: { svg: true },
      FORBID_TAGS: ["foreignObject", "script"],
    });
    if (!clean.includes("<svg"))
      throw new Error("The SVG contains no valid image.");
    blob = new Blob([clean], { type: "image/svg+xml" });
  }
  if (ext === "srt")
    blob = new Blob([srtToVtt(await file.text())], { type: "text/vtt" });
  const meta = await storage.putAsset(blob, file.name);
  let duration: number | undefined;
  if (type === "video" || type === "audio") {
    const url = URL.createObjectURL(blob);
    try {
      duration = (await probeMetadata(url, type)).duration;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return {
    id: id(),
    name: file.name,
    type,
    source: { kind: "asset", assetId: meta.id },
    durationSeconds: duration,
    mimeType: blob.type,
    sizeBytes: blob.size,
    tags: [],
    importedAt: now(),
    importedBy: by,
  };
}
