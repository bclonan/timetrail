import { z } from "zod";
import {
  applyOperations,
  clone,
  cueInputSchema,
  type Media,
  type Operation,
  type Project,
  type Sequence,
} from "../domain/model";
import { presentationSchema } from "../domain/presentation";
import { layoutAreasSchema } from "../domain/layoutAreas";
import { storyboardSchema, TimelineCompiler } from "./TimelineCompiler";

const key = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const productionSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(8000).default(""),
  sequences: z
    .array(
      z.object({
        key,
        storyboard: storyboardSchema,
        cues: z.array(cueInputSchema).max(300).default([]),
        layoutAreas: layoutAreasSchema.optional(),
      }),
    )
    .min(1)
    .max(20),
  presentation: presentationSchema.optional(),
});
export type ProductionSpec = z.input<typeof productionSchema>;

// Named sequences let an agent author a complete branching film in one proposal.
// Both the JSON form and WebMCP use this compiler and the normal review transaction.
export function compileProduction(
  project: Project,
  raw: unknown,
  media: Media[] = project.media,
) {
  const spec = productionSchema.parse(raw);
  if (new Set(spec.sequences.map((s) => s.key)).size !== spec.sequences.length)
    throw new Error("Sequence keys must be unique.");
  const ids = new Map(
    spec.sequences.map((s, i) => [
      s.key,
      i === 0
        ? project.activeSequenceId
        : `film_${project.id.slice(0, 26)}_${s.key}`,
    ]),
  );
  const destination = (key: string) => ids.get(key) || key;
  const operations: Operation[] = [];
  const warnings: string[] = [];
  for (const [index, item] of spec.sequences.entries()) {
    const sequenceId = ids.get(item.key)!;
    const temporary = clone(project);
    temporary.activeSequenceId = sequenceId;
    // Validation of cross-sequence links belongs to the complete transaction below.
    temporary.presentation = undefined;
    if (!temporary.sequences.some((s) => s.id === sequenceId))
      temporary.sequences.push({
        id: sequenceId,
        title: item.storyboard.title,
        durationSeconds: item.storyboard.targetSeconds,
        baseMode: "mixed",
        clips: [],
        cues: [],
      });
    const result = new TimelineCompiler().compile(
      temporary,
      item.storyboard,
      media,
    );
    operations.push(
      ...result.operations.filter((o) => o.type !== "set_project_meta"),
    );
    warnings.push(...result.warnings);
    const sequence = (
      [...operations]
        .reverse()
        .find(
          (o) => o.type === "upsert_sequence" && o.value.id === sequenceId,
        ) as { value: Sequence }
    ).value;
    if (item.layoutAreas) sequence.layoutAreas = item.layoutAreas;
    item.cues.forEach((cue, i) =>
      sequence.cues.push({
        ...cue,
        id: `film_${project.id.slice(0, 26)}_${index}_cue_${i}`,
        ...(cue.branch
          ? {
              branch: {
                ...cue.branch,
                targetSequenceId: destination(cue.branch.targetSequenceId),
              },
            }
          : {}),
        provenance: { createdBy: "agent", createdAt: project.createdAt },
      }),
    );
  }
  if (spec.presentation) {
    const presentation = clone(spec.presentation);
    for (const panel of presentation.panels) {
      if (panel.sequenceId) panel.sequenceId = destination(panel.sequenceId);
      for (const entry of panel.entries)
        if (entry.sequenceId) entry.sequenceId = destination(entry.sequenceId);
    }
    operations.push({ type: "set_presentation", value: presentation });
  }
  operations.push({
    type: "set_project_meta",
    value: {
      title: spec.title,
      description: spec.description,
      topic: spec.sequences[0]!.storyboard.topic,
    },
  });
  const next = applyOperations(project, operations);
  return {
    operations,
    warnings,
    counts: {
      sequences: next.sequences.length,
      clips: next.sequences.reduce((n, s) => n + s.clips.length, 0),
      cues: next.sequences.reduce((n, s) => n + s.cues.length, 0),
      media: next.media.length,
      views: next.presentation?.views.length || 3,
    },
  };
}
