import { z } from "zod";
import { ulid } from "ulid";
import { presentationSchema } from "./presentation";
import { hotspotStyleSchema } from "./hotspots";
import { layoutAreasSchema } from "./layoutAreas";

export const id = () => ulid();
export const now = () => new Date().toISOString();
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const text = z.string().max(8000);
const key = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export function safeUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP or HTTPS URL without credentials.");
  return url.href;
}
export const urlSchema = z
  .string()
  .max(3000)
  .refine((v) => {
    try {
      safeUrl(v);
      return true;
    } catch {
      return false;
    }
  }, "Unsafe URL. Use HTTP or HTTPS.");
export const kinds = [
  "chapter",
  "note",
  "fact",
  "definition",
  "source",
  "warning",
  "quiz",
  "hotspot",
  "branch",
  "image",
  "caption",
  "narration",
] as const;
export const quizSchema = z
  .object({
    question: text,
    options: z.array(z.string().max(500)).min(2).max(8),
    answerIndex: z.number().int().min(0),
    explanation: text.optional(),
    retryTime: z.number().min(0).max(86400).optional(),
  })
  .refine(
    (q) => q.answerIndex < q.options.length,
    "Answer index is outside the options.",
  );
export const cardSchema = z.object({
  layout: z.enum([
    "title",
    "concept",
    "image-focus",
    "comparison",
    "quote",
    "recap",
    "quiz-intro",
  ]),
  heading: text,
  body: text,
  image: urlSchema.optional(),
  illustration: z
    .enum(["dna", "rna", "protein", "mutation", "none"])
    .optional(),
  source: text.optional(),
  background: z.enum(["forest", "ink", "sand"]).default("forest"),
  narration: text.optional(),
});
export const mediaSchema = z.object({
  id: key,
  name: z.string().max(300),
  type: z.enum([
    "video",
    "youtube",
    "vimeo",
    "image",
    "audio",
    "pdf",
    "webpage",
    "text",
    "html",
    "subtitle",
    "generated-card",
  ]),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("remote"), url: urlSchema }),
    z.object({ kind: z.literal("asset"), assetId: key }),
    z.object({ kind: z.literal("generated"), document: cardSchema }),
  ]),
  thumbnail: urlSchema.optional(),
  durationSeconds: z.number().positive().max(86400).optional(),
  mimeType: z.string().max(100).optional(),
  sizeBytes: z.number().nonnegative().optional(),
  tags: z.array(z.string().max(60)).max(30),
  attribution: z
    .object({
      title: text.optional(),
      creator: text.optional(),
      sourceUrl: urlSchema.optional(),
      license: z.string().max(300).optional(),
    })
    .optional(),
  importedAt: z.iso.datetime(),
  importedBy: z.enum(["human", "agent", "demo"]),
  visualEdit: z
    .object({
      sourceMediaId: key,
      sourceSeconds: z.number().nonnegative(),
      mode: z.enum(["inpaint", "replace-character"]),
      instruction: z.string().max(4000),
      createdAt: z.iso.datetime(),
    })
    .optional(),
});
export const cueInputSchema = z.object({
  kind: z.enum(kinds),
  start: z.number().min(0).max(86400),
  end: z.number().min(0).max(86400).optional(),
  title: z.string().max(300).optional(),
  body: text.optional(),
  resourceId: key.optional(),
  url: urlSchema.optional(),
  group: z.string().max(80).optional(),
  position: z
    .object({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
      width: z.number().positive().max(100),
      height: z.number().positive().max(100),
    })
    .optional(),
  style: hotspotStyleSchema
    .catchall(z.union([z.string().max(300), z.number(), z.boolean()]))
    .optional(),
  quiz: quizSchema.optional(),
  branch: z
    .object({
      label: z.string().max(300),
      targetSequenceId: key,
      targetTime: z.number().nonnegative().optional(),
      requiresFlag: key.optional(),
      setsFlag: key.optional(),
    })
    .optional(),
});
export const cueSchema = cueInputSchema.extend({
  id: key,
  provenance: z.object({
    createdBy: z.enum(["human", "agent", "import"]),
    sourceUrl: urlSchema.optional(),
    proposalId: key.optional(),
    createdAt: z.iso.datetime(),
  }),
});
export const clipSchema = z.object({
  id: key,
  mediaId: key,
  timelineStart: z.number().nonnegative(),
  sourceStart: z.number().nonnegative(),
  sourceEnd: z.number().nonnegative().optional(),
  durationSeconds: z.number().positive(),
  timingEstimated: z.boolean().optional(),
});
export const sequenceSchema = z.object({
  id: key,
  title: z.string().min(1).max(300),
  description: text.optional(),
  durationSeconds: z.number().positive().max(86400),
  baseMode: z.enum(["video", "generated-canvas", "mixed"]),
  clips: z.array(clipSchema).max(300),
  cues: z.array(cueSchema).max(1000),
  narrationEnabled: z.boolean().optional(),
  layoutAreas: layoutAreasSchema.optional(),
});
export const projectShape = z.object({
  schemaVersion: z.literal("1.0"),
  id: key,
  title: z.string().min(1).max(300),
  slug: z
    .string()
    .max(300)
    .regex(/^[a-z0-9-]*$/),
  description: text,
  topic: text,
  audience: z.string().max(300).optional(),
  tags: z.array(z.string().max(60)).max(30),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  activeSequenceId: key,
  sequences: z.array(sequenceSchema).min(1).max(50),
  media: z.array(mediaSchema).max(500),
  presentation: presentationSchema.optional(),
  settings: z.object({
    captions: z.boolean(),
    narration: z.boolean(),
    targetSeconds: z.number().positive().max(86400),
  }),
  provenance: z.object({
    creator: z.string().max(300),
    license: z.string().max(300),
    remixedFrom: key.optional(),
    sourceUrl: urlSchema.optional(),
  }),
});
export const projectSchema = projectShape.superRefine((p, ctx) => {
  const err = (message: string) => ctx.addIssue({ code: "custom", message });
  const ids = new Set<string>();
  const unique = (v: string) => {
    if (ids.has(v)) err(`Duplicate ID: ${v}`);
    ids.add(v);
  };
  unique(p.id);
  p.media.forEach((m) => unique(m.id));
  const media = new Map(p.media.map((m) => [m.id, m]));
  const sequences = new Map(p.sequences.map((s) => [s.id, s]));
  if (!sequences.has(p.activeSequenceId)) err("Active sequence is missing.");
  for (const panel of p.presentation?.panels || []) {
    const sequence = sequences.get(panel.sequenceId || p.activeSequenceId);
    if (!sequence) err("Panel sequence is missing.");
    if (sequence && (panel.start ?? 0) > sequence.durationSeconds)
      err("Panel start exceeds sequence duration.");
    if (sequence && (panel.end ?? 0) > sequence.durationSeconds)
      err("Panel end exceeds sequence duration.");
    for (const entry of panel.entries) {
      const target = sequences.get(
        entry.sequenceId || panel.sequenceId || p.activeSequenceId,
      );
      if (!target || (entry.timeSeconds ?? 0) > target.durationSeconds)
        err("Panel entry destination is invalid.");
    }
  }
  p.sequences.forEach((s) => {
    unique(s.id);
    let until = 0;
    for (const c of [...s.clips].sort(
      (a, b) => a.timelineStart - b.timelineStart,
    )) {
      unique(c.id);
      if (!media.has(c.mediaId)) err(`Missing clip media: ${c.mediaId}`);
      if (
        c.timelineStart < until - 0.001 ||
        c.timelineStart + c.durationSeconds > s.durationSeconds + 0.001
      )
        err("Clips overlap or exceed sequence duration.");
      if (c.sourceEnd !== undefined && c.sourceEnd <= c.sourceStart)
        err("Source end must follow source start.");
      until = c.timelineStart + c.durationSeconds;
    }
    s.cues.forEach((c) => {
      unique(c.id);
      if (
        c.start > s.durationSeconds ||
        (c.end !== undefined && (c.end < c.start || c.end > s.durationSeconds))
      )
        err(`Invalid cue timing: ${c.title || c.id}`);
      if (c.resourceId && !media.has(c.resourceId))
        err("Cue resource is missing.");
      if (c.kind === "quiz" && !c.quiz)
        err("A quiz needs a question and answers.");
      if ((c.quiz?.retryTime ?? 0) > s.durationSeconds)
        err("Quiz retry time exceeds sequence duration.");
      if (c.kind === "branch" && !c.branch)
        err("A branch needs a destination.");
      if (
        c.position &&
        (c.position.x + c.position.width > 100 ||
          c.position.y + c.position.height > 100)
      )
        err("Position extends beyond the player.");
      if (
        c.branch &&
        (!sequences.has(c.branch.targetSequenceId) ||
          (c.branch.targetTime || 0) >
            (sequences.get(c.branch.targetSequenceId)?.durationSeconds || 0))
      )
        err("Branch destination is invalid.");
    });
  });
});
export type Project = z.infer<typeof projectShape>;
export type Sequence = z.infer<typeof sequenceSchema>;
export type Media = z.infer<typeof mediaSchema>;
export type Cue = z.infer<typeof cueSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type GeneratedCard = z.infer<typeof cardSchema>;
export type Operation =
  | { type: "set_presentation"; value: z.infer<typeof presentationSchema> }
  | {
      type: "set_project_meta";
      value: Partial<
        Pick<Project, "title" | "description" | "topic" | "audience" | "tags">
      >;
    }
  | { type: "upsert_media"; value: Media }
  | { type: "remove_media"; id: string }
  | { type: "upsert_sequence"; value: Sequence }
  | { type: "remove_sequence"; id: string }
  | { type: "add_clip" | "update_clip"; sequenceId: string; value: Clip }
  | { type: "remove_clip"; sequenceId: string; id: string }
  | { type: "add_cue" | "update_cue"; sequenceId: string; value: Cue }
  | { type: "remove_cue"; sequenceId: string; id: string };
