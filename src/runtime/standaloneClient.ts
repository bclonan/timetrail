import { projectSchema } from "../domain/model";
import { runtimeMessage, type ParentMessage } from "./bridgeMessages";
import { defaultPresentation, type PlayerView } from "../domain/presentation";
import { renderPanels, visiblePanels } from "./playerPanels";

// This client is bundled into each export. It never reads the Studio database.
const data = JSON.parse(document.getElementById("data")!.textContent!);
const project = projectSchema.parse(data.project);
const assets = data.assets as Record<string, string>;
const frame = document.querySelector("iframe")!;
const element = (id: string) => document.getElementById(id)!;
const seekInput = element("seek") as HTMLInputElement;
let sequenceId = project.activeSequenceId;
let initializing = false;
let time = 0,
  ready = false,
  captions = true,
  narration = false,
  paused = true,
  lastNarration = "";
const history: { sequenceId: string; time: number }[] = [];
const answered = new Map<string, number>();
const dismissedQuizzes = new Set<string>();
const pinned = new Set<string>();
const flags: Record<string, boolean> = {};
const presentation = project.presentation || defaultPresentation();
// Export-only view selection does not change the saved project's default layout.
let research = presentation.views.find((v) => v.layout === "research");
if (data.startInResearch && !research) {
  let id = "export-research";
  while (presentation.views.some((v) => v.id === id)) id += "-view";
  research = {
    ...defaultPresentation().views[1]!,
    id,
    panels: presentation.panels.map((p) => p.id),
  } satisfies PlayerView;
  presentation.views.push(research);
}
let view =
  presentation.views.find(
    (v) => v.id === new URLSearchParams(location.search).get("view"),
  ) ||
  (data.startInResearch ? research : undefined) ||
  presentation.views.find((v) => v.id === presentation.defaultViewId)!;
const sequence = () => project.sequences.find((s) => s.id === sequenceId)!;
for (const key of Object.keys(assets))
  if (!assets[key]!.startsWith("data:"))
    assets[key] = new URL(assets[key]!, location.href).href;
