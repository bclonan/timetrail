import {
  applyOperations,
  clone,
  id,
  projectSchema,
  type Cue,
  type Media,
  type Operation,
  type Project,
  type ProjectRecord,
} from "../domain/model";
import { hotspotAppearance } from "../domain/hotspots";
import { hotspotPosition } from "./HotspotService";
import { probeMetadata } from "./MediaImportService";
import { storage } from "../storage/BrowserWorkspaceStore";

type Change = {
  sequenceId: string;
  cueId: string;
  patch?: Partial<Cue>;
  remove?: boolean;
};
export type QualityFinding = {
  id: string;
  code: string;
  severity: "error" | "warning" | "suggestion";
  message: string;
  sequenceId?: string;
  cueIds?: string[];
  mediaId?: string;
  time?: number;
  changes?: Change[];
};
export type QualityReport = {
  id: string;
  projectId: string;
  revision: number;
  findings: QualityFinding[];
  checkedMediaIds: string[];
  remainingMediaIds: string[];
  checkpoints: { sequenceId: string; time: number; reason: string }[];
  sequences: number;
  clips: number;
  cues: number;
};
const end = (c: Cue, seconds: number) =>
  Math.min(c.end ?? c.start + 5, seconds);
const rect = (c: Cue) =>
  c.position ||
  (c.quiz
    ? { x: 8, y: 12, width: 84, height: 74 }
    : { x: 60, y: 72, width: 34, height: 14 });
const luminance = (hex: string) => {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
};
export const contrastRatio = (a: string, b: string) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05);

