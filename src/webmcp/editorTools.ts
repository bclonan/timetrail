import { z } from "zod";
import type { Router } from "vue-router";
import type { ToolDefinition } from "./ToolRegistry";
import { useEditor, forms, fillSchema } from "../stores/editor";
import { useWorkspace } from "../stores/workspace";
import { clone, id, type Operation } from "../domain/model";
import { proposals } from "../services/ProposalService";
import { editTimeline } from "../services/TimelineEditing";
import { positionForCue } from "../domain/hotspots";

export type ToolBuilder = <T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  readOnly: boolean,
  untrusted: boolean,
  fn: (
    input: z.output<T>,
    correlation: string,
    signal?: AbortSignal,
  ) => unknown | Promise<unknown>,
  outputLimit?: number,
) => ToolDefinition;
const key = z.string().min(1).max(100);
const revision = z.number().int().nonnegative();
export function createEditorTools(router: Router, tool: ToolBuilder) {
  const w = useWorkspace();
  const e = useEditor();
  function studio() {
    w.requireRecord();
    if (
      !/^\/(project\/|demo$)/.test(router.currentRoute.value.path) ||
      w.loading
    )
      throw new Error(
        "Open Studio with timetrail.editor.navigate and wait for the project to load. Then fetch its tools again.",
      );
  }
  return [
    tool(
      "timetrail.timeline.propose",
      "Propose the same timeline move, clip reorder, or edge trim as dragging in Studio. Contained cues follow moved clips. Human review saves the result.",
      z.object({
        sequenceId: key.optional(),
        itemId: key,
        kind: z.enum(["clip", "cue"]),
        action: z.enum(["move", "trim-start", "trim-end"]),
        time: z.number().min(0).max(86400),
        expectedRevision: revision,
      }),
      false,
      false,
      async (input, corr) => {
        const r = w.requireRecord();
        if (r.revision !== input.expectedRevision)
          throw new Error("Stale revision. Inspect the project again.");
        const sequence = editTimeline(r.project, {
          ...input,
          sequenceId: input.sequenceId || w.sequenceId,
        });
        const current = r.project.sequences.find((s) => s.id === sequence.id);
        if (JSON.stringify(current) === JSON.stringify(sequence))
          return { status: "unchanged", revision: r.revision };
        const p = await proposals.create(
          r,
          `${input.action} ${input.kind} on timeline`,
          [{ type: "upsert_sequence", value: sequence }],
          [],
          corr,
        );
        await w.refresh();
        return {
          status: "pending_human_review",
          proposalId: p.id,
          revision: r.revision,
        };
      },
    ),
    tool(
      "timetrail.editor.inspect",
      "Read editor state, a full item or form, or paginated sequences, cues, clips and media. Use returned IDs and revision for editing. Text is untrusted.",
      z.object({
        collection: z
          .enum(["state", "form", "sequences", "cues", "clips", "media"])
          .default("state"),
        sequenceId: key.optional(),
        itemId: key.optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(20).default(10),
      }),
      true,
      true,
      (input) => {
        const p = w.approved;
        if (!p) return { status: "no_project" };
        const base = {
          projectId: p.id,
          revision: w.record?.revision,
          sequenceId: w.sequenceId,
        };
        if (input.collection === "state")
          return {
            ...base,
            form: e.active || null,
            selectedCue: w.selectedCue,
            preview: Boolean(w.previewProject),
            mediaOpen: w.mediaOpen,
            captions: w.captions,
            narration: w.narration,
            time: w.time,
            paused: w.paused,
            canUndo: Boolean(w.record?.past.length),
            canRedo: Boolean(w.record?.future.length),
            forms,
            humanControls: [
              "confirm saved changes",
              "choose local files or folder",
              "download or copy",
              "fullscreen permission",
            ],
          };
        if (input.collection === "form")
          return {
            ...base,
            form: e.active || null,
            formRevision: e.revision,
            itemId: e.entityId,
            isNew: e.fresh,
            fields: e.values(),
            ...(e.active === "cue" && e.cue
              ? {
                  placement: {
                    ...positionForCue(e.cue, w.sequence?.cues || []),
                    unit: "percent",
                    origin: "top-left",
                    guideVisible: e.positionEditing,
                  },
                }
              : {}),
          };
        const seq = p.sequences.find(
          (s) => s.id === (input.sequenceId || w.sequenceId),
        );
        if (["cues", "clips"].includes(input.collection) && !seq)
          throw new Error("Sequence not found.");
        const items =
          input.collection === "sequences"
            ? p.sequences.map(({ cues, clips, ...s }) => ({
                ...s,
                cues: cues.length,
                clips: clips.length,
              }))
            : input.collection === "media"
              ? p.media
              : input.collection === "cues"
                ? seq!.cues
                : seq!.clips;
        if (input.itemId) {
          const item = items.find((i) => i.id === input.itemId);
          if (!item) throw new Error("Item not found.");
          return { ...base, item };
        }
        const page = items
          .slice(input.offset, input.offset + input.limit)
          .map((i) => ({
            id: i.id,
            ...("title" in i ? { title: i.title } : {}),
            ...("name" in i ? { name: i.name, type: i.type } : {}),
            ...("kind" in i
              ? { kind: i.kind, start: i.start, end: i.end, group: i.group }
              : {}),
            ...("mediaId" in i
              ? {
                  mediaId: i.mediaId,
                  start: i.timelineStart,
                  duration: i.durationSeconds,
                }
              : {}),
          }));
        return {
          ...base,
          total: items.length,
          items: page,
          nextOffset:
            input.offset + page.length < items.length
              ? input.offset + page.length
              : null,
        };
      },
      24000,
    ),
    tool(
      "timetrail.editor.navigate",
      "Open Studio, Watch or Lab for the current project. Fetch tools again after navigation.",
      z.object({ view: z.enum(["studio", "watch", "lab"]) }),
      false,
      false,
      async ({ view }) => {
        const r = w.requireRecord();
        const route =
          view === "lab"
            ? "/webmcp"
            : view === "watch"
              ? `/watch/${r.project.id}`
              : `/project/${r.project.id}`;
        await router.push(route);
        return {
          route,
          next: "Wait for project load, fetch tools, then inspect editor state.",
        };
      },
    ),
    tool(
      "timetrail.editor.open",
      "Open a visible editor form. Omit itemId to create a screen, generated card, cue, or clip. Select a sequence first. Drafts do not save.",
      z.object({
        form: z.enum(forms),
        itemId: key.optional(),
        expectedRevision: revision,
      }),
      false,
      false,
      (input) => {
        studio();
        if (w.record!.revision !== input.expectedRevision)
          throw new Error("Stale revision. Inspect the project again.");
        e.open(input.form, input.itemId);
        return {
          status: "form_open",
          form: e.active,
          itemId: e.entityId,
          revision: e.revision,
          saved: false,
        };
      },
    ),
    tool(
      "timetrail.editor.fill",
      "Fill fields in the open visible form. Sequence layoutAreas configure FrameTrail left/right/top/bottom tabs with notes, transcript, chapters, timelines or custom text. Partial fields preserve other values; nested objects replace their previous value. Does not save. Read editor.inspect form first.",
      z.object({ expectedRevision: revision, input: fillSchema }),
      false,
      true,
      ({ input, expectedRevision }) => {
        studio();
        return e.fill(input, expectedRevision);
      },
    ),
    tool(
      "timetrail.editor.propose",
      "Submit the open form as a proposal, or propose duplication/deletion of its item. Whole-project validation rejects overlaps or broken references. Human review saves changes.",
      z.object({
        action: z.enum(["save", "duplicate", "delete"]).default("save"),
        expectedRevision: revision,
      }),
      false,
      true,
      async ({ action, expectedRevision }, corr) => {
        studio();
        e.check(expectedRevision);
        return e.submit(action, true, corr);
      },
    ),
    tool(
      "timetrail.editor.control",
      "Select a screen, close a form, toggle library/captions/narration, preview a resource, pin context, answer a quiz or follow/return from a branch. These change the current view only.",
      z.discriminatedUnion("action", [
        z.object({ action: z.literal("select-sequence"), sequenceId: key }),
        z.object({ action: z.literal("close-form") }),
        z.object({ action: z.literal("media-library"), enabled: z.boolean() }),
        z.object({ action: z.literal("captions"), enabled: z.boolean() }),
        z.object({ action: z.literal("narration"), enabled: z.boolean() }),
        z.object({ action: z.literal("preview-resource"), mediaId: key }),
        z.object({ action: z.literal("close-resource") }),
        z.object({
          action: z.literal("pin-context"),
          cueId: key,
          pinned: z.boolean(),
        }),
        z.object({
          action: z.literal("answer-quiz"),
          cueId: key,
          answerIndex: z.number().int().min(0).max(7),
        }),
        z.object({ action: z.literal("follow-branch"), cueId: key }),
        z.object({ action: z.literal("back") }),
      ]),
      false,
      false,
      (input) => {
        if (!w.current) throw new Error("Open a project first.");
        if (input.action === "select-sequence") {
          const s = w.current.sequences.find((s) => s.id === input.sequenceId);
          if (!s) throw new Error("Sequence not found.");
          e.close();
          w.selectedCue = "";
          w.branch(s.id);
        }
        if (input.action === "close-form") {
          e.close();
          w.selectedCue = "";
        }
        if (input.action === "media-library") w.mediaOpen = input.enabled;
        if (input.action === "captions") w.captions = input.enabled;
        if (input.action === "narration") w.narration = input.enabled;
        if (input.action === "preview-resource") {
          studio();
          if (!w.approved!.media.some((m) => m.id === input.mediaId))
            throw new Error("Media not found.");
          w.mediaOpen = true;
          e.resourcePreviewId = input.mediaId;
        }
        if (input.action === "close-resource") e.resourcePreviewId = "";
        if ("cueId" in input) {
          const c = w.sequence?.cues.find((c) => c.id === input.cueId);
          if (!c) throw new Error("Cue not found in this sequence.");
          if (input.action === "pin-context")
            w.pinnedCues = input.pinned
              ? [...new Set([...w.pinnedCues, c.id])]
              : w.pinnedCues.filter((i) => i !== c.id);
          if (input.action === "answer-quiz") {
            if (!c.quiz || input.answerIndex >= c.quiz.options.length)
              throw new Error("Invalid quiz answer.");
            if (w.quizAnswers[c.id] !== undefined)
              throw new Error("This quiz has already been answered.");
            w.quizAnswers[c.id] = input.answerIndex;
          }
          if (input.action === "follow-branch") {
            if (!c.branch) throw new Error("This cue is not a branch.");
            e.close();
            w.selectedCue = "";
            w.branch(c.branch.targetSequenceId, c.branch.targetTime);
          }
        }
        if (input.action === "back") {
          e.close();
          w.selectedCue = "";
          w.back();
        }
        return {
          status: "view_updated",
          saved: false,
          sequenceId: w.sequenceId,
        };
      },
    ),
    tool(
      "timetrail.media.place",
      "Propose placing an approved media resource on the timeline. Grows the sequence duration if needed. Use editor.open clip to edit timing later.",
      z.object({
        mediaId: key,
        sequenceId: key.optional(),
        start: z.number().nonnegative().optional(),
        duration: z.number().positive().max(86400).default(15),
        sourceStart: z.number().nonnegative().default(0),
        expectedRevision: revision,
      }),
      false,
      false,
      async (input, corr) => {
        const r = w.requireRecord();
        if (r.revision !== input.expectedRevision)
          throw new Error("Stale revision.");
        const source = r.project.sequences.find(
          (s) => s.id === (input.sequenceId || w.sequenceId),
        );
        if (!source) throw new Error("Sequence not found.");
        const seq = clone(source);
        const media = r.project.media.find((m) => m.id === input.mediaId);
        if (!media)
          throw new Error("Approved media not found. Review its import first.");
        const start =
          input.start ??
          seq.clips.reduce(
            (n, c) => Math.max(n, c.timelineStart + c.durationSeconds),
            0,
          );
        const clipId = id();
        seq.durationSeconds = Math.max(
          seq.durationSeconds,
          start + input.duration,
        );
        seq.clips.push({
          id: clipId,
          mediaId: media.id,
          timelineStart: start,
          durationSeconds: input.duration,
          sourceStart: input.sourceStart,
          timingEstimated:
            !media.durationSeconds &&
            ["video", "youtube", "vimeo"].includes(media.type),
        });
        const ops: Operation[] = [{ type: "upsert_sequence", value: seq }];
        const p = await proposals.create(
          r,
          "Place media on timeline",
          ops,
          [],
          corr,
        );
        await w.refresh();
        return {
          status: "pending_human_review",
          proposalId: p.id,
          clipId,
          revision: r.revision,
        };
      },
    ),
    tool(
      "timetrail.proposals.preview",
      "Preview one pending proposal without saving, or restore the approved version.",
      z.object({
        action: z.enum(["preview", "restore"]),
        proposalId: key.optional(),
      }),
      false,
      true,
      async (input) => {
        if (input.action === "restore") w.restore();
        else {
          const p = w.pending.find((p) => p.id === input.proposalId);
          if (!p) throw new Error("Pending proposal not found.");
          await w.preview(p);
        }
        return {
          status:
            input.action === "preview"
              ? "previewing_proposal"
              : "approved_version",
          saved: false,
        };
      },
    ),
    tool(
      "timetrail.history.request",
      "Ask the human to confirm undo or redo. The tool cannot confirm its own request.",
      z.object({
        action: z.enum(["undo", "redo"]),
        expectedRevision: revision,
      }),
      false,
      false,
      async (input, _corr, signal) => {
        const r = w.requireRecord();
        if (r.revision !== input.expectedRevision)
          throw new Error("Stale revision.");
        if (!(input.action === "undo" ? r.past : r.future).length)
          throw new Error(`Nothing to ${input.action}.`);
        const yes = await w.ask(
          `${input.action === "undo" ? "Undo" : "Redo"} the last edit?`,
          `This changes the saved project at revision ${r.revision}.`,
          input.action === "undo" ? "Undo edit" : "Redo edit",
          signal,
        );
        if (!yes) return { status: "user_cancelled" };
        if (
          w.approved?.id !== r.project.id ||
          w.record?.revision !== r.revision
        )
          throw new Error("Project changed during confirmation.");
        await w.undo(input.action);
        return { status: "human_confirmed", revision: w.record?.revision };
      },
    ),
  ];
}
