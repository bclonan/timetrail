import type { Sequence } from "../domain/model";
import { escapeHtml } from "./generatedCard";

export function toFrameTrailLayoutAreas(sequence: Sequence) {
  const result: Record<string, Record<string, unknown>[]> = {
    areaTop: [],
    areaBottom: [],
    areaLeft: [],
    areaRight: [],
  };
  for (const area of sequence.layoutAreas || []) {
    const cues = sequence.cues
      .filter((cue) =>
        area.content === "transcript"
          ? cue.kind === "caption"
          : area.content === "chapters"
            ? cue.kind === "chapter"
            : ["note", "fact", "source", "definition", "warning"].includes(
                cue.kind,
              ),
      )
      .sort((a, b) => a.start - b.start);
    const html =
      area.content === "text"
        ? `<p class="area-text">${escapeHtml(area.text || "")}</p>`
        : cues
            .map(
              (cue) =>
                `<article class="area-entry timebased" data-start="${cue.start}" data-end="${cue.end ?? sequence.durationSeconds}"><button type="button" data-timetrail-seek="${cue.start}">${Math.floor(cue.start / 60)}:${String(Math.floor(cue.start % 60)).padStart(2, "0")} ${escapeHtml(cue.title || (area.content === "transcript" ? "Read from here" : cue.kind))}</button><p>${escapeHtml(cue.body || "")}</p>${cue.url ? `<a href="${escapeHtml(cue.url)}" target="_blank" rel="noopener noreferrer">Read source</a>` : ""}</article>`,
            )
            .join("") ||
          `<p class="area-empty">${area.content === "transcript" ? "Add captions to this screen to show its transcript." : "No matching cues on this screen yet."}</p>`;
    const key = `area${area.area[0]!.toUpperCase()}${area.area.slice(1)}`;
    result[key]!.push({
      type: area.content === "timelines" ? "Timelines" : "CustomHTML",
      name: escapeHtml(area.title),
      icon: "",
      cssClass: "timetrail-area",
      html: area.content === "timelines" ? "" : html,
      contentSize: area.size,
      initClosed: area.collapsed,
      collectionFilter: { tags: [], types: [], users: [], text: "" },
      filterAspect: "type",
      zoomControls: false,
      onClickContentItem: "",
    });
  }
  return result;
}