function quizState() {
  return {
    answers: Object.fromEntries(answered),
    dismissedCueIds: [...dismissedQuizzes],
  };
}
function syncQuizzes() {
  send({ type: "TIMETRAIL_QUIZ_STATE", state: quizState() });
}
function send(message: ParentMessage) {
  if (message.type === "TIMETRAIL_PLAYBACK" && message.action === "play") {
    for (const cue of sequence().cues)
      if (cue.quiz && time >= cue.start && time < (cue.end ?? cue.start + 5))
        dismissedQuizzes.add(cue.id);
    syncQuizzes();
    render();
  }
  frame.contentWindow!.postMessage(message, location.origin);
}
function init() {
  frame.classList.toggle(
    "has-layout-areas",
    Boolean(sequence().layoutAreas?.length),
  );
  initializing = true;
  ready = false;
  paused = true;
  (element("play") as HTMLButtonElement).disabled = true;
  seekInput.disabled = true;
  element("status").textContent = "Opening the selected scene...";
  send({
    type: "TIMETRAIL_INIT",
    project,
    sequenceId,
    revision: 0,
    startTime: time,
    assetUrls: assets,
    quizState: quizState(),
  });
  chapters();
}
function button(label: string, action: () => void) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = action;
  return b;
}
function seek(value: number) {
  time = Math.max(0, Math.min(value, sequence().durationSeconds));
  send({ type: "TIMETRAIL_PLAYBACK", action: "seek", timeSeconds: time });
}
function branch(target: string, start = 0) {
  if (!project.sequences.some((s) => s.id === target)) return;
  history.push({ sequenceId, time });
  sequenceId = target;
  time = start;
  init();
}
function chapters() {
  element("chapters").replaceChildren(
    ...sequence()
      .cues.filter((c) => c.kind === "chapter")
      .map((c) => button(c.title || "Chapter", () => seek(c.start))),
  );
}
function render() {
  const seq = sequence();
  const state = {
    sequenceId,
    time,
    answers: Object.fromEntries(answered),
    flags,
  };
  renderPanels(
    element("panels"),
    project,
    visiblePanels(project, view, state, presentation.panels),
    state,
    {
      seek: (target, at) =>
        target === sequenceId ? seek(at) : branch(target, at),
      flag: (key, value) => {
        flags[key] = value;
        render();
      },
    },
  );
  seekInput.max = String(seq.durationSeconds);
  seekInput.value = String(time);
  element("time").textContent = `${Math.floor(time)} / ${seq.durationSeconds}s`;
  const caption = seq.cues.find(
    (c) =>
      c.kind === "caption" && time >= c.start && time < (c.end ?? c.start + 3),
  );
  element("caption").textContent =
    captions && caption ? caption.body || "" : "";
  if (narration && !paused && caption && lastNarration !== caption.id) {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(caption.body));
    lastNarration = caption.id;
  }
  const cues = seq.cues.filter(
    (c) =>
      !["caption", "narration", "chapter"].includes(c.kind) &&
      (!c.quiz || !dismissedQuizzes.has(c.id)) &&
      ((time >= c.start && time < (c.end ?? c.start + 5)) || pinned.has(c.id)),
  );
  const key = cues
    .map((c) => c.id + answered.get(c.id) + pinned.has(c.id))
    .join();
  if (element("context").dataset.key === key) return;
  element("context").dataset.key = key;
  element("context").replaceChildren();
  for (const cue of cues) {
    const article = document.createElement("article");
    article.className = "card";
    const title = document.createElement("h3");
    title.textContent = cue.title || cue.kind;
    article.append(title);
    const body = document.createElement("p");
    body.textContent = cue.body || "";
    article.append(body);
    article.append(
      button(pinned.has(cue.id) ? "Unpin" : "Pin", () => {
        if (pinned.has(cue.id)) pinned.delete(cue.id);
        else pinned.add(cue.id);
        render();
      }),
    );
    if (cue.url) {
      const link = document.createElement("a");
      link.href = cue.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Read source";
      article.append(link);
    }
    if (cue.quiz) {
      const question = document.createElement("p");
      question.textContent = cue.quiz.question;
      article.append(question);
      cue.quiz.options.forEach((option, i) => {
        const answer = button(option, () => {
          answered.set(cue.id, i);
          syncQuizzes();
          render();
        });
        answer.disabled = answered.has(cue.id);
        article.append(answer);
      });
      if (answered.has(cue.id)) {
        const feedback = document.createElement("p");
        feedback.setAttribute("role", "status");
        feedback.textContent =
          (answered.get(cue.id) === cue.quiz.answerIndex
            ? "Correct. "
            : `Correct answer: ${cue.quiz.options[cue.quiz.answerIndex]}. `) +
          (cue.quiz.explanation || "");
        article.append(
          feedback,
          button("Continue film", () =>
            send({ type: "TIMETRAIL_PLAYBACK", action: "play" }),
          ),
        );
        if (
          answered.get(cue.id) !== cue.quiz.answerIndex &&
          cue.quiz.retryTime !== undefined
        )
          article.append(
            button("Review explanation", () => seek(cue.quiz!.retryTime!)),
          );
      }
    }
    if (cue.branch)
      article.append(button(cue.branch.label, () => choose(cue.id)));
    element("context").append(article);
  }
}
function choose(cueId?: string) {
  const cue = sequence().cues.find((c) => c.id === cueId);
  if (!cue?.branch) return;
  if (cue.branch.requiresFlag && !flags[cue.branch.requiresFlag]) {
    element("status").textContent =
      "Complete the required checklist item before choosing this path.";
    return;
  }
  if (cue.branch.setsFlag) flags[cue.branch.setsFlag] = true;
  branch(cue.branch.targetSequenceId, cue.branch.targetTime);
}
function views() {
  document.body.className = `film-player view-${view.layout} theme-${view.theme}${view.aspect === "9:16" ? " portrait" : ""}`;
  document.body.style.setProperty("--viewer-accent", view.accent);
  document.body.style.setProperty(
    "--viewer-aspect",
    view.aspect.replace(":", "/"),
  );
  element("context").hidden = !view.context;
  element("context-heading").hidden = !view.context;
  element("chapters").hidden = !view.chapters;
  element("views").replaceChildren(
    ...presentation.views.map((v) => {
      const b = button(v.name, () => {
        view = v;
        const url = new URL(location.href);
        url.searchParams.set("view", v.id);
        window.history.replaceState(null, "", url);
        views();
        render();
      });
      b.setAttribute("aria-pressed", String(v.id === view.id));
      return b;
    }),
  );
}
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow)
    return;
  const parsed = runtimeMessage.safeParse(event.data);
  if (!parsed.success) return;
  const message = parsed.data;
  if (message.type === "TIMETRAIL_READY") {
    if (message.revision === undefined) {
      if (!initializing) init();
    } else {
      initializing = false;
      ready = true;
      (element("play") as HTMLButtonElement).disabled = false;
      seekInput.disabled = false;
      element("status").textContent =
        "Ready. Your project stays in this viewer.";
      render();
    }
  }
  if (
    message.type === "TIMETRAIL_PLAYHEAD" &&
    message.sequenceId === sequenceId
  ) {
    time = message.currentTime;
    paused = message.paused;
    render();
  }
  if (message.type === "TIMETRAIL_LINK_ACTIVATED") {
    if (message.cueId) choose(message.cueId);
    else branch(message.sequenceId, message.timeSeconds);
  }
  if (message.type === "TIMETRAIL_QUIZ_ANSWERED") {
    answered.set(message.cueId, message.answerIndex);
    syncQuizzes();
    render();
  }
  if (message.type === "TIMETRAIL_QUIZ_DISMISSED") {
    dismissedQuizzes.add(message.cueId);
    syncQuizzes();
    render();
  }
  if (message.type === "TIMETRAIL_RUNTIME_ERROR")
    element("status").textContent = message.message;
});
element("play").onclick = () => {
  if (ready) send({ type: "TIMETRAIL_PLAYBACK", action: "play" });
};
(element("play") as HTMLButtonElement).disabled = !ready;
seekInput.disabled = !ready;
element("pause").onclick = () =>
  send({ type: "TIMETRAIL_PLAYBACK", action: "pause" });
