import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { z } from "zod";
import {
  clone,
  id,
  now,
  cardSchema,
  cueInputSchema,
  clipSchema,
  sequenceSchema,
  projectShape,
  applyOperations,
  type Cue,
  type Clip,
  type Sequence,
  type Media,
  type Operation,
} from "../domain/model";
import { useWorkspace } from "./workspace";
import { proposals } from "../services/ProposalService";
import { importUrls } from "../services/MediaImportService";

export const forms = [
  "project",
  "sequence",
  "card",
  "cue",
  "clip",
  "urls",
] as const;
export type EditorForm = (typeof forms)[number];
export const cardFormSchema = cardSchema.extend({
  background: cardSchema.shape.background.removeDefault(),
  heading: z.string().max(300),
  duration: z.number().min(0.1).max(3600),
  image: z.union([cardSchema.shape.image.unwrap(), z.literal("")]).optional(),
});
export const metaFormSchema = projectShape.pick({
  title: true,
  description: true,
  topic: true,
  audience: true,
  tags: true,
});
export const sequenceFormSchema = sequenceSchema.omit({
  id: true,
  clips: true,
  cues: true,
});
export const fillSchema = z.discriminatedUnion("form", [
  z.object({
    form: z.literal("project"),
    fields: metaFormSchema.partial().strict(),
  }),
  z.object({
    form: z.literal("sequence"),
    fields: sequenceFormSchema.partial().strict(),
  }),
  z.object({
    form: z.literal("card"),
    fields: cardFormSchema.partial().strict(),
  }),
  z.object({
    form: z.literal("cue"),
    fields: cueInputSchema.partial().strict(),
    clear: z
      .array(
        z.enum([
          "end",
          "url",
          "resourceId",
          "position",
          "style",
          "quiz",
          "branch",
        ]),
      )
      .max(7)
      .optional(),
  }),
  z.object({
    form: z.literal("clip"),
    fields: clipSchema.omit({ id: true }).partial().strict(),
    clearSourceEnd: z.boolean().optional(),
  }),
  z.object({
    form: z.literal("urls"),
    fields: z.object({ urls: z.string().max(60000) }).strict(),
  }),
]);

