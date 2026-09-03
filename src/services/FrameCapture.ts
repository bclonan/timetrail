import { safeUrl, type Media } from "../domain/model";
import type { EditRegion } from "../domain/retouch";
import { storage } from "../storage/BrowserWorkspaceStore";

export function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("The image could not be encoded.")),
        "image/png",
      );
    } catch {
      reject(
        new Error(
          "This source blocks frame capture. Upload the original file or use a source that permits cross-origin access.",
        ),
      );
    }
  });
}
export function canvasFor(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
function waitFor(
  element: HTMLMediaElement | HTMLImageElement,
  events: string[],
  ready: () => boolean,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (ready()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const abort = new AbortController();
    const finish = (error?: Error) => {
      clearTimeout(timer);
      abort.abort();
      signal?.removeEventListener("abort", canceled);
      if (error) reject(error);
      else resolve();
    };
    const canceled = () => finish(new Error("Frame capture canceled."));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Frame capture timed out. Upload a playable local file or choose another source.",
          ),
        ),
      15000,
    );
    for (const event of events)
      element.addEventListener(
        event,
        () => {
          if (ready()) finish();
        },
        { signal: abort.signal },
      );
    element.addEventListener(
      "error",
      () =>
        finish(
          new Error(
            "This source could not be decoded or blocks cross-origin capture. Upload its original file or choose another source.",
          ),
        ),
      { signal: abort.signal },
    );
    signal?.addEventListener("abort", canceled, { once: true });
    if (ready()) finish();
  });
}
export async function mediaAddress(media: Media) {
  if (media.source.kind === "asset")
    return {
      url: URL.createObjectURL(await storage.getAsset(media.source.assetId)),
      revoke: true,
    };
  if (media.source.kind === "remote")
    return { url: safeUrl(media.source.url), revoke: false };
  throw new Error(
    "Choose an image or direct video file. Generated cards and embedded players cannot be captured here.",
  );
}
export async function captureFrames(
  media: Media,
  times: number[],
  maximum: number,
  signal?: AbortSignal,
) {
  if (!["image", "video"].includes(media.type))
    throw new Error(
      "Choose an image or direct MP4/WebM video. Embedded YouTube and Vimeo frames cannot be captured.",
    );
  const address = await mediaAddress(media);
  const element =
    media.type === "video" ? document.createElement("video") : new Image();
  element.crossOrigin = "anonymous";
  if (element instanceof HTMLVideoElement) {
    element.preload = "auto";
    element.muted = true;
    element.playsInline = true;
  }
  try {
    const loading = waitFor(
      element,
      ["loadeddata", "load", "canplay"],
      () =>
        element instanceof HTMLVideoElement
          ? element.readyState >= 2
          : element.complete && element.naturalWidth > 0,
      signal,
    );
    element.src = address.url;
    await loading;
    const video = element instanceof HTMLVideoElement ? element : undefined;
    const sourceWidth =
      video?.videoWidth || (element as HTMLImageElement).naturalWidth;
    const sourceHeight =
      video?.videoHeight || (element as HTMLImageElement).naturalHeight;
    if (!sourceWidth || !sourceHeight)
      throw new Error("The source has no usable image dimensions.");
    const scale = Math.min(1, maximum / Math.max(sourceWidth, sourceHeight));
    const canvas = canvasFor(
      Math.max(1, Math.round(sourceWidth * scale)),
      Math.max(1, Math.round(sourceHeight * scale)),
    );
    const frames = [];
    for (const time of times) {
      signal?.throwIfAborted();
      if (video) {
        if (!Number.isFinite(video.duration) || time >= video.duration)
          throw new Error(
            `Source time ${time} is outside this video. Choose a time before its end.`,
          );
        if (Math.abs(video.currentTime - time) > 0.00001) {
          const seeking = waitFor(
            video,
            ["seeked", "loadeddata"],
            () =>
              !video.seeking &&
              Math.abs(video.currentTime - time) < 0.00001 &&
              video.readyState >= 2,
            signal,
          );
          video.currentTime = time;
          await seeking;
        }
      }
      canvas
        .getContext("2d")!
        .drawImage(element, 0, 0, canvas.width, canvas.height);
      frames.push({
        sourceSeconds: time,
        width: canvas.width,
        height: canvas.height,
        blob: await png(canvas),
      });
    }
    return frames;
  } finally {
    element.removeAttribute("src");
    if (element instanceof HTMLVideoElement) {
      element.pause();
      element.load();
    }
    if (address.revoke) URL.revokeObjectURL(address.url);
  }
}
export async function maskPng(
  width: number,
  height: number,
  regions: EditRegion[],
) {
  const canvas = canvasFor(width, height),
    ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  for (const r of regions)
    ctx.fillRect(
      Math.floor((r.x * width) / 100),
      Math.floor((r.y * height) / 100),
      Math.ceil((r.width * width) / 100),
      Math.ceil((r.height * height) / 100),
    );
  return png(canvas);
}
/** Preserve pixels outside the selected rectangles even if the provider changed them. */
export async function compositeEdit(
  original: Blob,
  edited: Blob,
  regions: EditRegion[],
) {
  const before = await createImageBitmap(original);
  let after: ImageBitmap | undefined;
  try {
    after = await createImageBitmap(edited);
    if (
      Math.abs(before.width / before.height - after.width / after.height) >
      0.015
    )
      throw new Error(
        "The returned image has a different aspect ratio. Return the full frame, not a cropped patch.",
      );
    const canvas = canvasFor(before.width, before.height),
      ctx = canvas.getContext("2d")!;
    ctx.drawImage(before, 0, 0);
    ctx.beginPath();
    for (const r of regions)
      ctx.rect(
        Math.floor((r.x * before.width) / 100),
        Math.floor((r.y * before.height) / 100),
        Math.ceil((r.width * before.width) / 100),
        Math.ceil((r.height * before.height) / 100),
      );
    ctx.clip();
    ctx.drawImage(after, 0, 0, before.width, before.height);
    return await png(canvas);
  } finally {
    before.close();
    after?.close();
  }
}
