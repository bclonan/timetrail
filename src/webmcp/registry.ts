import { z } from "zod";
import type { Router } from "vue-router";
import { ref, watch } from "vue";
import {
  createSchema,
  cueInputSchema,
  clone,
  id,
  now,
  mediaSchema,
  type Media,
  type Operation,
} from "../domain/model";
import { useWorkspace } from "../stores/workspace";
import { storage } from "../storage/BrowserWorkspaceStore";
import { proposals } from "../services/ProposalService";
import {
  storyboardSchema,
  TimelineCompiler,
} from "../services/TimelineCompiler";
import { importUrls } from "../services/MediaImportService";
import { exportFormats } from "../services/ExportService";
import { gallery, searchGallery } from "../services/GalleryService";
import {
  ToolRegistry,
  type ToolDefinition,
  type ModelContextPort,
} from "./ToolRegistry";
import { createEditorTools } from "./editorTools";
import { createProductionTools } from "./productionTools";
import { createExampleTools } from "./exampleTools";
import { videoSourcing, videoSourcingRule } from "../services/VideoSourcing";
import { createQualityTools } from "./qualityTools";
export type Tool = ToolDefinition;
declare global {
  interface Window {
    __TIMETRAIL_TOOLS__: Record<string, Tool>;
  }
}
export const nativeStatus = ref("Development fallback");
export const registeredNames = ref<string[]>([]);
export const manifest = ref<Tool[]>([]);
export function compact(value: unknown, limit = 1500) {
  const result = JSON.stringify(value);
  if (result.length <= limit) return result;
  if (Array.isArray(value)) {
    const list = [...value];
    while (
      list.length &&
      JSON.stringify({ items: list, omitted: value.length - list.length })
        .length > limit
    )
      list.pop();
    return JSON.stringify({ items: list, omitted: value.length - list.length });
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    const v =
      typeof val === "string"
        ? val.slice(0, 350)
        : Array.isArray(val)
          ? val.slice(0, 5)
          : val;
    if (JSON.stringify({ ...out, [key]: v, truncated: true }).length < limit)
      out[key] = v;
  }
  return JSON.stringify({ ...out, truncated: true });
}
const short = z.string().min(1).max(100);
export function createTools(router: Router): Tool[] {
  const w = useWorkspace();
  const tool = <T extends z.ZodType>(
    name: string,
    description: string,
    schema: T,
    readOnlyHint: boolean,
    untrustedContentHint: boolean,
    fn: (
      input: z.output<T>,
      correlation: string,
      signal?: AbortSignal,
    ) => Promise<unknown> | unknown,
    outputLimit = 1500,
  ): Tool => ({
    name,
    description,
    inputSchema: {
      type: "object",
      ...z.toJSONSchema(schema, { io: "input" }),
    } as Record<string, unknown>,
    annotations: { readOnlyHint, untrustedContentHint },
    async execute(raw, context) {
      const correlation = id();
      const startedAt = now();
      const start = performance.now();
      w.activity++;
      let status = "ok";
      let result: unknown;
      try {
        context?.signal?.throwIfAborted();
        result = await fn(schema.parse(raw), correlation, context?.signal);
        return compact(result, outputLimit);
      } catch (e) {
        status = "error";
        result = {
          error: e instanceof Error ? e.message : String(e),
          correlationId: correlation,
        };
        return compact(result, outputLimit);
      } finally {
        w.activity--;
        await storage.log({
          id: correlation,
          projectId: w.approved?.id,
          toolName: name,
          arguments: sanitizedArguments(raw),
          startedAt,
          completedAt: now(),
          duration: Math.round(performance.now() - start),
          status,
          message:
            typeof result === "object" && result && "error" in result
              ? String(result.error)
              : `${name} completed`,
          correlationId: correlation,
          revision: w.record?.revision,
          approval:
            result && typeof result === "object" && "status" in result
              ? String(result.status)
              : undefined,
        });
        w.events = await storage.events();
      }
    },
  });
  const available = () => {
    const media: Media[] = [...clone(w.approved?.media || [])];
    for (const p of w.pending)
      for (const op of p.operations)
        if (
          op.type === "upsert_media" &&
          !media.some((m) => m.id === op.value.id)
        )
          media.push(clone(op.value));
    return media;
  };
  return [
    ...createEditorTools(router, tool),
    ...createProductionTools(router, tool, available),
    ...createExampleTools(tool),
    ...createQualityTools(tool),
    tool(
      "timetrail.project.inspect",
      "Inspect current project IDs, timeline counts, media, proposals and whether video sourcing is needed.",
      z.object({
        include: z
          .array(
            z.enum(["timeline", "media", "proposals", "selection", "warnings"]),
          )
          .optional(),
      }),
      true,
      false,
      ({ include }) => {
        if (!w.approved)
          return { status: "no_project", next: "timetrail.project.create" };
        return {
          id: w.approved.id,
          title: w.approved.title,
          revision: w.record?.revision,
          sequenceId: w.sequence?.id,
          seconds: w.sequence?.durationSeconds,
          playhead: w.time,
          cues: w.sequence?.cues.length,
          clips: w.sequence?.clips.length,
          videoSourcing: videoSourcing(available(), w.approved.topic),
          media: include?.includes("media")
            ? available()
                .slice(0, 8)
                .map((m) => ({
                  id: m.id,
                  type: m.type,
                  name: m.name.slice(0, 50),
                }))
            : available().length,
          proposals: w.pending
            .slice(0, 6)
            .map((p) => ({ id: p.id, title: p.title.slice(0, 40) })),
          timeline: include?.includes("timeline")
            ? w.sequence?.cues
                .filter((c) => c.kind === "chapter")
                .slice(0, 6)
                .map((c) => ({
                  id: c.id,
                  start: c.start,
                  title: c.title?.slice(0, 50),
                }))
            : undefined,
          selection: include?.includes("selection") ? w.selectedCue : undefined,
          warnings: include?.includes("warnings")
            ? w.pending.flatMap((p) => p.warnings).slice(0, 5)
            : undefined,
        };
      },
      2500,
    ),
    tool(
      "timetrail.project.create",
      "Create an empty local project and open its studio. " + videoSourcingRule,
      createSchema,
      false,
      false,
      async (input) => {
        const p = await w.create(input);
        await router.push(`/project/${p.id}`);
        return {
          projectId: p.id,
          sequenceId: p.activeSequenceId,
          route: `/project/${p.id}`,
          videoSourcing: videoSourcing(p.media, p.topic),
        };
      },
    ),
    tool(
      "timetrail.media.import",
      "Stage URL resources for review. Returns media IDs usable in a storyboard.",
      z.object({
        items: z
          .array(
            z.object({
              url: z.string().max(3000),
              label: z.string().max(300).optional(),
              attribution: mediaSchema.shape.attribution,
              typeHint: z
                .enum([
                  "youtube",
                  "vimeo",
                  "video",
                  "image",
                  "audio",
                  "pdf",
                  "webpage",
                ])
                .optional(),
            }),
          )
          .min(1)
          .max(20),
      }),
      false,
      true,
      async ({ items }, corr, signal) => {
        const r = w.requireRecord();
        const imported = await importUrls(items, available(), "agent");
        signal?.throwIfAborted();
        const operations: Operation[] = imported.media.map((value) => ({
          type: "upsert_media",
          value,
        }));
        if (!operations.length)
          return { media: [], warnings: imported.warnings };
        const p = await proposals.create(
          r,
          "Import selected resources",
          operations,
          imported.warnings,
          corr,
        );
        await w.refresh();
        return {
          proposalId: p.id,
          media: imported.media.map((m) => ({
            id: m.id,
            name: m.name.slice(0, 60),
            type: m.type,
          })),
          warnings: imported.warnings,
          status: "staged_for_review",
        };
      },
      12000,
    ),
    tool(
      "timetrail.build.propose",
      "Compile ordered segments into a complete storyboard proposal. Human review commits it. " +
        videoSourcingRule,
      storyboardSchema,
      false,
      true,
      async (input, corr, signal) => {
        const r = w.requireRecord();
        const urls = input.segments
          .filter((s) => s.mediaUrl)
          .map((s) => ({ url: s.mediaUrl! }));
        const imported = urls.length
          ? await importUrls(urls, available(), "agent")
          : { media: [], warnings: [] };
        const result = new TimelineCompiler().compile(r.project, input, [
          ...available(),
          ...imported.media,
        ]);
        signal?.throwIfAborted();
        const p = await proposals.create(
          r,
          input.title,
          result.operations,
          [...imported.warnings, ...result.warnings],
          corr,
        );
        await w.refresh();
        return {
          proposalId: p.id,
          summary: p.summary,
          warnings: p.warnings,
          previewAvailable: true,
          status: "pending_human_review",
        };
      },
    ),
    tool(
      "timetrail.cues.propose",
      "Propose timed context, quiz, branch, or chapter cues for human review.",
      z.object({
        sequenceId: short.optional(),
        cues: z.array(cueInputSchema).min(1).max(60),
        rationale: z.string().max(1000).optional(),
      }),
      false,
      true,
      async (input, corr) => {
        const r = w.requireRecord();
        const sequenceId = input.sequenceId || w.sequence!.id;
        const operations: Operation[] = input.cues.map((c) => ({
          type: "add_cue",
          sequenceId,
          value: {
            ...c,
            id: id(),
            provenance: { createdBy: "agent", createdAt: now() },
          },
        }));
        const p = await proposals.create(
          r,
          input.rationale || "Add context cards",
          operations,
          [],
          corr,
        );
        await w.refresh();
        return {
          proposalId: p.id,
          acceptedCueCount: input.cues.length,
          rejectedCueCount: 0,
          status: "pending_human_review",
        };
      },
    ),
    tool(
      "timetrail.playback.control",
      "Play, pause, seek, jump to a chapter, retry a failed media source or skip its clip in the active preview. Recovery changes playback only, not the saved film.",
      z.object({
        action: z.enum([
          "play",
          "pause",
          "seek",
          "jump-to-chapter",
          "retry-media",
          "skip-media",
        ]),
        timeSeconds: z.number().nonnegative().optional(),
        chapterId: short.optional(),
      }),
      false,
      false,
      (input) => {
        if (!w.playerReady)
          throw new Error(
            "Open the Studio or Watch page and wait for its preview.",
          );
        return w.playback(input.action, input.timeSeconds, input.chapterId);
      },
    ),
    tool(
      "timetrail.proposals.list",
      "List compact pending or reviewed proposal summaries.",
      z.object({
        status: z
          .enum(["pending", "accepted", "rejected", "all"])
          .default("pending"),
      }),
      true,
      false,
      ({ status }) =>
        w.proposals
          .filter((p) => status === "all" || p.status === status)
          .map((p) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            summary: p.summary,
            warnings: p.warnings.slice(0, 2),
          })),
    ),
    tool(
      "timetrail.proposals.review",
      "Open a human confirmation dialog for proposal acceptance or rejection.",
      z.object({
        proposalIds: z.array(short).min(1).max(20),
        decision: z.enum(["accept", "reject"]),
        operationIndexes: z
          .array(z.number().int().nonnegative())
          .min(1)
          .max(1000)
          .optional(),
      }),
      false,
      false,
      async (input, _corr, signal) => {
        const r = w.requireRecord();
        const selected = input.proposalIds.map((pid) =>
          w.proposals.find((p) => p.id === pid),
        );
        if (selected.some((p) => !p)) throw new Error("Proposal not found.");
        if (input.operationIndexes && input.proposalIds.length !== 1)
          throw new Error("Select one proposal for item review.");
        const indexes = input.operationIndexes
          ? await proposals.plan(
              r,
              selected[0]!,
              input.decision,
              input.operationIndexes,
            )
          : undefined;
        const count =
          indexes?.length ??
          selected.reduce(
            (n, p) =>
              n +
              p!.operations.filter((_, i) => !p!.reviewedOperations[String(i)])
                .length,
            0,
          );
        const yes = await w.ask(
          `${input.decision === "accept" ? "Accept" : "Reject"} agent changes?`,
          `${selected.map((p) => p!.title).join(", ")}. ${count} unreviewed changes${indexes ? `, items ${indexes.map((i) => i + 1).join(", ")}, including required dependencies` : ""}. Approval applies to revision ${r.revision}.`,
          input.decision === "accept" ? "Accept changes" : "Reject changes",
          signal,
        );
        if (!yes) return { status: "user_cancelled" };
        const result = await proposals.review(
          r.project.id,
          input.proposalIds,
          input.decision,
          r.revision,
          indexes,
        );
        await w.refresh();
        w.previewProject = undefined;
        return { status: "human_confirmed", revision: result.revision };
      },
    ),
    tool(
      "timetrail.export.prepare",
      "Prepare a portable export and show a human download button.",
      z.object({ format: z.enum(exportFormats) }),
      false,
      false,
      async ({ format }) => {
        const p = await w.prepareExport(format);
        return {
          status: "ready_for_download",
          format,
          filename: p.filename,
          size: p.blob.size,
          assetsIncluded: p.assetsIncluded,
        };
      },
    ),
    tool(
      "timetrail.share.prepare",
      "Ask the human before revealing a share code or fragment link.",
      z.object({ mode: z.enum(["code", "link"]) }),
      false,
      false,
      async ({ mode }, _corr, signal) => {
        const projectId = w.approved?.id;
        const revision = w.record?.revision;
        const yes = await w.ask(
          "Prepare a share code?",
          "The code contains approved project text and remote URLs. Anyone with it can read the project.",
          "Generate share code",
          signal,
        );
        if (!yes) return { status: "user_cancelled" };
        if (w.approved?.id !== projectId || w.record?.revision !== revision)
          throw new Error(
            "Project changed during confirmation. Prepare sharing again.",
          );
        const code = await w.prepareShare();
        return code.length < 1000
          ? {
              status: "ready",
              code: mode === "code" ? code : undefined,
              route: mode === "link" ? w.shareLink : undefined,
            }
          : {
              status: "ready",
              characters: code.length,
              message:
                "Full code and watch link are visible in the share dialog.",
            };
      },
    ),
    tool(
      "timetrail.gallery.search",
      "Search local projects and untrusted static gallery metadata.",
      z.object({
        query: z.string().max(300).optional(),
        tags: z.array(z.string().max(60)).max(10).optional(),
        source: z.enum(["local", "published", "all"]).default("all"),
      }),
      true,
      true,
      async (input) =>
        searchGallery(
          await gallery.list(),
          input.query,
          input.tags,
          input.source,
        ).map((i) => ({
          id: i.id,
          title: i.title,
          summary: i.summary.slice(0, 100),
          tags: i.tags,
          duration: i.durationSeconds,
          route: `/watch/${i.id}`,
          untrusted: i.source === "published",
        })),
    ),
    tool(
      "timetrail.gallery.open",
      "Open a gallery project for watching, or remix into a new local copy.",
      z.object({
        projectId: short,
        mode: z.enum(["watch", "remix"]).default("watch"),
      }),
      false,
      true,
      async (input) => {
        const item = (await gallery.list()).find(
          (i) => i.id === input.projectId,
        );
        if (!item) throw new Error("Gallery project not found.");
        const p = await gallery.open(item);
        if (item.source === "local") await w.load(p.id);
        else w.loadEphemeral(p);
        if (input.mode === "remix") {
          const copy = await w.remix();
          await router.push(`/project/${copy.id}`);
          return { projectId: copy.id };
        }
        await router.push(`/watch/${item.id}`);
        return { route: `/watch/${item.id}` };
      },
    ),
  ];
}
function sanitizedArguments(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw).map(([key, val]) => [
      key,
      Array.isArray(val)
        ? { count: val.length }
        : typeof val === "string"
          ? ["action", "format", "mode", "decision", "status"].includes(key)
            ? val
            : "[text omitted]"
          : typeof val === "number"
            ? val
            : "[structured input]",
    ]),
  );
}
export function installRegistry(router: Router) {
  const tools = createTools(router);
  manifest.value = tools;
  const registry = new ToolRegistry();
  async function register() {
    const path = router.currentRoute.value.path;
    const w = useWorkspace();
    const projectRoute =
      /^\/(project|watch|player|demo)/.test(path) ||
      (path === "/webmcp" && Boolean(w.approved));
    const selected = tools.filter(
      (t) =>
        t.name === "timetrail.project.create" ||
        t.name === "timetrail.project.inspect" ||
        t.name.startsWith("timetrail.examples.") ||
        (t.name.startsWith("timetrail.gallery.")
          ? path === "/discover"
          : projectRoute &&
            ((!w.ephemeral && !/^\/(player|watch)\//.test(path)) ||
              [
                "timetrail.playback.control",
                "timetrail.export.prepare",
                "timetrail.share.prepare",
                "timetrail.player.control",
                "timetrail.views.inspect",
                "timetrail.checks.run",
                "timetrail.quality.review",
              ].includes(t.name))),
    );
    window.__TIMETRAIL_TOOLS__ = Object.fromEntries(
      selected.map((t) => [t.name, t]),
    );
    registeredNames.value = selected.map((t) => t.name);
    const status = await registry.replace(
      selected,
      (document as Document & { modelContext?: ModelContextPort }).modelContext,
    );
    if (status) nativeStatus.value = status;
  }
  router.afterEach((to, from) => {
    if (to.path === from.path && to.hash === from.hash) return;
    useWorkspace().confirmation?.resolve(false);
    void register();
  });
  const stop = watch(
    () => `${useWorkspace().ephemeral}:${Boolean(useWorkspace().approved)}`,
    () => void register(),
  );
  void register();
  return {
    refresh: register,
    destroy: () => {
      stop();
      registry.destroy();
    },
  };
}