export type Counts = {
  mediaAdded: number;
  sequencesAdded: number;
  clipsAdded: number;
  cuesAdded: number;
  itemsUpdated: number;
  itemsRemoved: number;
  chapters: number;
  notes: number;
  sources: number;
  quizzes: number;
  branches: number;
};
export type Proposal = {
  id: string;
  projectId: string;
  status: "pending" | "accepted" | "rejected";
  title: string;
  rationale?: string;
  createdAt: string;
  createdBy: "agent" | "human";
  correlationId?: string;
  baseRevision: number;
  operations: Operation[];
  summary: Counts;
  warnings: string[];
  reviewedOperations: Record<string, "accepted" | "rejected">;
};
export type ProjectRecord = {
  project: Project;
  revision: number;
  past: Project[];
  future: Project[];
  applied: string[];
};
export type AuditEvent = {
  id: string;
  projectId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  startedAt: string;
  completedAt: string;
  duration: number;
  status: string;
  message: string;
  correlationId?: string;
  proposalIds?: string[];
  revision?: number;
  approval?: string;
};
export const createSchema = z.object({
  title: z.string().min(1).max(300),
  topic: z.string().max(8000),
  audience: z.string().max(300).optional(),
  targetSeconds: z.number().min(10).max(3600).default(90),
  mode: z
    .enum(["generated-canvas", "video", "mixed"])
    .default("generated-canvas"),
});
export function createProject(input: unknown): Project {
  const p = createSchema.parse(input);
  const stamp = now();
  const seq = id();
  return projectSchema.parse({
    schemaVersion: "1.0",
    id: id(),
    title: p.title,
    slug: p.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    description: "",
    topic: p.topic,
    audience: p.audience,
    tags: [],
    createdAt: stamp,
    updatedAt: stamp,
    activeSequenceId: seq,
    sequences: [
      {
        id: seq,
        title: "Main sequence",
        durationSeconds: p.targetSeconds,
        baseMode: p.mode,
        clips: [],
        cues: [],
      },
    ],
    media: [],
    settings: {
      captions: true,
      narration: false,
      targetSeconds: p.targetSeconds,
    },
    provenance: { creator: "You", license: "MIT" },
  });
}
export function applyOperations(
  project: Project,
  operations: Operation[],
): Project {
  const draft = clone(project);
  function upsert<T extends { id: string }>(items: T[], value: T) {
    const i = items.findIndex((v) => v.id === value.id);
    if (i < 0) items.push(value);
    else items[i] = value;
  }
  for (const raw of operations) {
    const op = clone(raw);
    if (op.type === "set_project_meta")
      Object.assign(
        draft,
        projectShape
          .pick({
            title: true,
            description: true,
            topic: true,
            audience: true,
            tags: true,
          })
          .partial()
          .parse(op.value),
      );
    else if (op.type === "set_presentation")
      draft.presentation = presentationSchema.parse(op.value);
    else if (op.type === "upsert_media")
      upsert(draft.media, mediaSchema.parse(op.value));
    else if (op.type === "remove_media")
      draft.media = draft.media.filter((m) => m.id !== op.id);
    else if (op.type === "upsert_sequence")
      upsert(draft.sequences, sequenceSchema.parse(op.value));
    else if (op.type === "remove_sequence")
      draft.sequences = draft.sequences.filter((s) => s.id !== op.id);
    else {
      const seq = draft.sequences.find((s) => s.id === op.sequenceId);
      if (!seq) throw new Error("Sequence not found.");
      if (op.type === "add_clip" || op.type === "update_clip")
        upsert(seq.clips, clipSchema.parse(op.value));
      if (op.type === "add_cue" || op.type === "update_cue")
        upsert(seq.cues, cueSchema.parse(op.value));
      if (op.type === "remove_clip")
        seq.clips = seq.clips.filter((c) => c.id !== op.id);
      if (op.type === "remove_cue")
        seq.cues = seq.cues.filter((c) => c.id !== op.id);
    }
  }
  return projectSchema.parse(draft);
}
export function summarize(ops: Operation[]): Counts {
  const c: Counts = {
    mediaAdded: 0,
    sequencesAdded: 0,
    clipsAdded: 0,
    cuesAdded: 0,
    itemsUpdated: 0,
    itemsRemoved: 0,
    chapters: 0,
    notes: 0,
    sources: 0,
    quizzes: 0,
    branches: 0,
  };
  const cue = (v: Cue) => {
    c.cuesAdded++;
    if (v.kind === "chapter") c.chapters++;
    if (["note", "fact", "definition", "warning"].includes(v.kind)) c.notes++;
    if (v.kind === "source") c.sources++;
    if (v.kind === "quiz") c.quizzes++;
    if (v.kind === "branch") c.branches++;
  };
  ops.forEach((op) => {
    if (op.type === "upsert_media") c.mediaAdded++;
    else if (op.type === "upsert_sequence") {
      c.sequencesAdded++;
      c.clipsAdded += op.value.clips.length;
      op.value.cues.forEach(cue);
    } else if (op.type === "add_clip") c.clipsAdded++;
    else if (op.type === "add_cue") cue(op.value);
    else if (op.type.startsWith("remove")) c.itemsRemoved++;
    else c.itemsUpdated++;
  });
  return c;
}
