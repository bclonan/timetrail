import { z } from "zod";
import {
  applyOperations,
  clone,
  quizSchema,
  cardSchema,
  urlSchema,
  type Project,
  type Operation,
  type Sequence,
  type Cue,
  type Media,
} from "../domain/model";
export const storyboardSchema = z.object({
  title: z.string().min(1).max(300),
  topic: z.string().max(8000),
  audience: z.string().max(300).optional(),
  targetSeconds: z.number().min(10).max(3600),
  style: z
    .enum(["lesson", "documentary", "timeline", "guided-tour", "story"])
    .optional(),
  baseMediaId: z.string().optional(),
  segments: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        summary: z.string().max(4000).optional(),
        narration: z.string().max(4000).optional(),
        durationWeight: z.number().positive().max(100).default(1),
        mediaId: z.string().optional(),
        mediaUrl: urlSchema.optional(),
        card: cardSchema.optional(),
        sourceStart: z.number().min(0).max(86400).default(0),
        cards: z
          .array(
            z.object({
              kind: z.enum(["note", "fact", "definition", "source", "warning"]),
              title: z.string().max(300).optional(),
              body: z.string().max(4000),
              url: urlSchema.optional(),
            }),
          )
          .max(20)
          .optional(),
        quiz: quizSchema.optional(),
        branch: z
          .object({
            label: z.string().max(300),
            targetTitle: z.string().max(300),
            targetSummary: z.string().max(4000).optional(),
          })
          .optional(),
      }),
    )
    .min(1)
    .max(40),
});
export type Storyboard = z.input<typeof storyboardSchema>;
export function allocateDurations(target: number, weights: number[]): number[] {
  if (
    !Number.isFinite(target) ||
    target <= 0 ||
    !weights.length ||
    weights.some((w) => !Number.isFinite(w) || w <= 0)
  )
    throw new Error("Duration and weights must be positive.");
  const sum = weights.reduce((a, b) => a + b, 0);
  let used = 0;
  return weights.map((w, i) => {
    const d =
      i === weights.length - 1
        ? target - used
        : Math.round(((target * w) / sum) * 1000) / 1000;
    used += d;
    return d;
  });
}
export const clampTime = (n: number, duration: number) =>
  Math.min(duration, Math.max(0, n));