export function analyzeQuality(
  project: Project,
  revision: number,
): QualityReport {
  const report: QualityReport = {
    id: id(),
    projectId: project.id,
    revision,
    findings: [],
    checkedMediaIds: [],
    remainingMediaIds: [],
    checkpoints: [],
    sequences: project.sequences.length,
    clips: 0,
    cues: 0,
  };
  const add = (f: Omit<QualityFinding, "id">) =>
    report.findings.push({ ...f, id: `finding_${report.findings.length + 1}` });
  const parsed = projectSchema.safeParse(project);
  if (!parsed.success)
    add({
      code: "invalid_project",
      severity: "error",
      message: parsed.error.issues
        .map((i) => i.message)
        .join("; ")
        .slice(0, 2000),
    });
  const usedMedia = new Set<string>();
  const flags = new Set(
    project.sequences.flatMap((s) =>
      s.cues.flatMap((c) => (c.branch?.setsFlag ? [c.branch.setsFlag] : [])),
    ),
  );
  for (const panel of project.presentation?.panels || [])
    if (panel.kind === "checklist")
      panel.entries.forEach((e) => flags.add(e.id));
  for (const s of project.sequences) {
    report.clips += s.clips.length;
    report.cues += s.cues.length;
    let until = 0;
    for (const clip of [...s.clips].sort(
      (a, b) => a.timelineStart - b.timelineStart,
    )) {
      usedMedia.add(clip.mediaId);
      if (clip.timelineStart > until + 0.1)
        add({
          code: "timeline_gap",
          severity: "warning",
          sequenceId: s.id,
          time: until,
          message: `No clip from ${until.toFixed(1)}s to ${clip.timelineStart.toFixed(1)}s. Review whether the empty section is intentional.`,
        });
      until = Math.max(until, clip.timelineStart + clip.durationSeconds);
      const media = project.media.find((m) => m.id === clip.mediaId);
      if (
        media?.durationSeconds &&
        clip.sourceStart + clip.durationSeconds > media.durationSeconds + 0.1 &&
        ["video", "audio"].includes(media.type)
      )
        add({
          code: "source_range",
          severity: "error",
          sequenceId: s.id,
          mediaId: media.id,
          time: clip.timelineStart,
          message:
            "Clip extends beyond its source duration. Choose a shorter trim or replacement footage.",
        });
      report.checkpoints.push({
        sequenceId: s.id,
        time: Math.min(s.durationSeconds, clip.timelineStart + 0.2),
        reason: "Play this clip and verify its picture, sound and transition.",
      });
    }
    if (until < s.durationSeconds - 0.1)
      add({
        code: "timeline_gap",
        severity: "warning",
        sequenceId: s.id,
        time: until,
        message: `No clip from ${until.toFixed(1)}s to the end at ${s.durationSeconds.toFixed(1)}s.`,
      });
    const interactive = s.cues.filter((c) =>
      ["hotspot", "branch", "quiz"].includes(c.kind),
    );
    const hotspots = interactive.filter((c) => !c.quiz);
    const signatures = new Map<string, Cue>();
    const obstructed = new Set<string>();
    for (const cue of s.cues) {
      if (cue.resourceId) usedMedia.add(cue.resourceId);
      if (cue.url)
        report.checkpoints.push({
          sequenceId: s.id,
          time: cue.start,
          reason: `Open the link or image in annotation ${cue.id} and verify the destination. Linked pages require browser review.`,
        });
      const signature = JSON.stringify([
        cue.kind,
        cue.start,
        cue.end,
        cue.title,
        cue.body,
        cue.url,
        cue.resourceId,
        cue.position,
        cue.quiz,
        cue.branch,
        cue.style,
      ]);
      if (signatures.has(signature))
        add({
          code: "duplicate_cue",
          severity: "warning",
          sequenceId: s.id,
          cueIds: [cue.id],
          time: cue.start,
          message: "This annotation exactly duplicates an earlier annotation.",
          changes: [{ sequenceId: s.id, cueId: cue.id, remove: true }],
        });
      else signatures.set(signature, cue);
      if (cue.branch?.requiresFlag && !flags.has(cue.branch.requiresFlag))
        add({
          code: "unreachable_choice",
          severity: "error",
          sequenceId: s.id,
          cueIds: [cue.id],
          time: cue.start,
          message: `Choice requires ${cue.branch.requiresFlag}, but no checklist or branch sets it. Add an acquisition step or change the requirement.`,
        });
    }
    for (const cue of interactive) {
      const p = rect(cue);
      report.checkpoints.push({
        sequenceId: s.id,
        time: cue.start,
        reason: `Check annotation ${cue.id}: read it, activate it and confirm that it does not hide needed content.`,
      });
      if (
        !cue.quiz &&
        (p.width * p.height > 3000 ||
          p.y + p.height > 88 ||
          p.width < 4 ||
          p.height < 4)
      )
        obstructed.add(cue.id);
      if (end(cue, s.durationSeconds) - cue.start < 2)
        add({
          code: "brief_interaction",
          severity: "warning",
          sequenceId: s.id,
          cueIds: [cue.id],
          time: cue.start,
          message:
            "This control is visible for less than two seconds. Allow enough time to read and activate it.",
          ...(s.durationSeconds - cue.start >= 2
            ? {
                changes: [
                  {
                    sequenceId: s.id,
                    cueId: cue.id,
                    patch: { end: Math.min(s.durationSeconds, cue.start + 5) },
                  },
                ],
              }
            : {}),
        });
      if (cue.kind === "hotspot" && !cue.body && !cue.url && !cue.resourceId)
        add({
          code: "empty_hotspot",
          severity: "suggestion",
          sequenceId: s.id,
          cueIds: [cue.id],
          time: cue.start,
          message:
            "This hotspot has no explanation, resource or link. Add useful content.",
        });
      if (!cue.quiz) {
        const appearance = hotspotAppearance(cue.style);
        if (
          appearance.backgroundColor &&
          contrastRatio(appearance.textColor, appearance.backgroundColor) < 4.5
        )
          add({
            code: "low_contrast",
            severity: "warning",
            sequenceId: s.id,
            cueIds: [cue.id],
            time: cue.start,
            message: "Hotspot label contrast is below 4.5:1.",
            changes: [
              {
                sequenceId: s.id,
                cueId: cue.id,
                patch: {
                  style: {
                    textColor:
                      contrastRatio("#000000", appearance.backgroundColor) >
                      contrastRatio("#ffffff", appearance.backgroundColor)
                        ? "#000000"
                        : "#ffffff",
                  },
                },
              },
            ],
          });
      }
    }
    for (let i = 0; i < interactive.length; i++)
      for (let j = i + 1; j < interactive.length; j++) {
        const a = interactive[i]!,
          b = interactive[j]!;
        if (
          Math.max(a.start, b.start) >=
          Math.min(end(a, s.durationSeconds), end(b, s.durationSeconds))
        )
          continue;
        const ar = rect(a),
          br = rect(b);
        const overlap =
          Math.max(
            0,
            Math.min(ar.x + ar.width, br.x + br.width) - Math.max(ar.x, br.x),
          ) *
          Math.max(
            0,
            Math.min(ar.y + ar.height, br.y + br.height) - Math.max(ar.y, br.y),
          );
        if (
          overlap >
          Math.min(ar.width * ar.height, br.width * br.height) * 0.25
        ) {
          if (!a.quiz && !b.quiz) {
            obstructed.add(a.id);
            obstructed.add(b.id);
          } else
            add({
              code: "quiz_obstruction",
              severity: "warning",
              sequenceId: s.id,
              cueIds: [a.id, b.id],
              time: Math.max(a.start, b.start),
              message:
                "A quiz and another control occupy the same area at the same time. Review their timing or move the other control; the quiz may need its full size.",
            });
        }
      }
    if (obstructed.size)
      add({
        code: "blocking_hotspots",
        severity: "warning",
        sequenceId: s.id,
        cueIds: [...obstructed],
        time: Math.min(
          ...hotspots.filter((c) => obstructed.has(c.id)).map((c) => c.start),
        ),
        message:
          "Hotspots overlap, cover too much of the picture, are too small, or enter the caption area. Proposed layout moves this screen's hotspots into separate positions above the caption area.",
        ...(hotspots.length <= 18
          ? {
              changes: hotspots.map((cue, i) => ({
                sequenceId: s.id,
                cueId: cue.id,
                patch: { position: hotspotPosition(i, "grid") },
              })),
            }
          : {}),
      });
    if (s.clips.length && !s.cues.some((c) => c.kind === "caption"))
      add({
        code: "missing_captions",
        severity: "suggestion",
        sequenceId: s.id,
        time: 0,
        message:
          "No caption cues. Add captions when the film contains speech or necessary audio.",
      });
  }
  report.remainingMediaIds = project.media
    .filter(
      (m) =>
        usedMedia.has(m.id) &&
        (m.source.kind !== "generated" || Boolean(m.source.document.image)),
    )
    .map((m) => m.id);
  return report;
}

