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
import type { Project } from "../domain/model";
import { MediaLoadMonitor } from "./MediaLoadMonitor";
import { QuizOverlay } from "./QuizOverlay";
import { AnnotationIndicators } from "./AnnotationIndicators";
import { hasIndicator } from "../domain/hotspots";
import { LayoutAreaBridge } from "./LayoutAreaBridge";
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
let mediaMonitor: MediaLoadMonitor | undefined;
let mediaState: "loading" | "ready" | "error" = "ready";
let resumeAfterLoad = false;
const mediaStatus = document.createElement("section");
mediaStatus.id = "media-status";
mediaStatus.hidden = true;
mediaStatus.setAttribute("aria-live", "polite");
document.body.append(mediaStatus);
function stopForMedia() {
  resumeAfterLoad ||= playing;
  playing = false;
  instance?.pause();
  if (nativeReady) native?.pause();
}
function recoverMedia(action: "retry-media" | "skip-media") {
  const seq = project.sequences.find((s) => s.id === sequenceId)!;
  const clip = seq.clips.find((c) => c.id === activeMedia);
  if (!clip || !instance) return;
  resumeAfterLoad = false;
  playing = false;
  instance.pause();
  if (action === "skip-media")
    instance.currentTime = Math.min(
      seq.durationSeconds,
      clip.timelineStart + clip.durationSeconds,
    );
  else activeMedia = "";
  report();
}
function showMediaStatus(
  state: typeof mediaState,
  name: string,
  message?: string,
  source?: string,
) {
  mediaState = state;
  mediaStatus.hidden = state === "ready";
  if (state === "ready") {
    const resume = resumeAfterLoad;
    resumeAfterLoad = false;
    if (resume) {
      playing = true;
      instance?.play();
    }
    report();
    return;
  }
  stopForMedia();
  const heading = document.createElement("strong");
  heading.textContent =
    state === "loading" ? "Loading footage" : "This clip could not load";
  const detail = document.createElement("p");
  detail.textContent =
    state === "loading"
      ? `${name}. Playback is paused until the source is ready.`
      : `${name}. ${message}`;
  const actions = document.createElement("div");
  const retry = document.createElement("button");
  retry.textContent = "Retry clip";
  retry.onclick = () => recoverMedia("retry-media");
  const skip = document.createElement("button");
  skip.textContent = "Skip clip";
  skip.onclick = () => recoverMedia("skip-media");
  actions.append(retry, skip);
  if (source) {
    const link = document.createElement("a");
    link.href = source;
    link.textContent = "Open source";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    actions.append(link);
  }
  mediaStatus.replaceChildren(heading, detail, actions);
}
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
const layout = new LayoutAreaBridge(send, (time) => {
  if (instance && Number.isFinite(time)) {
    instance.currentTime = Math.min(
      time,
      project.sequences.find((s) => s.id === sequenceId)!.durationSeconds,
    );
    report();
  }
});
function resumePlayback() {
  resumeAfterLoad = mediaState === "loading";
  if (mediaState !== "ready") return;
  playing = true;
  instance?.play();
  report();
}
const quizOverlay = new QuizOverlay({
  pause: () => {
    playing = false;
    instance?.pause();
    if (nativeReady) native?.pause();
  },
  answer: (cueId, answerIndex) =>
    send({ type: "TIMETRAIL_QUIZ_ANSWERED", cueId, answerIndex }),
  dismiss: (cueId) => send({ type: "TIMETRAIL_QUIZ_DISMISSED", cueId }),
  resume: resumePlayback,
});
const indicators = new AnnotationIndicators((cue) =>
  send({ type: "TIMETRAIL_SELECTION_CHANGED", cueId: cue.id }),
);
for (const id of [
  "media-player",
  "media-status",
  "offline",
  "timetrail-quiz",
  "annotation-indicators",
  "annotation-detail",
])
  layout.picture.append(document.getElementById(id)!);
