import { z } from "zod";
import { projectSchema } from "../domain/model";
export const parentMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("TIMETRAIL_PING") }),
  z.object({
    type: z.enum(["TIMETRAIL_INIT", "TIMETRAIL_SYNC"]),
    project: projectSchema,
    sequenceId: z.string(),
    revision: z.number().int().nonnegative(),
    startTime: z.number().nonnegative().default(0),
    assetUrls: z.record(z.string(), z.string()).default({}),
  }),
  z.object({
    type: z.literal("TIMETRAIL_PLAYBACK"),
    action: z.enum(["play", "pause", "seek"]),
    timeSeconds: z.number().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("TIMETRAIL_SELECT"),
    cueId: z.string().optional(),
    sequenceId: z.string().optional(),
  }),
  z.object({ type: z.literal("TIMETRAIL_DESTROY") }),
]);
export const runtimeMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TIMETRAIL_READY"),
    revision: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("TIMETRAIL_PLAYHEAD"),
    currentTime: z.number().nonnegative(),
    duration: z.number().positive(),
    paused: z.boolean(),
    sequenceId: z.string(),
  }),
  z.object({
    type: z.literal("TIMETRAIL_RUNTIME_ERROR"),
    message: z.string().max(2000),
  }),
  z.object({
    type: z.literal("TIMETRAIL_LINK_ACTIVATED"),
    sequenceId: z.string(),
    timeSeconds: z.number().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("TIMETRAIL_SELECTION_CHANGED"),
    cueId: z.string().optional(),
  }),
  z.object({
    type: z.literal("TIMETRAIL_QUIZ_ANSWERED"),
    cueId: z.string(),
    answerIndex: z.number().int().nonnegative(),
  }),
]);
export type ParentMessage = z.input<typeof parentMessage>;
export type RuntimeMessage = z.infer<typeof runtimeMessage>;
export function validBridgeEvent(
  event: MessageEvent,
  source: Window | null,
  origin: string,
) {
  return event.origin === origin && event.source === source;
}
