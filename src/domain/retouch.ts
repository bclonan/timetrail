import { z } from "zod";
import { clone, id, type Clip, type Media, type Sequence } from "./model";

const key = z.string().min(1).max(100);
export const regionSchema = z
  .object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    width: z.number().positive().max(100),
    height: z.number().positive().max(100),
  })
  .refine(
    (r) => r.x + r.width <= 100 && r.y + r.height <= 100,
    "Keep the selected area inside the image.",
  );
export type EditRegion = z.infer<typeof regionSchema>;
export const captureSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    mediaId: key,
    sequenceId: key.optional(),
    clipId: key.optional(),
    sourceSeconds: z
      .array(z.number().min(0).max(86400))
      .min(1)
      .max(8)
      .default([0]),
    maxDimension: z.number().int().min(256).max(2048).default(1280),
  })
  .refine(
    (v) => Boolean(v.clipId) === Boolean(v.sequenceId),
    "Supply both sequenceId and clipId, or neither.",
  );
const jobVersion = {
  jobId: key,
  expectedVersion: z.number().int().nonnegative(),
};
export const maskSchema = z.object({
  ...jobVersion,
  frameId: key,
  regions: z.array(regionSchema).max(20),
});
export const requestSchema = z.object({
  ...jobVersion,
  mode: z.enum(["inpaint", "replace-character"]),
  instruction: z.string().trim().min(3).max(4000),
  referenceMediaIds: z.array(key).max(3).default([]),
});
export const resultSchema = z.object({
  ...jobVersion,
  expectedRevision: z.number().int().nonnegative(),
  placement: z.enum(["add-media", "frame-holds", "replace-clip"]),
  results: z
    .array(
      z.object({
        frameId: key,
        mediaId: key,
        holdSeconds: z.number().min(0.1).max(30).default(1),
      }),
    )
    .min(1)
    .max(8),
});
export const readEditSchema = z.object({
  jobId: key,
  assetId: key,
  offset: z.number().int().nonnegative().default(0),
  length: z.number().int().min(1).max(262144).default(262144),
});
export interface EditFrame {
  id: string;
  sourceSeconds: number;
  width: number;
  height: number;
  assetId: string;
  maskAssetId?: string;
  regions: EditRegion[];
}
export interface RetouchJob {
  id: string;
  projectId: string;
  version: number;
  createdAt: string;
  source: Media;
  clip?: { sequenceId: string; value: Clip };
  frames: EditFrame[];
  request?: {
    mode: "inpaint" | "replace-character";
    instruction: string;
    references: { mediaId: string; assetId: string; name: string }[];
    bundleAssetId: string;
    prompt: string;
  };
  proposalId?: string;
}
export function assertEditSource(
  job: RetouchJob,
  media: Media[],
  sequences: Sequence[],
) {
  if (
    JSON.stringify(media.find((m) => m.id === job.source.id)) !==
    JSON.stringify(job.source)
  )
    throw new Error(
      "The source changed since capture. Capture it again before requesting edits.",
    );
  if (
    job.clip &&
    JSON.stringify(
      sequences
        .find((s) => s.id === job.clip!.sequenceId)
        ?.clips.find((c) => c.id === job.clip!.value.id),
    ) !== JSON.stringify(job.clip.value)
  )
    throw new Error(
      "The selected clip changed since capture. Capture its current frames again.",
    );
}
/** Insert still holds without shifting other clips or any timed cues. */
export function frameHolds(
  sequence: Sequence,
  clip: Clip,
  patches: { sourceSeconds: number; duration: number; mediaId: string }[],
  sourceDuration?: number,
) {
  const sorted = [...patches].sort((a, b) => a.sourceSeconds - b.sourceSeconds);
  const pieces: Clip[] = [];
  let cursor = 0;
  const addOriginal = (start: number, end: number) => {
    if (end - start < 0.000001) return;
    const sourceEnd = clip.sourceEnd ?? sourceDuration;
    const sourceStart = Math.min(
      clip.sourceStart + start,
      sourceEnd === undefined
        ? Infinity
        : Math.max(clip.sourceStart, sourceEnd - 0.001),
    );
    pieces.push({
      ...clone(clip),
      id: id(),
      timelineStart: clip.timelineStart + start,
      sourceStart,
      durationSeconds: end - start,
    });
  };
  for (const patch of sorted) {
    const start = patch.sourceSeconds - clip.sourceStart;
    if (
      start < cursor - 0.000001 ||
      start + patch.duration > clip.durationSeconds + 0.000001
    )
      throw new Error(
        "Frame holds overlap or extend beyond the selected clip. Adjust their times or durations.",
      );
    addOriginal(cursor, start);
    pieces.push({
      id: id(),
      mediaId: patch.mediaId,
      timelineStart: clip.timelineStart + start,
      sourceStart: 0,
      durationSeconds: patch.duration,
    });
    cursor = start + patch.duration;
  }
  addOriginal(cursor, clip.durationSeconds);
  if (pieces[0]) pieces[0].id = clip.id;
  const result = clone(sequence);
  result.clips = result.clips.flatMap((c) => (c.id === clip.id ? pieces : [c]));
  return result;
}