seekInput.oninput = () => seek(Number(seekInput.value));
element("back").onclick = () => {
  const previous = history.pop();
  if (previous) {
    sequenceId = previous.sequenceId;
    time = previous.time;
    init();
  }
};
element("cc").onclick = () => {
  captions = !captions;
  element("cc").textContent = `Captions ${captions ? "on" : "off"}`;
  render();
};
element("narrate").onclick = () => {
  if (!("speechSynthesis" in window)) {
    element("status").textContent = "Narration is unavailable in this browser.";
    return;
  }
  narration = !narration;
  element("narrate").textContent = `Narration ${narration ? "on" : "off"}`;
  if (!narration) speechSynthesis.cancel();
  render();
};
element("full").onclick = () =>
  void document.documentElement.requestFullscreen();
element("restart").onclick = () => {
  for (const key of Object.keys(flags)) delete flags[key];
  answered.clear();
  dismissedQuizzes.clear();
  pinned.clear();
  history.length = 0;
  sequenceId = project.activeSequenceId;
  time = 0;
  init();
};
window.addEventListener("keydown", (event) => {
  if (
    (event.target as HTMLElement).closest("input,textarea,select,button,a") ||
    !ready ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  if (event.key === " ") {
    event.preventDefault();
    send({ type: "TIMETRAIL_PLAYBACK", action: paused ? "play" : "pause" });
  }
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    seek(time + (event.key === "ArrowRight" ? 5 : -5));
  }
});
views();
chapters();
// A large embedded asset payload can delay this script until after iframe READY.
// Probe both now and at load; the runtime handshake is idempotent.
frame.addEventListener("load", () => send({ type: "TIMETRAIL_PING" }));
if (location.protocol !== "file:") send({ type: "TIMETRAIL_PING" });
if (location.protocol === "file:")
  element("status").textContent =
    "Serve this HTML with a static HTTP server to enable the isolated player.";
