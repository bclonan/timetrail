import { projectSchema } from "../domain/model";
import { runtimeMessage } from "./bridgeMessages";

// This client is bundled into each export. It never reads the Studio database.
const data = JSON.parse(document.getElementById("data")!.textContent!);
const project = projectSchema.parse(data.project);
const assets = data.assets as Record<string, string>;
const frame = document.querySelector("iframe")!;
const element = (id: string) => document.getElementById(id)!;
const seekInput = element("seek") as HTMLInputElement;
let sequenceId = project.activeSequenceId;
let time = 0,
  ready = false,
  captions = true,
  narration = false,
  paused = true,
  lastNarration = "";
const history: { sequenceId: string; time: number }[] = [];
const answered = new Map<string, number>();
const pinned = new Set<string>();
const seenQuizzes = new Set<string>();
const sequence = () => project.sequences.find((s) => s.id === sequenceId)!;
for (const key of Object.keys(assets))
  if (!assets[key]!.startsWith("data:"))
    assets[key] = new URL(assets[key]!, location.href).href;
const send = (message: unknown) =>
  frame.contentWindow!.postMessage(message, location.origin);
function init() {
  ready = false;
  paused = true;
  send({
    type: "TIMETRAIL_INIT",
    project,
    sequenceId,
    revision: 0,
    startTime: time,
    assetUrls: assets,
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
      ((time >= c.start && time < (c.end ?? c.start + 5)) || pinned.has(c.id)),
  );
  const quiz = cues.find((c) => c.quiz && !seenQuizzes.has(c.id));
  if (quiz) {
    seenQuizzes.add(quiz.id);
    send({ type: "TIMETRAIL_PLAYBACK", action: "pause" });
  }
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
      }
    }
    if (cue.branch)
      article.append(
        button(cue.branch.label, () =>
          branch(cue.branch!.targetSequenceId, cue.branch!.targetTime),
        ),
      );
    element("context").append(article);
  }
}
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow)
    return;
  const parsed = runtimeMessage.safeParse(event.data);
  if (!parsed.success) return;
  const message = parsed.data;
  if (message.type === "TIMETRAIL_READY") {
    if (message.revision === undefined) init();
    else {
      ready = true;
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
  if (message.type === "TIMETRAIL_LINK_ACTIVATED")
    branch(message.sequenceId, message.timeSeconds);
  if (message.type === "TIMETRAIL_QUIZ_ANSWERED") {
    answered.set(message.cueId, message.answerIndex);
    render();
  }
  if (message.type === "TIMETRAIL_RUNTIME_ERROR")
    element("status").textContent = message.message;
});
element("play").onclick = () => {
  if (ready) send({ type: "TIMETRAIL_PLAYBACK", action: "play" });
};
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
element("full").onclick = () => void frame.requestFullscreen();
chapters();
if (location.protocol === "file:")
  element("status").textContent =
    "Serve this HTML with a static HTTP server to enable the isolated player.";