function runtimeContents() {
  const contents = toFrameTrailContents(project, sequenceId, assets);
  const indicatorIds = new Set(
    project.sequences.flatMap((s) =>
      s.cues.filter(hasIndicator).map((c) => c.id),
    ),
  );
  // The portable mapper retains FrameTrail quizzes; this runtime renders one shared quiz layer.
  for (const content of contents)
    content.hypervideo.contents = content.hypervideo.contents.filter(
      (c) => c.body["frametrail:type"] !== "quiz" && !indicatorIds.has(c.id),
    );
  return contents;
}
function onOverlayClick(event: CustomEvent<{ name: string }>) {
  const cue = project.sequences
    .find((s) => s.id === sequenceId)
    ?.cues.find((c) => c.id === event.detail.name);
  if (cue?.branch)
    send({
      type: "TIMETRAIL_LINK_ACTIVATED",
      cueId: cue.id,
      sequenceId: cue.branch.targetSequenceId,
      timeSeconds: cue.branch.targetTime,
    });
  else if (cue) {
    send({ type: "TIMETRAIL_SELECTION_CHANGED", cueId: cue.id });
    if (cue.body) indicators.open(cue);
    else if (cue.url) window.open(cue.url, "_blank", "noopener,noreferrer");
  }
}
function report() {
  if (!instance || !project) return;
  const s = project.sequences.find((s) => s.id === sequenceId)!;
  const time = Math.min(instance.currentTime, s.durationSeconds);
  indicators.update(s.cues, time);
  quizOverlay.update(s.cues, time);
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
    mediaMonitor?.destroy();
    mediaMonitor = undefined;
    mediaState = "ready";
    mediaStatus.hidden = true;
    resumeAfterLoad = false;
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
    mediaMonitor?.destroy();
    mediaMonitor = undefined;
    // FrameTrail exposes one base clip per public player. The null-video player keeps sequence time.
    if (native) {
      if (nativeReady) native.pause();
      native.destroy();
      container = document.createElement("div");
      container.id = "media-player";
      layout.picture.append(container);
    }
    container.replaceChildren();
    activeMedia = clip.id;
    nativeReady = false;
    nativePlaying = false;
    const data =
      runtimeContents()[
        project.sequences.findIndex((s) => s.id === sequenceId)
      ]!;
    data.hypervideo.contents = interactiveContents(
      seq.cues
        .filter(
          (c) =>
            !c.quiz &&
            !hasIndicator(c) &&
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
        config: {
          ...data.hypervideo.config,
          layoutArea: {
            areaTop: [],
            areaBottom: [],
            areaLeft: [],
            areaRight: [],
          },
        },
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
    const mediaInstance = FrameTrail.init(
      {
        target: "#media-player",
        startID: "0",
        config: { theme: "dark", defaultTheme: "dark", autohideControls: true },
        contents: resolveInlineData([videoData]),
        resources: resolveInlineData(toFrameTrailResources(project, assets)),
        events: {
          onReady: () => {
            // FrameTrail resets time after ready, and metadata alone may not allow seeking.
            const synchronize = () => {
              if (native !== mediaInstance || activeMedia !== clip.id) return;
              nativeReady = true;
              mediaInstance.currentTime = sourceTime;
              syncVideo(instance?.currentTime ?? time, playing);
            };
            setTimeout(() => {
              if (native !== mediaInstance) return;
              const video =
                m.type === "video" || m.type === "audio"
                  ? container.querySelector("video")
                  : null;
              if (video && video.readyState < 2) {
                video.addEventListener("loadeddata", synchronize, {
                  once: true,
                });
                video.preload = "auto";
              }
              synchronize();
              mediaMonitor?.inspect();
            }, 20);
          },
          onPlay: () => (nativePlaying = true),
          onPause: () => (nativePlaying = false),
          onOverlayClick,
        },
      },
      "PlayerLauncher",
    );
    native = mediaInstance;
    mediaMonitor = new MediaLoadMonitor(
      container,
      () => nativeReady,
      (state, message) => {
        if (activeMedia !== clip.id) return;
        showMediaStatus(
          state,
          m.name,
          message,
          m.source.kind === "remote" ? m.source.url : undefined,
        );
      },
    );
  } else if (native && nativeReady) {
    if (Math.abs(native.currentTime - sourceTime) > 1.1)
      native.currentTime = Math.max(
        0,
        Math.min(sourceTime, (m.durationSeconds || Infinity) - 0.05),
      );
    if (
      isPlaying &&
      mediaState === "ready" &&
      !nativePlaying &&
      sourceTime < sourceEnd - 0.05
    )
      native.play();
    if (sourceTime >= sourceEnd - 0.05 && nativePlaying) native.pause();
    if (!isPlaying && nativePlaying) native.pause();
  }
}
function init(start: number) {
  layout.disconnect();
  document.body.classList.toggle(
    "has-side-areas",
    Boolean(
      project.sequences
        .find((s) => s.id === sequenceId)
        ?.layoutAreas?.some((a) => a.area === "left" || a.area === "right"),
    ),
  );
  document.body.classList.toggle(
    "has-layout-areas",
    Boolean(
      project.sequences.find((s) => s.id === sequenceId)?.layoutAreas?.length,
    ),
  );
  mediaMonitor?.destroy();
  mediaMonitor = undefined;
  mediaState = "ready";
  mediaStatus.hidden = true;
  resumeAfterLoad = false;
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
    layout.picture.append(host);
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
      contents: resolveInlineData(runtimeContents()),
      resources: resolveInlineData(toFrameTrailResources(project, assets)),
      events: {
        onReady: () => {
          setTimeout(() => {
            if (instance) instance.currentTime = start;
            runtimeReady = true;
            layout.mount();
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
      },
    },
    "PlayerLauncher",
  );
}
window.addEventListener("message", (event) => {
  if (!validBridgeEvent(event, parent, origin)) return;
  // Browser integrations may also message the iframe. Only parse our protocol.
  if (
    typeof event.data?.type !== "string" ||
    !event.data.type.startsWith("TIMETRAIL_")
  )
    return;
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
      indicators.reset();
      quizOverlay.reset(m.quizState || { answers: {}, dismissedCueIds: [] });
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
    } else if (m.type === "TIMETRAIL_QUIZ_STATE") {
      quizOverlay.setState(m.state);
      if (project && instance)
        quizOverlay.update(
          project.sequences.find((s) => s.id === sequenceId)!.cues,
          instance.currentTime,
        );
    } else if (m.type === "TIMETRAIL_PLAYBACK") {
      if (!instance) return;
      if (m.action === "retry-media" || m.action === "skip-media") {
        recoverMedia(m.action);
        return;
      }
      if (m.action === "seek") {
        const duration = project.sequences.find(
          (s) => s.id === sequenceId,
        )!.durationSeconds;
        if (m.timeSeconds === undefined || m.timeSeconds > duration)
          throw new Error("Seek is outside the sequence.");
        instance.currentTime = m.timeSeconds;
      } else {
        if (m.action === "play") quizOverlay.close(false);
        resumeAfterLoad = m.action === "play" && mediaState === "loading";
        if (m.action === "play" && mediaState !== "ready") {
          report();
          return;
        }
        playing = m.action === "play";
        instance[m.action]();
      }
      report();
    } else if (m.type === "TIMETRAIL_SELECT") {
      if (m.cueId)
        send({ type: "TIMETRAIL_SELECTION_CHANGED", cueId: m.cueId });
    } else if (m.type === "TIMETRAIL_DESTROY") {
      layout.disconnect();
      mediaMonitor?.destroy();
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