// Visible controls and WebMCP share drafts. Only human saves or proposal review commit them.
export const useEditor = defineStore("editor", () => {
  const w = useWorkspace();
  const active = ref<EditorForm>();
  const revision = ref(-1);
  const projectId = ref("");
  const sequenceId = ref("");
  const entityId = ref("");
  const fresh = ref(false);
  const agentDraft = ref(false);
  const positionEditing = ref(false);
  watch(positionEditing, (visible) => {
    if (visible && w.playerReady) w.playback("pause");
  });
  const project = ref<z.infer<typeof metaFormSchema>>({
    title: "",
    description: "",
    topic: "",
    audience: "",
    tags: [],
  });
  const sequence = ref<Sequence>();
  const cue = ref<Cue>();
  const clip = ref<Clip>();
  const card = ref<z.infer<typeof cardFormSchema>>({
    layout: "concept",
    heading: "",
    body: "",
    background: "forest",
    illustration: "none",
    narration: "",
    image: "",
    duration: 15,
  });
  const urls = ref("");
  const resourcePreviewId = ref("");
  function close() {
    positionEditing.value = false;
    active.value = undefined;
    agentDraft.value = false;
  }
  watch(
    () => w.approved?.id,
    () => {
      close();
      cue.value = undefined;
      clip.value = undefined;
      resourcePreviewId.value = "";
    },
  );
  function open(form: EditorForm, targetId?: string) {
    positionEditing.value = false;
    const r = w.requireRecord();
    const seq =
      r.project.sequences.find((s) => s.id === w.sequenceId) ||
      r.project.sequences[0]!;
    let target: Cue | Clip | Sequence | Media | undefined;
    if (form === "cue") target = seq.cues.find((c) => c.id === targetId);
    if (form === "clip") target = seq.clips.find((c) => c.id === targetId);
    if (form === "sequence")
      target = r.project.sequences.find((s) => s.id === targetId);
    if (form === "card")
      target = r.project.media.find((m) => m.id === targetId);
    if (targetId && !target && form !== "project" && form !== "urls")
      throw new Error(
        "Item not found in this sequence. Inspect IDs and select its sequence first.",
      );
    if (
      form === "card" &&
      target &&
      (target as Media).source.kind !== "generated"
    )
      throw new Error("This resource is not a generated card.");
    revision.value = r.revision;
    projectId.value = r.project.id;
    sequenceId.value = seq.id;
    entityId.value = targetId || id();
    fresh.value = !target;
    agentDraft.value = false;
    if (form === "project") project.value = metaFormSchema.parse(r.project);
    if (form === "sequence")
      sequence.value = target
        ? clone(target as Sequence)
        : {
            id: entityId.value,
            title: "New screen",
            durationSeconds: 30,
            baseMode: "generated-canvas",
            clips: [],
            cues: [],
          };
    if (form === "cue") {
      cue.value = target
        ? clone(target as Cue)
        : {
            id: entityId.value,
            kind: "note",
            start: w.time,
            end: Math.min(w.time + 10, seq.durationSeconds),
            title: "A note for this moment",
            body: "",
            provenance: { createdBy: "human", createdAt: now() },
          };
      w.selectedCue = cue.value.id;
    } else w.selectedCue = "";
    if (form === "clip")
      clip.value = target
        ? clone(target as Clip)
        : {
            id: entityId.value,
            mediaId: r.project.media[0]?.id || "",
            timelineStart: seq.clips.reduce(
              (n, c) => Math.max(n, c.timelineStart + c.durationSeconds),
              0,
            ),
            sourceStart: 0,
            durationSeconds: 15,
          };
    if (form === "card") {
      const m = target as Media | undefined;
      card.value =
        m?.source.kind === "generated"
          ? { ...clone(m.source.document), duration: 15 }
          : {
              layout: "concept",
              heading: "",
              body: "",
              narration: "",
              image: "",
              background: "forest",
              illustration: "none",
              duration: 15,
            };
    }
    active.value = form;
    if (["card", "urls"].includes(form)) w.mediaOpen = true;
  }
  function check(expectedRevision = revision.value) {
    const r = w.requireRecord();
    if (
      r.project.id !== projectId.value ||
      r.revision !== revision.value ||
      r.revision !== expectedRevision
    )
      throw new Error(
        "This form is stale. Reopen it at the current revision before changing or saving it.",
      );
    return r;
  }
  function changeKind() {
    if (!cue.value) return;
    if (cue.value.kind !== "quiz") delete cue.value.quiz;
    else
      cue.value.quiz ||= {
        question: "Your question",
        options: ["First answer", "Second answer"],
        answerIndex: 0,
      };
    if (cue.value.kind !== "branch") delete cue.value.branch;
    else
      cue.value.branch ||= {
        label: "Explore more",
        targetSequenceId: sequenceId.value,
      };
  }
  function fill(raw: z.infer<typeof fillSchema>, expectedRevision: number) {
    const input = fillSchema.parse(raw);
    check(expectedRevision);
    if (active.value !== input.form)
      throw new Error("Open this form first with timetrail.editor.open.");
    if (input.form === "project") Object.assign(project.value, input.fields);
    if (input.form === "sequence") Object.assign(sequence.value!, input.fields);
    if (input.form === "card") Object.assign(card.value, input.fields);
    if (input.form === "clip") {
      Object.assign(clip.value!, input.fields);
      if (input.clearSourceEnd) delete clip.value!.sourceEnd;
    }
    if (input.form === "urls") urls.value = input.fields.urls;
    if (input.form === "cue") {
      Object.assign(cue.value!, input.fields);
      if (input.fields.position) positionEditing.value = true;
      if (input.fields.kind) changeKind();
      for (const key of input.clear || []) delete cue.value![key];
    }
    agentDraft.value = true;
    return {
      status: "form_filled",
      form: input.form,
      revision: revision.value,
      saved: false,
    };
  }
  async function operations(
    action: "save" | "duplicate" | "delete",
    actor: "human" | "agent",
  ): Promise<Operation[]> {
    const r = check();
    const seq = clone(
      r.project.sequences.find((s) => s.id === sequenceId.value)!,
    );
    if (!active.value) throw new Error("Open an editor form first.");
    if (action === "delete") {
      if (fresh.value) throw new Error("This item has not been saved.");
      if (active.value === "cue")
        return [{ type: "remove_cue", sequenceId: seq.id, id: entityId.value }];
      if (active.value === "clip")
        return [
          { type: "remove_clip", sequenceId: seq.id, id: entityId.value },
        ];
      if (active.value === "card")
        return [{ type: "remove_media", id: entityId.value }];
      if (active.value === "sequence")
        return [{ type: "remove_sequence", id: entityId.value }];
      throw new Error("This form does not support deletion.");
    }
    if (
      action === "duplicate" &&
      !["card", "cue", "sequence", "clip"].includes(active.value)
    )
      throw new Error("This form does not support duplication.");
    if (active.value === "project")
      return [
        {
          type: "set_project_meta",
          value: metaFormSchema.parse(project.value),
        },
      ];
    if (active.value === "sequence") {
      const s = sequenceSchema.parse(sequence.value);
      if (action === "duplicate") {
        const oldId = s.id;
        s.id = id();
        s.title += " copy";
        s.clips.forEach((c) => (c.id = id()));
        s.cues.forEach((c) => {
          c.id = id();
          if (c.branch?.targetSequenceId === oldId)
            c.branch.targetSequenceId = s.id;
        });
      }
      return [{ type: "upsert_sequence", value: s }];
    }
    if (active.value === "cue") {
      const value = clone(cue.value!);
      if (action === "duplicate") {
        value.id = id();
        value.title = (value.title || "Cue") + " copy";
      }
      if (fresh.value || action === "duplicate")
        value.provenance = {
          ...value.provenance,
          createdBy: actor,
          createdAt: now(),
        };
      return [
        {
          type:
            fresh.value || action === "duplicate" ? "add_cue" : "update_cue",
          sequenceId: seq.id,
          value,
        },
      ];
    }
    if (active.value === "clip") {
      const value = clipSchema.parse(clip.value);
      if (action === "duplicate") {
        value.id = id();
        value.timelineStart = seq.clips.reduce(
          (n, c) => Math.max(n, c.timelineStart + c.durationSeconds),
          0,
        );
      }
      const end = value.timelineStart + value.durationSeconds;
      return [
        ...(end > seq.durationSeconds
          ? [
              {
                type: "upsert_sequence" as const,
                value: { ...seq, durationSeconds: end },
              },
            ]
          : []),
        {
          type:
            fresh.value || action === "duplicate" ? "add_clip" : "update_clip",
          sequenceId: seq.id,
          value,
        },
      ];
    }
    if (active.value === "urls") {
      const items = urls.value
        .split(/\n/)
        .map((url) => ({ url: url.trim() }))
        .filter((i) => i.url);
      if (!items.length || items.length > 20)
        throw new Error("Enter 1 to 20 URLs.");
      const result = await importUrls(items, r.project.media, actor);
      if (result.warnings.length) throw new Error(result.warnings.join(" "));
      return result.media.map((value) => ({ type: "upsert_media", value }));
    }
    const data = cardFormSchema.parse(card.value);
    const { duration, ...document } = data;
    const existing = r.project.media.find((m) => m.id === entityId.value);
    const m: Media = {
      ...(existing || { tags: [], importedAt: now() }),
      id: action === "duplicate" ? id() : entityId.value,
      name: data.heading || "Untitled card",
      type: "generated-card",
      importedBy: actor,
      source: {
        kind: "generated",
        document: cardSchema.parse({
          ...document,
          image: document.image || undefined,
        }),
      },
    };
    const ops: Operation[] = [{ type: "upsert_media", value: m }];
    if (fresh.value || action === "duplicate") {
      const start = seq.clips.reduce(
        (n, c) => Math.max(n, c.timelineStart + c.durationSeconds),
        0,
      );
      seq.durationSeconds = Math.max(seq.durationSeconds, start + duration);
      seq.clips.push({
        id: id(),
        mediaId: m.id,
        timelineStart: start,
        sourceStart: 0,
        durationSeconds: duration,
      });
      seq.cues.push({
        id: id(),
        kind: "chapter",
        start,
        end: start + duration,
        title: data.heading,
        provenance: { createdBy: actor, createdAt: now() },
      });
      if (data.narration)
        for (const kind of ["caption", "narration"] as const)
          seq.cues.push({
            id: id(),
            kind,
            start,
            end: start + duration,
            body: data.narration,
            provenance: { createdBy: actor, createdAt: now() },
          });
      ops.push({ type: "upsert_sequence", value: seq });
    } else if (existing?.source.kind === "generated") {
      const previous = existing.source.document;
      for (const s of clone(r.project.sequences)) {
        const placements = s.clips.filter((c) => c.mediaId === m.id);
        if (!placements.length) continue;
        for (const c of placements) {
          const at = (cue: Cue) =>
            cue.start === c.timelineStart &&
            cue.end === c.timelineStart + c.durationSeconds;
          for (const chapter of s.cues.filter(
            (q) =>
              q.kind === "chapter" && at(q) && q.title === previous.heading,
          ))
            chapter.title = data.heading;
          for (const kind of ["caption", "narration"] as const) {
            const linked = s.cues.find(
              (q) => q.kind === kind && at(q) && q.body === previous.narration,
            );
            if (linked && data.narration) linked.body = data.narration;
            else if (linked) s.cues = s.cues.filter((q) => q.id !== linked.id);
            else if (
              data.narration &&
              !s.cues.some((q) => q.kind === kind && at(q))
            )
              s.cues.push({
                id: id(),
                kind,
                start: c.timelineStart,
                end: c.timelineStart + c.durationSeconds,
                body: data.narration,
                provenance: { createdBy: actor, createdAt: now() },
              });
          }
        }
        ops.push({ type: "upsert_sequence", value: s });
      }
    }
    return ops;
  }
  async function submit(
    action: "save" | "duplicate" | "delete" = "save",
    asProposal = false,
    correlation?: string,
  ) {
    const r = check();
    const ops = await operations(action, asProposal ? "agent" : "human");
    if (!ops.length) throw new Error("No changes to save.");
    check();
    applyOperations(r.project, ops);
    if (asProposal) {
      const p = await proposals.create(
        r,
        `${action === "save" ? "Edit" : action} ${active.value}`,
        ops,
        [],
        correlation,
      );
      await w.refresh();
      close();
      w.selectedCue = "";
      w.notify("Editor changes are ready for review.");
      return {
        status: "pending_human_review",
        proposalId: p.id,
        revision: r.revision,
      };
    }
    const keepCue = active.value === "cue" && action === "save";
    const savedId = entityId.value;
    await w.commit(ops);
    close();
    w.selectedCue = "";
    if (keepCue) open("cue", savedId);
    return { status: "saved", revision: w.record?.revision };
  }
  function values() {
    if (active.value === "project") return clone(project.value);
    if (active.value === "sequence")
      return sequenceFormSchema.parse(sequence.value);
    if (active.value === "cue") return clone(cue.value);
    if (active.value === "clip") return clone(clip.value);
    if (active.value === "card") return clone(card.value);
    if (active.value === "urls") return { urls: urls.value };
    return {};
  }
  return {
    active,
    revision,
    projectId,
    sequenceId,
    entityId,
    fresh,
    agentDraft,
    positionEditing,
    project,
    sequence,
    cue,
    clip,
    card,
    urls,
    resourcePreviewId,
    open,
    close,
    check,
    fill,
    changeKind,
    operations,
    submit,
    values,
  };
});
