import type { Project } from "../domain/model";
import type { PlayerPanel, PlayerView } from "../domain/presentation";

export interface PanelState {
  sequenceId: string;
  time: number;
  answers: Record<string, number>;
  flags: Record<string, boolean>;
}
export interface PanelActions {
  seek: (sequenceId: string, time: number) => void;
  flag: (key: string, value: boolean) => void;
}
export const visiblePanels = (
  project: Project,
  view: PlayerView,
  state: PanelState,
  panels: PlayerPanel[],
) =>
  panels.filter(
    (p) =>
      view.panels.includes(p.id) &&
      (!p.requiresFlag || state.flags[p.requiresFlag]) &&
      (!p.sequenceId || p.sequenceId === state.sequenceId) &&
      (p.start === undefined || state.time >= p.start) &&
      (p.end === undefined || state.time < p.end),
  );
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
}
// Shared by the Vue player and the exported viewer. All content is text or typed data.
export function renderPanels(
  root: HTMLElement,
  project: Project,
  panels: PlayerPanel[],
  state: PanelState,
  actions: PanelActions,
) {
  const captions = panels.some((p) => p.kind === "transcript")
    ? project.sequences
        .find((s) => s.id === state.sequenceId)
        ?.cues.filter((c) => c.kind === "caption")
        .map((c) => [
          c.id,
          c.body,
          c.start,
          c.end,
          state.time >= c.start && state.time < (c.end ?? c.start + 3),
        ])
    : [];
  const key = JSON.stringify([
    project.id,
    panels,
    state.sequenceId,
    state.answers,
    state.flags,
    captions,
    panels.some((p) => p.kind === "timer") ? Math.floor(state.time) : null,
  ]);
  if (root.dataset.renderKey === key) return;
  root.dataset.renderKey = key;
  const focused = root.contains(document.activeElement)
    ? (document.activeElement as HTMLElement)?.dataset.entry
    : undefined;
  root.replaceChildren();
  for (const panel of panels) {
    const article = node("article");
    article.className = `viewer-panel panel-${panel.kind}`;
    article.dataset.panel = panel.id;
    article.append(node("h3", panel.title));
    if (panel.body) article.append(node("p", panel.body));
    if (panel.kind === "score") {
      const quizzes = project.sequences
        .flatMap((s) => s.cues)
        .filter((c) => c.quiz);
      const answered = quizzes.filter((c) => state.answers[c.id] !== undefined);
      const correct = quizzes.filter(
        (c) => state.answers[c.id] === c.quiz?.answerIndex,
      );
      const score = node(
        "p",
        `${correct.length} correct · ${answered.length} of ${quizzes.length} answered`,
      );
      score.setAttribute("role", "status");
      article.append(score);
      const progress = node("progress");
      progress.max = quizzes.length || 1;
      progress.value = answered.length;
      progress.setAttribute("aria-label", "Questions answered");
      article.append(progress);
    }
    if (panel.kind === "timer") {
      const seq = project.sequences.find((s) => s.id === state.sequenceId)!;
      const seconds = Math.max(
        0,
        Math.ceil((panel.end ?? seq.durationSeconds) - state.time),
      );
      article.append(
        node(
          "p",
          `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} remaining in this scene`,
        ),
      );
    }
    if (panel.kind === "transcript") {
      const seq = project.sequences.find((s) => s.id === state.sequenceId)!;
      for (const cue of seq.cues.filter((c) => c.kind === "caption")) {
        const b = node(
          "button",
          `${Math.floor(cue.start)}s · ${cue.body || cue.title || "Caption"}`,
        );
        b.dataset.entry = `${panel.id}_${cue.id}`;
        b.className = "transcript-line";
        b.setAttribute(
          "aria-current",
          String(
            state.time >= cue.start && state.time < (cue.end ?? cue.start + 3),
          ),
        );
        b.onclick = () => actions.seek(seq.id, cue.start);
        article.append(b);
      }
    }
    let map: HTMLDivElement | undefined;
    if (panel.kind === "map") {
      map = node("div");
      map.className = "viewer-map";
      map.setAttribute("aria-label", panel.title + " diagram");
      article.append(map);
    }
    const maxValue = Math.max(
      1,
      ...panel.entries.map((e) => Math.abs(e.value ?? 0)),
    );
    for (const entry of panel.entries) {
      const row = node("div");
      row.className = "panel-entry";
      const entryKey = `${panel.id}_${entry.id}`;
      const label = `${entry.label}${entry.value === undefined ? "" : ` · ${entry.value}${entry.unit ? " " + entry.unit : ""}`}`;
      if (panel.kind === "checklist") {
        const wrap = node("label");
        const input = node("input");
        input.type = "checkbox";
        input.checked = Boolean(state.flags[entry.id]);
        input.dataset.entry = entryKey;
        input.onchange = () => actions.flag(entry.id, input.checked);
        wrap.append(input, node("span", label));
        row.append(wrap);
      } else if (entry.timeSeconds !== undefined || entry.sequenceId) {
        const b = node("button", label);
        b.dataset.entry = entryKey;
        b.onclick = () =>
          actions.seek(
            entry.sequenceId || panel.sequenceId || project.activeSequenceId,
            entry.timeSeconds ?? 0,
          );
        row.append(b);
        if (map) {
          const marker = b.cloneNode(true) as HTMLButtonElement;
          marker.className = "map-marker";
          marker.style.left = `${entry.x ?? 50}%`;
          marker.style.top = `${entry.y ?? 50}%`;
          marker.onclick = b.onclick;
          map.append(marker);
        }
      } else row.append(node("strong", label));
      if (panel.kind === "chart" && entry.value !== undefined) {
        const bar = node("div");
        bar.className = "chart-bar";
        bar.style.width = `${Math.max(1, (Math.abs(entry.value) / maxValue) * 100)}%`;
        bar.setAttribute("aria-hidden", "true");
        row.append(bar);
      }
      if (entry.detail) row.append(node("p", entry.detail));
      if (entry.url) {
        const a = node("a", "Source for " + entry.label);
        a.href = entry.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        row.append(a);
      }
      article.append(row);
    }
    root.append(article);
  }
  if (focused)
    [...root.querySelectorAll<HTMLElement>("[data-entry]")]
      .find((e) => e.dataset.entry === focused)
      ?.focus();
}
