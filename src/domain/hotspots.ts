import { z } from "zod";
import type { Cue } from "./model";

export const annotationKinds = [
  "note",
  "fact",
  "definition",
  "source",
  "warning",
  "hotspot",
];
export function isIndicator(cue: Cue) {
  return (
    annotationKinds.includes(cue.kind) &&
    (!cue.style ||
      !Object.keys(cue.style).length ||
      cue.style.preset === "marker")
  );
}
export function hasIndicator(cue: Cue) {
  return isIndicator(cue);
}
export function cuePosition(cue: Cue, index = 0) {
  return (
    cue.position ||
    (cue.quiz
      ? { x: 8, y: 12, width: 84, height: 74 }
      : cue.kind === "branch"
        ? { x: 72, y: 74, width: 22, height: 9 }
        : annotationKinds.includes(cue.kind)
          ? isIndicator(cue)
            ? {
                x: 6 + (index % 10) * 8,
                y: 8 + (Math.floor(index / 10) % 7) * 10,
                width: 4,
                height: 7,
              }
            : { x: 6, y: 8, width: 22, height: 9 }
          : { x: 5, y: 5, width: 30, height: 30 })
  );
}
export function positionForCue(cue: Cue, cues: Cue[]) {
  const markers = cues.filter(hasIndicator);
  const index = markers.findIndex((c) => c.id === cue.id);
  return cuePosition(cue, index < 0 ? markers.length : index);
}

export const hotspotStyleSchema = z.object({
  preset: z.enum(["filled", "outline", "marker"]).optional(),
  shape: z.enum(["rounded", "rectangle", "circle"]).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  textColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  borderWidth: z.number().min(0).max(10).optional(),
  borderRadius: z.number().min(0).max(48).optional(),
});
export function hotspotAppearance(style: Record<string, unknown> = {}) {
  const s = hotspotStyleSchema.parse(style);
  const filled = !s.preset || s.preset === "filled";
  return {
    shape: s.shape || (s.preset === "marker" ? "circle" : "rounded"),
    color: s.color || "#bfe693",
    textColor: s.textColor || (filled ? "#142b21" : "#ffffff"),
    backgroundColor: filled ? s.backgroundColor || "#c5ef91" : "",
    borderWidth: s.borderWidth ?? (filled ? 0 : 4),
    borderRadius: s.borderRadius ?? 10,
  };
}