export class QualityService {
  private reports = new Map<string, QualityReport>();
  get(record: ProjectRecord, reportId: string) {
    const report = this.reports.get(reportId);
    if (
      !report ||
      report.projectId !== record.project.id ||
      report.revision !== record.revision
    )
      throw new Error(
        "Quality report is missing or stale. Scan the current project again.",
      );
    return clone(report);
  }
  async scan(
    record: ProjectRecord,
    checkMedia = true,
    reportId?: string,
    signal?: AbortSignal,
  ) {
    const report = reportId
      ? this.get(record, reportId)
      : analyzeQuality(record.project, record.revision);
    if (checkMedia) {
      const batch = report.remainingMediaIds.slice(0, 12);
      for (let i = 0; i < batch.length; i += 4) {
        signal?.throwIfAborted();
        const results = await Promise.all(
          batch.slice(i, i + 4).map(async (mediaId) => {
            const media = record.project.media.find((m) => m.id === mediaId)!;
            return { media, result: await this.probe(media, signal) };
          }),
        );
        signal?.throwIfAborted();
        for (const { media, result } of results) {
          report.checkedMediaIds.push(media.id);
          report.remainingMediaIds = report.remainingMediaIds.filter(
            (id) => id !== media.id,
          );
          const add = (
            code: string,
            severity: QualityFinding["severity"],
            message: string,
          ) =>
            report.findings.push({
              id: `finding_${report.findings.length + 1}`,
              code,
              severity,
              mediaId: media.id,
              message,
            });
          if (!result.ok)
            add(
              result.reason === "manual"
                ? "media_manual_check"
                : "media_unavailable",
              result.reason === "manual" || result.reason === "timeout"
                ? "warning"
                : "error",
              `${media.name}: ${result.reason === "manual" ? "embedded or document source requires manual playback/opening" : result.reason === "timeout" ? "source probe timed out; availability is unverified" : "source could not load or local bytes are missing"}. Inspect it or use a replacement source.`,
            );
          if (result.duration)
            for (const s of record.project.sequences)
              for (const clip of s.clips.filter(
                (c) => c.mediaId === media.id,
              )) {
                if (
                  clip.sourceStart + clip.durationSeconds >
                  result.duration + 0.1
                )
                  add(
                    "source_range",
                    "error",
                    `${s.title}: clip ${clip.id} exceeds the measured source duration of ${result.duration.toFixed(1)} seconds.`,
                  );
              }
        }
      }
    }
    signal?.throwIfAborted();
    this.reports.set(report.id, clone(report));
    while (this.reports.size > 8)
      this.reports.delete(this.reports.keys().next().value!);
    return report;
  }
  private async probe(
    media: Media,
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; duration?: number; reason?: string }> {
    let url = "",
      temporary = false;
    try {
      if (media.source.kind === "asset") {
        url = URL.createObjectURL(await storage.getAsset(media.source.assetId));
        temporary = true;
      } else if (media.source.kind === "remote") url = media.source.url;
      else if (media.source.kind === "generated" && media.source.document.image)
        return await probeMetadata(media.source.document.image, "image", {
          signal,
          timeoutMs: 6000,
        });
      if (!["image", "video", "audio"].includes(media.type))
        return { ok: false, reason: "manual" };
      return await probeMetadata(url, media.type, { signal, timeoutMs: 6000 });
    } catch (error) {
      signal?.throwIfAborted();
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "load_error",
      };
    } finally {
      if (temporary) URL.revokeObjectURL(url);
    }
  }
  fixes(record: ProjectRecord, reportId: string, findingIds: string[]) {
    const report = this.get(record, reportId);
    const merged = new Map<
      string,
      { sequenceId: string; cue: Cue; remove?: boolean }
    >();
    for (const findingId of new Set(findingIds)) {
      const finding = report.findings.find((f) => f.id === findingId);
      if (!finding?.changes?.length)
        throw new Error(
          "Select findings with an available fix. Other findings need an authored edit or replacement media.",
        );
      for (const change of finding.changes) {
        const source = record.project.sequences
          .find((s) => s.id === change.sequenceId)
          ?.cues.find((c) => c.id === change.cueId);
        if (!source) throw new Error("Cue changed. Scan again.");
        const entry = merged.get(source.id) || {
          sequenceId: change.sequenceId,
          cue: clone(source),
        };
        if (change.remove) entry.remove = true;
        if (change.patch)
          entry.cue = {
            ...entry.cue,
            ...change.patch,
            ...(change.patch.style
              ? { style: { ...entry.cue.style, ...change.patch.style } }
              : {}),
          };
        merged.set(source.id, entry);
      }
    }
    const operations: Operation[] = [...merged.values()].map((e) =>
      e.remove
        ? { type: "remove_cue", sequenceId: e.sequenceId, id: e.cue.id }
        : { type: "update_cue", sequenceId: e.sequenceId, value: e.cue },
    );
    if (!operations.length)
      throw new Error("Select at least one repairable finding.");
    applyOperations(record.project, operations);
    return operations;
  }
}
export const quality = new QualityService();