function hash(text: string): string {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}
export class TimelineCompiler {
  compile(project: Project, raw: unknown, available: Media[] = project.media) {
    const plan = storyboardSchema.parse(raw);
    const prefix = `build_${hash(project.activeSequenceId + JSON.stringify(plan))}`;
    const stamp = project.createdAt;
    const seq: Sequence = {
      id: project.activeSequenceId,
      title: plan.title,
      description: plan.topic,
      durationSeconds: plan.targetSeconds,
      baseMode: "generated-canvas",
      clips: [],
      cues: [],
      layoutAreas: clone(
        project.sequences.find((s) => s.id === project.activeSequenceId)
          ?.layoutAreas || [],
      ),
    };
    const media: Media[] = [];
    const branches: Sequence[] = [];
    const warnings: string[] = [];
    const durations = allocateDurations(
      plan.targetSeconds,
      plan.segments.map((s) => s.durationWeight),
    );
    let start = 0;
    plan.segments.forEach((s, i) => {
      const duration = durations[i]!;
      const end = clampTime(start + duration, plan.targetSeconds);
      const sid = `${prefix}_${i}`;
      let m = available.find(
        (m) =>
          m.id === (s.mediaId || plan.baseMediaId) ||
          Boolean(
            s.mediaUrl &&
            m.source.kind === "remote" &&
            m.source.url === s.mediaUrl,
          ),
      );
      if (s.mediaId && !m)
        throw new Error(`Media ${s.mediaId} is missing. Import it first.`);
      if (s.mediaUrl && !m)
        throw new Error("Import the segment URL before compiling.");
      if (!m)
        m = {
          id: `${sid}_media`,
          name: s.title,
          type: "generated-card",
          source: {
            kind: "generated",
            document: s.card || {
              layout:
                i === 0
                  ? "title"
                  : s.quiz
                    ? "quiz-intro"
                    : i === plan.segments.length - 1
                      ? "recap"
                      : "concept",
              heading: s.title,
              body: s.summary || "",
              background: "forest",
              illustration: /mutat/i.test(s.title)
                ? "mutation"
                : /RNA|transcrip/i.test(s.title)
                  ? "rna"
                  : /protein|translat|ribosome/i.test(s.title)
                    ? "protein"
                    : /dna|gene|chromosom/i.test(s.title)
                      ? "dna"
                      : "none",
              narration: s.narration,
            },
          },
          tags: [],
          importedAt: stamp,
          importedBy: "agent",
        };
      media.push(clone(m));
      const estimated =
        ["video", "youtube", "vimeo", "audio"].includes(m.type) &&
        !m.durationSeconds;
      if (estimated)
        warnings.push(
          `${s.title}: media duration is estimated. Review the trim.`,
        );
      if (m.durationSeconds && duration > m.durationSeconds)
        warnings.push(
          `${s.title}: segment exceeds source length; the player holds the last frame.`,
        );
      seq.clips.push({
        id: `${sid}_clip`,
        mediaId: m.id,
        timelineStart: start,
        sourceStart: s.sourceStart,
        sourceEnd: m.durationSeconds
          ? Math.min(s.sourceStart + duration, m.durationSeconds)
          : s.sourceStart + duration,
        durationSeconds: duration,
        timingEstimated: estimated,
      });
      const add = (kind: Cue["kind"], suffix: string, value: Partial<Cue>) =>
        seq.cues.push({
          id: `${sid}_${suffix}`,
          kind,
          start,
          end,
          ...value,
          provenance: { createdBy: "agent", createdAt: stamp },
        });
      add("chapter", "chapter", { title: s.title, body: s.summary });
      s.cards?.forEach((card, j) =>
        add(card.kind, `card_${j}`, {
          ...card,
          start: clampTime(start + Math.min(1, duration / 10), end),
        }),
      );
      if (s.narration) {
        add("caption", "caption", { body: s.narration });
        add("narration", "narration", { body: s.narration });
      }
      if (s.quiz)
        add("quiz", "quiz", {
          title: "Check your understanding",
          start: clampTime(end - Math.min(8, duration / 2), end),
          quiz: s.quiz,
        });
      if (s.branch) {
        const bid = `${sid}_branch`;
        const bm: Media = {
          id: `${bid}_media`,
          name: s.branch.targetTitle,
          type: "generated-card",
          source: {
            kind: "generated",
            document: {
              layout: "concept",
              heading: s.branch.targetTitle,
              body: s.branch.targetSummary || "",
              background: "ink",
              illustration: "none",
            },
          },
          tags: [],
          importedAt: stamp,
          importedBy: "agent",
        };
        media.push(bm);
        branches.push({
          id: bid,
          title: s.branch.targetTitle,
          durationSeconds: 20,
          baseMode: "generated-canvas",
          clips: [
            {
              id: `${bid}_clip`,
              mediaId: bm.id,
              timelineStart: 0,
              sourceStart: 0,
              durationSeconds: 20,
            },
          ],
          cues: [
            {
              id: `${bid}_note`,
              kind: "note",
              start: 0,
              end: 20,
              title: s.branch.targetTitle,
              body: s.branch.targetSummary,
              provenance: { createdBy: "agent", createdAt: stamp },
            },
          ],
        });
        add("branch", "choice", {
          title: s.branch.label,
          branch: {
            label: s.branch.label,
            targetSequenceId: bid,
            targetTime: 0,
          },
        });
      }
      start = end;
    });
    if (media.some((m) => ["video", "youtube", "vimeo"].includes(m.type)))
      seq.baseMode = "mixed";
    // Keep existing human context when replacing the main storyboard, clamped to its new length.
    project.sequences
      .find((s) => s.id === seq.id)
      ?.cues.filter((c) => c.provenance.createdBy === "human")
      .forEach((c) =>
        seq.cues.push({
          ...clone(c),
          start: clampTime(c.start, seq.durationSeconds),
          end:
            c.end === undefined
              ? undefined
              : clampTime(c.end, seq.durationSeconds),
        }),
      );
    const operations: Operation[] = [
      ...Array.from(new Map(media.map((m) => [m.id, m])).values()).map(
        (value) => ({ type: "upsert_media" as const, value }),
      ),
      ...branches.map((value) => ({ type: "upsert_sequence" as const, value })),
      { type: "upsert_sequence", value: seq },
      {
        type: "set_project_meta",
        value: {
          title: plan.title,
          topic: plan.topic,
          audience: plan.audience,
        },
      },
    ];
    applyOperations(project, operations);
    return { operations, warnings };
  }
}
