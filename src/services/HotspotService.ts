import { z } from "zod";
import {
  applyOperations,
  clone,
  cueInputSchema,
  id,
  now,
  type Cue,
  type Operation,
  type Project,
} from "../domain/model";
import { hotspotStyleSchema } from "../domain/hotspots";

export const hotspotLayoutSchema = z.enum([
  "keep",
  "stack-right",
  "bottom-row",
  "grid",
]);
export const organizeHotspotsSchema = z.object({
  sequenceId: z.string().max(100).optional(),
  cueIds: z.array(z.string().max(100)).max(50).default([]),
  create: z
    .array(
      cueInputSchema.extend({ kind: z.literal("hotspot").default("hotspot") }),
    )
    .max(30)
    .default([]),
  group: z.string().max(80).optional(),
  style: hotspotStyleSchema.optional(),
  layout: hotspotLayoutSchema.default("keep"),
  shiftSeconds: z.number().min(-86400).max(86400).default(0),
});
export function hotspotPosition(
  index: number,
  layout: z.infer<typeof hotspotLayoutSchema>,
) {
  if (layout === "stack-right")
    return { x: 68, y: 6 + index * 14, width: 28, height: 10 };
  if (layout === "bottom-row")
    return { x: 4 + index * 32, y: 70, width: 28, height: 10 };
  return {
    x: 4 + (index % 3) * 32,
    y: 6 + Math.floor(index / 3) * 14,
    width: 28,
    height: 10,
  };
}
export function organizeHotspots(project: Project, raw: unknown) {
  const input = organizeHotspotsSchema.parse(raw);
  const sequenceId = input.sequenceId || project.activeSequenceId;
  const sequence = project.sequences.find((s) => s.id === sequenceId);
  if (!sequence) throw new Error("Screen not found.");
  if (new Set(input.cueIds).size !== input.cueIds.length)
    throw new Error("Select each hotspot only once.");
  const selected = input.cueIds.map((id) => {
    const cue = sequence.cues.find((c) => c.id === id);
    if (!cue || !["hotspot", "branch"].includes(cue.kind))
      throw new Error("Select hotspot or branch cue IDs from this screen.");
    return clone(cue);
  });
  const created: Cue[] = input.create.map((cue) => ({
    ...cue,
    id: id(),
    provenance: { createdBy: "agent", createdAt: now() },
  }));
  const cues = [...selected, ...created];
  if (!cues.length)
    throw new Error("Select hotspots or provide new hotspots to create.");
  const capacity =
    input.layout === "stack-right" ? 6 : input.layout === "bottom-row" ? 3 : 18;
  if (input.layout !== "keep" && cues.length > capacity)
    throw new Error(
      `This layout fits ${capacity} hotspots. Arrange smaller timed groups.`,
    );
  const operations: Operation[] = cues.map((cue, i) => {
    if (input.group !== undefined) cue.group = input.group;
    if (input.style) cue.style = { ...cue.style, ...input.style };
    if (input.layout !== "keep")
      cue.position = hotspotPosition(i, input.layout);
    cue.start += input.shiftSeconds;
    if (cue.end !== undefined) cue.end += input.shiftSeconds;
    return {
      type: i < selected.length ? "update_cue" : "add_cue",
      sequenceId,
      value: cue,
    };
  });
  applyOperations(project, operations);
  return operations;
}
