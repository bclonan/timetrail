import {
  parentMessage,
  validBridgeEvent,
  type RuntimeMessage,
} from "./bridgeMessages";
import {
  toFrameTrailContents,
  toFrameTrailResources,
  mediaUrl,
  interactiveContents,
} from "./frameTrailMapper";
import { escapeHtml } from "./generatedCard";
import type { Project } from "../domain/model";
interface FrameTrailPlayer {
  play(): void;
  pause(): void;
  destroy(): void;
  currentTime: number;
  duration: number;
}
declare const FrameTrail: {
  init: (
    options: Record<string, unknown>,
    launcher: string,
  ) => FrameTrailPlayer;
};
let instance: FrameTrailPlayer | undefined;
let runtimeReady = false;
let project: Project;
let sequenceId = "";
let revision = 0;
let assets: Record<string, string> = {};
let native: FrameTrailPlayer | undefined;
let nativeReady = false;
let nativePlaying = false;
let activeMedia = "";
let playing = false;
const generatedUrls: string[] = [];
function resolveInlineData<T>(data: T): T {
  if (typeof data === "string" && /^data:(image|video|audio)\//.test(data)) {
    const comma = data.indexOf(",");
    const meta = data.slice(5, comma);
    const payload = data.slice(comma + 1);
    const bytes = meta.endsWith(";base64")
      ? Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload));
    const url = URL.createObjectURL(
      new Blob([bytes], { type: meta.split(";")[0] }),
    );
    generatedUrls.push(url);
    return url as T;
  }
  if (Array.isArray(data)) return data.map(resolveInlineData) as T;
  if (data && typeof data === "object")
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, resolveInlineData(v)]),
    ) as T;
  return data;
}
const origin = window.origin;
const send = (m: RuntimeMessage) => parent.postMessage(m, origin);
function onOverlayClick(event: CustomEvent<{ name: string }>) {
  const cue = project.sequences
    .find((s) => s.id === sequenceId)
    ?.cues.find((c) => c.id === event.detail.name);
  if (cue?.branch)
    send({
      type: "TIMETRAIL_LINK_ACTIVATED",
      sequenceId: cue.branch.targetSequenceId,
      timeSeconds: cue.branch.targetTime,
    });
  else if (cue?.kind === "hotspot") {
    send({ type: "TIMETRAIL_SELECTION_CHANGED", cueId: cue.id });
    if (cue.url) window.open(cue.url, "_blank", "noopener,noreferrer");
  }
}
function onQuizAnswered(
  event: CustomEvent<{ question: string; answer: string }>,
) {
  const cue = project.sequences
    .find((s) => s.id === sequenceId)
    ?.cues.find(
      (c) => c.quiz && escapeHtml(c.quiz.question) === event.detail.question,
    );
  const answerIndex = cue?.quiz?.options.indexOf(event.detail.answer);
  if (cue && answerIndex !== undefined && answerIndex >= 0)
    send({ type: "TIMETRAIL_QUIZ_ANSWERED", cueId: cue.id, answerIndex });
}
function report() {
  if (!instance || !project) return;
  const s = project.sequences.find((s) => s.id === sequenceId)!;
  const time = Math.min(instance.currentTime, s.durationSeconds);
  send({
    type: "TIMETRAIL_PLAYHEAD",
    currentTime: time,
    duration: s.durationSeconds,
    paused: !playing,
    sequenceId,
  });
  syncVideo(time, playing);
}
function syncVideo(time: number, isPlaying: boolean) {
  const seq = project.sequences.find((s) => s.id === sequenceId)!;
  const clip = seq.clips.find(
    (c) =>
      time >= c.timelineStart && time < c.timelineStart + c.durationSeconds,
  );
  const m = project.media.find((m) => m.id === clip?.mediaId);
  let container = document.getElementById("media-player")!;
  if (!clip || !m || !["video", "youtube", "vimeo", "audio"].includes(m.type)) {
    document.getElementById("offline")!.hidden = true;
    container.hidden = true;
    if (nativeReady) native?.pause();
    activeMedia = "";
    return;
  }
  container.hidden = false;
  if (m.source.kind === "remote" && !navigator.onLine) {
    document.getElementById("offline")!.hidden = false;
    return;
  } else document.getElementById("offline")!.hidden = true;
  const sourceEnd = clip.sourceEnd || m.durationSeconds || Infinity;
  const sourceTime = Math.max(
    clip.sourceStart,
    Math.min(clip.sourceStart + time - clip.timelineStart, sourceEnd - 0.05),
  );
  if (activeMedia !== clip.id) {
    // FrameTrail exposes one base clip per public player. The null-video player keeps sequence time.
    if (native) {
      if (nativeReady) native.pause();
      native.destroy();
      container = document.createElement("div");
      container.id = "media-player";
      document.body.append(container);
    }
    container.replaceChildren();
    activeMedia = clip.id;
    nativeReady = false;
    nativePlaying = false;
    const data = toFrameTrailContents(project, sequenceId, assets)[
      project.sequences.findIndex((s) => s.id === sequenceId)
    ]!;
    data.hypervideo.contents = interactiveContents(
      seq.cues
        .filter(
          (c) =>
            c.start < clip.timelineStart + clip.durationSeconds &&
            (c.end ?? c.start + 5) > clip.timelineStart,
        )
        .map((c) => ({
          ...c,
          start: Math.max(0, c.start - clip.timelineStart) + clip.sourceStart,
          end:
            Math.min(
              clip.durationSeconds,
              (c.end ?? c.start + 5) - clip.timelineStart,
            ) + clip.sourceStart,
        })),
      sequenceId,
    );
    data.annotations = [];
    const videoData = {
      ...data,
      hypervideo: {
        ...data.hypervideo,
        clips: [
          {
            src: mediaUrl(m, assets),
            duration: m.durationSeconds || clip.durationSeconds,
            in: 0,
            out: m.durationSeconds || clip.durationSeconds,
            scrubSprite: false,
          },
        ],
      },
    };
    native = FrameTrail.init(
      {
        target: "#media-player",
        startID: "0",
        config: { theme: "dark", defaultTheme: "dark", autohideControls: true },
        contents: resolveInlineData([videoData]),
        resources: resolveInlineData(toFrameTrailResources(project, assets)),
        events: {
          onReady: () => {
            nativeReady = true;
            if (native) {
              native.currentTime = sourceTime;
              if (playing && sourceTime < sourceEnd - 0.05) native.play();
            }
          },
          onPlay: () => (nativePlaying = true),
          onPause: () => (nativePlaying = false),
          onOverlayClick,
          onQuizAnswered,
        },
      },
      "PlayerLauncher",
    );
  } else if (native && nativeReady) {
    if (Math.abs(native.currentTime - sourceTime) > 1.1)
      native.currentTime = Math.max(
        0,
        Math.min(sourceTime, (m.durationSeconds || Infinity) - 0.05),
      );
    if (isPlaying && !nativePlaying && sourceTime < sourceEnd - 0.05)
      native.play();
    if (sourceTime >= sourceEnd - 0.05 && nativePlaying) native.pause();
    if (!isPlaying && nativePlaying) native.pause();
  }
}
function init(start: number) {
  runtimeReady = false;
  instance?.pause();
  if (instance) {
    instance.destroy();
    const host = document.createElement("div");
    host.id = "player";
    document.body.prepend(host);
  }
  if (native) {
    if (nativeReady) native.pause();
    native.destroy();
    const host = document.createElement("div");
    host.id = "media-player";
    host.hidden = true;
    document.body.append(host);
  }
  native = undefined;
  nativeReady = false;
  activeMedia = "";
  generatedUrls.forEach((url) => URL.revokeObjectURL(url));
  generatedUrls.length = 0;
  playing = false;
  instance = FrameTrail.init(
    {
      target: "#player",
      startID: String(project.sequences.findIndex((s) => s.id === sequenceId)),
      language: "en-US",
      config: {
        theme: "dark",
        defaultTheme: "dark",
        autohideControls: true,
        allowFullscreen: false,
      },
      contents: resolveInlineData(
        toFrameTrailContents(project, sequenceId, assets),
      ),
      resources: resolveInlineData(toFrameTrailResources(project, assets)),
      events: {
        onReady: () => {
          setTimeout(() => {
            if (instance) instance.currentTime = start;
            runtimeReady = true;
            send({ type: "TIMETRAIL_READY", revision });
            report();
          }, 20);
        },
        onTimeupdate: report,
        onPlay: () => {
          playing = true;
          report();
        },
        onPause: () => {
          playing = false;
          report();
        },
        onEnded: () => {
          playing = false;
          report();
        },
        onOverlayClick,
        onQuizAnswered,
      },
    },
    "PlayerLauncher",
  );
}
window.addEventListener("message", (event) => {
  if (!validBridgeEvent(event, parent, origin)) return;
  const result = parentMessage.safeParse(event.data);
  if (!result.success) {
    send({
      type: "TIMETRAIL_RUNTIME_ERROR",
      message: "Invalid preview message.",
    });
    return;
  }
  try {
    const m = result.data;
    if (m.type === "TIMETRAIL_PING") {
      if (runtimeReady) send({ type: "TIMETRAIL_READY", revision });
      else if (!instance) send({ type: "TIMETRAIL_READY" });
      return;
    }
    if (m.type === "TIMETRAIL_INIT" || m.type === "TIMETRAIL_SYNC") {
      project = m.project;
      sequenceId = m.sequenceId;
      revision = m.revision;
      assets = m.assetUrls;
      for (const value of Object.values(assets))
        if (
          !value.startsWith(`blob:${origin}/`) &&
          !value.startsWith(origin + "/") &&
          !value.startsWith("data:image/") &&
          !value.startsWith("data:video/") &&
          !value.startsWith("data:audio/") &&
          !value.startsWith("data:application/pdf") &&
          !value.startsWith("data:text/vtt")
        )
          throw new Error("Invalid asset address.");
      init(m.startTime);
    } else if (m.type === "TIMETRAIL_PLAYBACK") {
      if (!instance) return;
      if (m.action === "seek") {
        const duration = project.sequences.find(
          (s) => s.id === sequenceId,
        )!.durationSeconds;
        if (m.timeSeconds === undefined || m.timeSeconds > duration)
          throw new Error("Seek is outside the sequence.");
        instance.currentTime = m.timeSeconds;
      } else {
        playing = m.action === "play";
        instance[m.action]();
      }
      report();
    } else if (m.type === "TIMETRAIL_SELECT") {
      if (m.cueId)
        send({ type: "TIMETRAIL_SELECTION_CHANGED", cueId: m.cueId });
    } else if (m.type === "TIMETRAIL_DESTROY") {
      instance?.pause();
      if (nativeReady) native?.pause();
      generatedUrls.forEach((url) => URL.revokeObjectURL(url));
    }
  } catch (e) {
    send({
      type: "TIMETRAIL_RUNTIME_ERROR",
      message:
        e instanceof Error
          ? e.message
          : "FrameTrail could not render this project.",
    });
  }
});
window.addEventListener("error", (e) =>
  send({
    type: "TIMETRAIL_RUNTIME_ERROR",
    message: String(e.message).slice(0, 1500),
  }),
);
send({ type: "TIMETRAIL_READY" });
