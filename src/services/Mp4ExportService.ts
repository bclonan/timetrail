import {
  Input,
  BlobSource,
  ALL_FORMATS,
  CanvasSink,
  AudioBufferSink,
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  canEncodeVideo,
  canEncodeAudio,
} from "mediabunny";
import { safeUrl, type Project, type Media } from "../domain/model";
import { storage } from "../storage/BrowserWorkspaceStore";
import { cardSvg } from "../runtime/generatedCard";

export interface ExportOptions {
  signal?: AbortSignal;
  progress?: (percent: number, message: string) => void;
}
export async function downloadMediaBlob(url: string, signal?: AbortSignal) {
  const response = await fetch(safeUrl(url), {
    credentials: "omit",
    signal: AbortSignal.any([
      AbortSignal.timeout(45000),
      ...(signal ? [signal] : []),
    ]),
  });
  if (!response.ok)
    throw new Error(`Media download failed with HTTP ${response.status}.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The media download has no body.");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 100 * 1024 * 1024)
        throw new Error("Use a source file smaller than 100 MB.");
      parts.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return new Blob(parts as BlobPart[], {
    type: response.headers.get("content-type") || "application/octet-stream",
  });
}
async function mediaBlob(media: Media, signal?: AbortSignal) {
  if (media.source.kind === "asset")
    return storage.getAsset(media.source.assetId);
  if (media.source.kind === "remote")
    return downloadMediaBlob(media.source.url, signal);
  throw new Error(`${media.name}: this source cannot be rendered.`);
}
async function loadImage(blob: Blob, signal?: AbortSignal) {
  const url = URL.createObjectURL(blob),
    image = new Image();
  image.src = url;
  try {
    await Promise.race([
      image.decode(),
      new Promise<never>((_, reject) => {
        const abort = () =>
          reject(new Error("Image rendering canceled or timed out."));
        const combined = AbortSignal.any([
          AbortSignal.timeout(15000),
          ...(signal ? [signal] : []),
        ]);
        combined.addEventListener("abort", abort, { once: true });
      }),
    ]);
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function mp4Sequence(project: Project) {
  const sequence = project.sequences.find(
    (s) => s.id === project.activeSequenceId,
  )!;
  if (!sequence.clips.length)
    throw new Error("Add clips to the main screen before exporting MP4.");
  if (sequence.durationSeconds > 600)
    throw new Error(
      "Browser MP4 export supports a main screen up to ten minutes long.",
    );
  for (const clip of sequence.clips) {
    const media = project.media.find((m) => m.id === clip.mediaId);
    if (
      !media ||
      !["video", "image", "audio", "generated-card"].includes(media.type)
    )
      throw new Error(
        `${media?.name || clip.mediaId}: MP4 export needs an uploaded or downloadable video/image/audio file. Replace embedded YouTube or Vimeo clips with a source file first.`,
      );
  }
  return sequence;
}
function fit(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
) {
  const scale = Math.min(ctx.canvas.width / width, ctx.canvas.height / height);
  ctx.drawImage(
    image,
    (ctx.canvas.width - width * scale) / 2,
    (ctx.canvas.height - height * scale) / 2,
    width * scale,
    height * scale,
  );
}
function caption(ctx: CanvasRenderingContext2D, text: string) {
  const width = ctx.canvas.width,
    height = ctx.canvas.height;
  const font = Math.round(width / 42),
    lineHeight = font * 1.3;
  ctx.font = `${font}px Arial`;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (ctx.measureText(`${line} ${word}`).width > width * 0.86 && line) {
      lines.push(line);
      line = word;
    } else line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, 4),
    box = visible.length * lineHeight + 24;
  ctx.fillStyle = "rgba(0,0,0,.8)";
  ctx.fillRect(width * 0.05, height - box - 22, width * 0.9, box);
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  visible.forEach((value, i) =>
    ctx.fillText(value, width / 2, height - box - 4 + (i + 1) * lineHeight),
  );
}

/** Render the approved main timeline. Interactive branches remain in the hypermedia export. */
export async function renderMp4(project: Project, options: ExportOptions = {}) {
  const sequence = mp4Sequence(project),
    { signal, progress = () => {} } = options;
  signal?.throwIfAborted();
  const aspect = project.presentation?.views.find(
    (v) => v.id === project.presentation?.defaultViewId,
  )?.aspect;
  const [width, height] =
    aspect === "9:16"
      ? [720, 1280]
      : aspect === "1:1"
        ? [720, 720]
        : [1280, 720];
  if (!(await canEncodeVideo("avc", { width, height, bitrate: 4_000_000 })))
    throw new Error(
      "This browser cannot encode H.264 MP4. Use a current Chrome or Edge browser with video encoding available.",
    );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const loaded = new Map<
    string,
    {
      input?: Input;
      image?: HTMLImageElement;
      video?: CanvasSink;
      audio?: AudioBufferSink;
      duration?: number;
      first?: number;
    }
  >();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(canvas, { codec: "avc", bitrate: 4_000_000 });
  output.addVideoTrack(video, { frameRate: 24 });
  output.setMetadataTags({
    title: project.title,
    comment:
      "TimeTrail main timeline. Interactive choices are available in the hypermedia version.",
  });
  let finalized = false;
  const notes = [
    "MP4 contains the main timeline, clip audio and burned-in captions. Choices, clickable annotations and Research panels are in the interactive download.",
  ];
  if (sequence.cues.some((c) => c.kind === "narration"))
    notes.push(
      "Browser read-aloud narration is not an audio recording and is not included. Use recorded narration in your source media for spoken audio.",
    );
  try {
    const ids = [...new Set(sequence.clips.map((c) => c.mediaId))];
    let bytes = 0;
    for (const [i, mediaId] of ids.entries()) {
      signal?.throwIfAborted();
      const media = project.media.find((m) => m.id === mediaId)!;
      progress((i / ids.length) * 10, `Loading ${media.name}`);
      try {
        if (media.source.kind === "generated") {
          // Draw linked art separately: browsers omit external image references inside SVG images.
          const card = media.source.document;
          const base = await loadImage(
            new Blob([cardSvg({ ...card, image: undefined })], {
              type: "image/svg+xml",
            }),
            signal,
          );
          if (card.image) {
            const art = await loadImage(
              await downloadMediaBlob(card.image, signal),
              signal,
            );
            const c = document.createElement("canvas");
            c.width = 960;
            c.height = 540;
            const cx = c.getContext("2d")!;
            cx.drawImage(base, 0, 0);
            const ratio = Math.min(
              295 / art.naturalWidth,
              330 / art.naturalHeight,
            );
            cx.drawImage(
              art,
              605 + (295 - art.naturalWidth * ratio) / 2,
              100 + (330 - art.naturalHeight * ratio) / 2,
              art.naturalWidth * ratio,
              art.naturalHeight * ratio,
            );
            loaded.set(mediaId, {
              image: await loadImage(
                await new Promise<Blob>((resolve, reject) =>
                  c.toBlob((b) =>
                    b
                      ? resolve(b)
                      : reject(new Error("Could not render card.")),
                  ),
                ),
                signal,
              ),
            });
          } else loaded.set(mediaId, { image: base });
          continue;
        }
        const blob = await mediaBlob(media, signal);
        bytes += blob.size;
        if (bytes > 200 * 1024 * 1024)
          throw new Error(
            "The selected source files exceed 200 MB. Use smaller files.",
          );
        if (media.type === "image") {
          loaded.set(mediaId, { image: await loadImage(blob, signal) });
          continue;
        }
        const input = new Input({
          source: new BlobSource(blob),
          formats: ALL_FORMATS,
        });
        const item: NonNullable<ReturnType<typeof loaded.get>> = { input };
        loaded.set(mediaId, item);
        const vt = await input.getPrimaryVideoTrack(),
          at = await input.getPrimaryAudioTrack();
        if (media.type === "video") {
          if (!vt || !(await vt.canDecode()))
            throw new Error(
              "The video codec cannot be decoded by this browser.",
            );
          item.video = new CanvasSink(vt, {
            width,
            height,
            fit: "contain",
            poolSize: 1,
          });
          item.duration = await vt.computeDuration();
          item.first = await vt.getFirstTimestamp();
        }
        if (at) {
          if (!(await at.canDecode()))
            throw new Error(
              "The source audio cannot be decoded. It will not be silently omitted.",
            );
          item.audio = new AudioBufferSink(at);
        }
        if (media.type === "audio" && !at)
          throw new Error("No audio track was found.");
      } catch (e) {
        throw new Error(
          `${media.name}: ${e instanceof Error ? e.message : e} Upload a playable local file if the remote source blocks downloads.`,
        );
      }
    }
    signal?.throwIfAborted();
    const hasAudio = [...loaded.values()].some((v) => v.audio);
    let audio: AudioBufferSource | undefined;
    if (hasAudio) {
      if (
        !(await canEncodeAudio("aac", {
          numberOfChannels: 2,
          sampleRate: 48000,
        }))
      )
        throw new Error(
          "This browser cannot encode AAC audio for MP4. Use Chrome or Edge with audio encoding available.",
        );
      audio = new AudioBufferSource({ codec: "aac", bitrate: 128_000 });
      output.addAudioTrack(audio);
    } else
      notes.push("The timeline has no recorded audio. This MP4 is silent.");
    await output.start();
    if (audio) {
      progress(10, "Rendering the clip audio");
      const mix = new OfflineAudioContext(
        2,
        Math.ceil(sequence.durationSeconds * 48000),
        48000,
      );
      for (const clip of sequence.clips) {
        const sink = loaded.get(clip.mediaId)!.audio;
        if (!sink) continue;
        const end = Math.min(
          clip.sourceStart + clip.durationSeconds,
          clip.sourceEnd ?? Infinity,
        );
        for await (const sample of sink.buffers(clip.sourceStart, end)) {
          signal?.throwIfAborted();
          const start = Math.max(clip.sourceStart, sample.timestamp),
            stop = Math.min(end, sample.timestamp + sample.duration);
          if (stop <= start) continue;
          const node = mix.createBufferSource();
          node.buffer = sample.buffer;
          node.connect(mix.destination);
          node.start(
            clip.timelineStart + start - clip.sourceStart,
            start - sample.timestamp,
            stop - start,
          );
        }
      }
      const rendered = await mix.startRendering();
      signal?.throwIfAborted();
      await audio.add(rendered);
      audio.close();
    }
    const fps = 24,
      count = Math.ceil(sequence.durationSeconds * fps);
    const clips = [...sequence.clips].sort(
      (a, b) => a.timelineStart - b.timelineStart,
    );
    let iterator: ReturnType<CanvasSink["canvasesAtTimestamps"]> | undefined;
    let activeId = "";
    try {
      for (let i = 0; i < count; i++) {
        signal?.throwIfAborted();
        const time = i / fps;
        const clip = clips.find(
          (c) =>
            time >= c.timelineStart &&
            time < c.timelineStart + c.durationSeconds,
        );
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
        if (clip) {
          const source = loaded.get(clip.mediaId)!;
          if (clip.id !== activeId) {
            await iterator?.return();
            iterator = undefined;
            activeId = clip.id;
            if (source.video) {
              const firstFrame = i;
              iterator = source.video.canvasesAtTimestamps(
                (function* () {
                  for (
                    let j = firstFrame;
                    j < count &&
                    j / fps < clip.timelineStart + clip.durationSeconds;
                    j++
                  )
                    yield Math.max(
                      source.first || 0,
                      Math.min(
                        clip.sourceStart + j / fps - clip.timelineStart,
                        (source.duration || Infinity) - 0.001,
                        (clip.sourceEnd ?? Infinity) - 0.001,
                      ),
                    );
                })(),
              );
            }
          }
          if (source.image)
            fit(
              ctx,
              source.image,
              source.image.naturalWidth,
              source.image.naturalHeight,
            );
          if (iterator) {
            const frame = (await iterator.next()).value;
            if (!frame)
              throw new Error(
                "A video frame could not be decoded. Export stopped instead of producing a blank clip.",
              );
            ctx.drawImage(frame.canvas, 0, 0, width, height);
          }
        } else {
          await iterator?.return();
          iterator = undefined;
          activeId = "";
        }
        const cue = sequence.cues.find(
          (c) =>
            c.kind === "caption" &&
            time >= c.start &&
            time < (c.end ?? c.start + 3),
        );
        if (cue?.body) caption(ctx, cue.body);
        await video.add(
          time,
          Math.min(1 / fps, sequence.durationSeconds - time),
        );
        if (i % 12 === 0) {
          progress(
            15 + (i / count) * 83,
            `Rendering ${time.toFixed(1)} of ${sequence.durationSeconds}s`,
          );
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    } finally {
      await iterator?.return();
    }
    video.close();
    progress(99, "Finishing the MP4 file");
    await output.finalize();
    finalized = true;
    signal?.throwIfAborted();
    progress(100, "MP4 ready");
    return {
      blob: new Blob([output.target.buffer!], { type: "video/mp4" }),
      notes,
    };
  } finally {
    if (!finalized) await output.cancel();
    for (const value of loaded.values()) value.input?.dispose();
  }
}
