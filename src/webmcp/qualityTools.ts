import { z } from "zod";
import type { ToolBuilder } from "./editorTools";
import { useWorkspace } from "../stores/workspace";
import { quality } from "../services/QualityService";
import {
  organizeHotspots,
  organizeHotspotsSchema,
} from "../services/HotspotService";
import { proposals } from "../services/ProposalService";

export function createQualityTools(tool: ToolBuilder) {
  const w = useWorkspace();
  const key = z.string().min(1).max(100);
  return [
    tool(
      "timetrail.hotspots.propose",
      "Create hotspots or organize selected hotspot/branch cues in one proposal. Set group, colors, shape, filled/outline/marker style, layout and timing shift. Existing cueIds are ordered by the requested layout. Preserves other annotations. Human acceptance saves.",
      organizeHotspotsSchema.extend({
        expectedRevision: z.number().int().min(0),
      }),
      false,
      true,
      async (input, corr) => {
        const r = w.requireRecord();
        if (r.revision !== input.expectedRevision)
          throw new Error("Stale revision. Inspect again.");
        const operations = organizeHotspots(r.project, input);
        const proposal = await proposals.create(
          r,
          "Create and arrange hotspots",
          operations,
          [],
          corr,
        );
        await w.refresh();
        return {
          proposalId: proposal.id,
          status: "pending_human_review",
          cueIds: operations.flatMap((o) =>
            "value" in o && "id" in o.value ? [o.value.id] : [],
          ),
        };
      },
    ),
    tool(
      "timetrail.quality.review",
      "Review ALL approved screens/timelines for gaps, duplicate cues, blocking or unreadable hotspots, quiz collisions, dead-end choices and missing captions. Probe up to 12 used media per scan, four at a time. Repeat scan with reportId until remainingMediaCount is zero. Inspect paginates findings and visual checkpoints. A metadata probe is not a full playback/visual review: use the checkpoints and screenshots before claiming the film was watched. Does not edit or accept changes.",
      z.object({
        action: z.enum(["scan", "inspect"]).default("scan"),
        reportId: key.optional(),
        checkMedia: z.boolean().default(true),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(25).default(20),
      }),
      true,
      true,
      async (input, _corr, signal) => {
        if (!w.record) throw new Error("Open a film first.");
        const r = w.record;
        const report =
          input.action === "scan"
            ? await quality.scan(r, input.checkMedia, input.reportId, signal)
            : quality.get(r, input.reportId || "");
        if (
          w.record?.project.id !== r.project.id ||
          w.record?.revision !== r.revision
        )
          throw new Error("Project changed during review. Scan again.");
        const { offset, limit } = input;
        return {
          reportId: report.id,
          projectId: report.projectId,
          revision: report.revision,
          screensReviewed: report.sequences,
          clipsReviewed: report.clips,
          cuesReviewed: report.cues,
          totalFindings: report.findings.length,
          findings: report.findings
            .slice(offset, offset + limit)
            .map(({ changes, ...f }) => ({
              ...f,
              fixable: Boolean(changes?.length),
            })),
          nextFindingOffset:
            offset + limit < report.findings.length ? offset + limit : null,
          mediaChecked: report.checkedMediaIds.length,
          remainingMediaCount: report.remainingMediaIds.length,
          next: report.remainingMediaIds.length
            ? "Repeat quality.review scan with this reportId to check remaining media."
            : "Review findings; use quality.propose for selected fixable findings, preview and obtain visible acceptance. Scan again after edits.",
          checkpoints: report.checkpoints.slice(offset, offset + limit),
          totalCheckpoints: report.checkpoints.length,
          nextCheckpointOffset:
            offset + limit < report.checkpoints.length ? offset + limit : null,
          limitation:
            "Automated geometry and media-loading checks. Visual occlusion of meaningful picture content, full playback, audio quality, linked pages and external embedded-player controls require the calling agent's browser review. In Studio, use editor.control to select a sequence and playback.control to seek each checkpoint.",
        };
      },
      20000,
    ),
    tool(
      "timetrail.quality.propose",
      "Prepare selected fixes from a current quality report: separate hotspots, improve label contrast, extend brief controls or remove exact duplicate cues. Broken media and content changes need source discovery or authored edits. No automatic acceptance. Preview and review before saving, then rescan.",
      z.object({
        reportId: key,
        findingIds: z.array(key).min(1).max(100),
        expectedRevision: z.number().int().min(0),
      }),
      false,
      true,
      async (input, corr) => {
        const r = w.requireRecord();
        if (r.revision !== input.expectedRevision)
          throw new Error("Stale revision. Scan again.");
        const operations = quality.fixes(r, input.reportId, input.findingIds);
        const p = await proposals.create(
          r,
          "Improve film quality",
          operations,
          [
            "Review changed positions, text contrast and timing in the Player before accepting.",
          ],
          corr,
        );
        await w.refresh();
        return {
          status: "pending_human_review",
          proposalId: p.id,
          changes: operations.length,
          next: "timetrail.proposals.preview",
        };
      },
    ),
  ];
}
