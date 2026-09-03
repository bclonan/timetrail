import DOMPurify from "dompurify";
import {
  projectSchema,
  createProject,
  id,
  now,
  type Project,
  type Cue,
  type Media,
  type Sequence,
} from "../domain/model";
import { mediaFromUrl } from "../services/MediaImportService";
import { cardSvg, escapeHtml } from "./generatedCard";
import { toFrameTrailLayoutAreas } from "./layoutAreaMapper";
import {
  hotspotAppearance,
  positionForCue,
  annotationKinds,
  isIndicator,
} from "../domain/hotspots";
export type AssetUrls = Record<string, string>;
export function mediaUrl(m: Media, assets: AssetUrls = {}) {
  return m.source.kind === "remote"
    ? m.source.url
    : m.source.kind === "asset"
      ? assets[m.source.assetId] || `asset://${m.source.assetId}`
      : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardSvg(m.source.document))}`;
}
function annotation(
  c: Cue,
  sequenceId: string,
  overlay = false,
  type = "text",
  src?: string,
  position = c.position,
  attributes?: Record<string, unknown>,
) {
  const body = DOMPurify.sanitize(
    `<p>${escapeHtml(c.body || c.title || "")}</p>`,
    { ALLOWED_TAGS: ["p", "b", "i", "strong", "em", "br"], ALLOWED_ATTR: [] },
  );
  return {
    "@context": [
      "http://www.w3.org/ns/anno.jsonld",
      { frametrail: "http://frametrail.org/ns/" },
    ],
    id: c.id,
    type: "Annotation",
    "frametrail:type": overlay ? "Overlay" : "Annotation",
    creator: { nickname: "TimeTrail", type: "Person", id: "timetrail" },
    created: c.provenance.createdAt,
    target: {
      type: "Video",
      source: sequenceId,
      selector: {
        type: "FragmentSelector",
        conformsTo: "http://www.w3.org/TR/media-frags/",
        value: `t=${c.start},${c.end ?? c.start + 1}${overlay ? `&xywh=percent:${position?.x ?? 0},${position?.y ?? 0},${position?.width ?? 100},${position?.height ?? 100}` : ""}`,
      },
    },
    body: {
      type: type === "text" ? "TextualBody" : "Image",
      "frametrail:type": type,
      format: type === "text" ? "text/html" : "image/svg+xml",
      value: src || body,
      source: src,
      "frametrail:name": attributes ? c.id : escapeHtml(c.title || c.kind),
      "frametrail:attributes":
        attributes || (type === "text" ? { text: body } : {}),
      "frametrail:resourceId": null,
    },
    "frametrail:tags": [],
    "frametrail:events": {},
  };
}
export function interactiveContents(cues: Cue[], sequenceId: string) {
  return cues
    .filter(
      (c) =>
        c.kind === "quiz" ||
        c.kind === "branch" ||
        annotationKinds.includes(c.kind),
    )
    .map((c) => {
      if (c.quiz)
        return annotation(
          c,
          sequenceId,
          true,
          "quiz",
          undefined,
          c.position || { x: 8, y: 12, width: 84, height: 74 },
          {
            question: escapeHtml(c.quiz.question),
            questionType: "multipleChoice",
            answers: c.quiz.options.map((text, i) => ({
              text,
              correct: i === c.quiz!.answerIndex,
            })),
            onCorrectAnswer: { resumePlayback: false, showText: false },
            onWrongAnswer: { resumePlayback: false, showText: false },
          },
        );
      return annotation(
        c,
        sequenceId,
        true,
        "hotspot",
        undefined,
        positionForCue(c, cues),
        {
          text: isIndicator(c) ? "i" : c.branch?.label || c.title || "Explore",
          ...hotspotAppearance(
            isIndicator(c) ? { ...c.style, preset: "marker" } : c.style,
          ),
          linkUrl: "",
          action: "none",
        },
      );
    });
}
export function toFrameTrailAnnotations(project: Project, sequenceId: string) {
  const s = project.sequences.find((s) => s.id === sequenceId)!;
  return s.cues
    .filter((c) => !["caption", "narration"].includes(c.kind))
    .map((c) => annotation(c, sequenceId));
}
export function toFrameTrailResources(
  project: Project,
  assets: AssetUrls = {},
) {
  return [
    {
      label: "TimeTrail resources",
      type: "frametrail",
      data: Object.fromEntries(
        project.media.map((m) => [
          m.id,
          {
            name: escapeHtml(m.name),
            type:
              m.type === "generated-card"
                ? "image"
                : ["webpage", "html", "pdf", "subtitle", "text"].includes(
                      m.type,
                    )
                  ? "urlpreview"
                  : m.type,
            src: mediaUrl(m, assets),
            thumb: "",
            attributes: {},
            tags: m.tags.map(escapeHtml),
          },
        ]),
      ),
    },
  ];
}
export function toFrameTrailContents(
  project: Project,
  sequenceId: string,
  assets: AssetUrls = {},
) {
  projectSchema.parse(project);
  const seq = project.sequences.find((s) => s.id === sequenceId);
  if (!seq) throw new Error("Sequence is missing.");
  return project.sequences.map((s) => ({
    hypervideo: hypervideo(project, s, assets),
    annotations: toFrameTrailAnnotations(project, s.id),
  }));
}
function hypervideo(project: Project, s: Sequence, assets: AssetUrls) {
  const contents: ReturnType<typeof annotation>[] = [];
  s.clips.forEach((clip, i) => {
    const m = project.media.find((m) => m.id === clip.mediaId)!;
    if (["video", "youtube", "vimeo", "audio"].includes(m.type)) return;
    const src =
      m.source.kind === "generated"
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardSvg(m.source.document, i))}`
        : m.type === "image"
          ? mediaUrl(m, assets)
          : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardSvg({ layout: "concept", heading: m.name, body: m.source.kind === "remote" ? m.source.url : "Local resource. Open it from the media library.", background: "ink" }))}`;
    contents.push(
      annotation(
        {
          id: `${clip.id}_visual`,
          kind: "image",
          start: clip.timelineStart,
          end: clip.timelineStart + clip.durationSeconds,
          title: m.name,
          provenance: { createdBy: "import", createdAt: m.importedAt },
        },
        s.id,
        true,
        "image",
        src,
      ),
    );
  });
  if (!s.clips.length)
    contents.push(
      annotation(
        {
          id: `${s.id}_empty`,
          kind: "image",
          start: 0,
          end: s.durationSeconds,
          title: project.title,
          provenance: { createdBy: "human", createdAt: project.createdAt },
        },
        s.id,
        true,
        "image",
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardSvg({ layout: "title", heading: project.title, body: "Your story starts here. Add media or load a storyboard proposal.", background: "forest" }))}`,
      ),
    );
  s.cues
    .filter((c) => c.kind === "image" && c.resourceId)
    .forEach((c) => {
      const m = project.media.find((m) => m.id === c.resourceId);
      if (m)
        contents.push(annotation(c, s.id, true, "image", mediaUrl(m, assets)));
    });
  contents.push(...interactiveContents(s.cues, s.id));
  return {
    meta: {
      name: escapeHtml(s.title),
      description: escapeHtml(s.description || ""),
      thumb: "",
      creator: "TimeTrail",
      creatorId: "timetrail",
      created: Date.parse(project.createdAt),
      lastchanged: Date.parse(project.updatedAt),
    },
    config: {
      theme: "dark",
      hidden: false,
      slidingMode: "overlay",
      layoutArea: toFrameTrailLayoutAreas(s),
    },
    clips: [
      {
        duration: s.durationSeconds,
        start: 0,
        end: s.durationSeconds,
        scrubSprite: false,
      },
    ],
    contents,
    subtitles: {},
    chapters: s.cues
      .filter((c) => c.kind === "chapter")
      .map((c) => ({
        name: escapeHtml(c.title || ""),
        start: c.start,
        end: c.end,
        description: escapeHtml(c.body || ""),
      })),
    globalEvents: {},
    customCSS: "",
  };
}
export function captionsVtt(project: Project, sequenceId: string) {
  const fmt = (n: number) => new Date(n * 1000).toISOString().slice(11, 23);
  return (
    "WEBVTT\n\n" +
    project.sequences
      .find((s) => s.id === sequenceId)!
      .cues.filter((c) => c.kind === "caption")
      .map(
        (c) =>
          `${fmt(c.start)} --> ${fmt(c.end ?? c.start + 3)}\n${c.body || ""}`,
      )
      .join("\n\n")
  );
}
export function fromFrameTrailExport(raw: unknown): Project {
  // Full TimeTrail snapshots embedded by our viewer retain all semantic cue fields.
  const wrapped = raw as { timetrail?: unknown };
  if (wrapped?.timetrail) return projectSchema.parse(wrapped.timetrail);
  const data = raw as any;
  const hv = data?.hypervideo || data;
  if (!hv?.meta || !Array.isArray(hv.clips) || !hv.clips.length)
    throw new Error("This is not a supported TimeTrail or FrameTrail project.");
  const textOnly = (html: unknown) =>
    DOMPurify.sanitize(String(html || ""), {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    }).slice(0, 8000);
  const p = createProject({
    title: textOnly(hv.meta.name) || "Imported FrameTrail film",
    topic: textOnly(hv.meta.description),
    targetSeconds: 90,
  });
  const seq = p.sequences[0]!;
  seq.clips = [];
  seq.cues = [];
  let offset = 0;
  for (const c of hv.clips) {
    const duration = Number(c.duration) || Number(c.out) - Number(c.in);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 86400)
      throw new Error("FrameTrail clip duration is invalid.");
    if (c.src) {
      const m = mediaFromUrl(String(c.src), textOnly(hv.meta.name));
      m.importedBy = "human";
      p.media.push(m);
      seq.clips.push({
        id: id(),
        mediaId: m.id,
        timelineStart: offset,
        sourceStart: Math.max(0, Number(c.in) || 0),
        durationSeconds: duration,
      });
    } else if (c.resourceId)
      throw new Error(
        "FrameTrail resource IDs need inline HTTP source URLs before importing.",
      );
    offset += duration;
  }
  seq.durationSeconds = offset;
  seq.baseMode = seq.clips.length ? "video" : "generated-canvas";
  const input = [
    ...(Array.isArray(hv.contents) ? hv.contents : []),
    ...(Array.isArray(data.annotations) ? data.annotations : []),
  ];
  for (const content of input) {
    if (content["frametrail:type"] === "CodeSnippet") continue;
    const match = String(content.target?.selector?.value || "").match(
      /t=([\d.]+),([\d.]+)/,
    );
    if (!match) continue;
    const start = Math.min(offset, Number(match[1]));
    const end = Math.min(offset, Math.max(start, Number(match[2])));
    const title = textOnly(content.body?.["frametrail:name"]).slice(0, 300);
    if (content.body?.["frametrail:type"] === "text")
      seq.cues.push({
        id: id(),
        kind: "note",
        start,
        end,
        title,
        body: textOnly(
          content.body?.value || content.body?.["frametrail:attributes"]?.text,
        ),
        provenance: { createdBy: "import", createdAt: now() },
      });
  }
  for (const chapter of hv.chapters || [])
    seq.cues.push({
      id: id(),
      kind: "chapter",
      title: textOnly(chapter.name).slice(0, 300),
      body: textOnly(chapter.description),
      start: Math.max(0, Math.min(offset, Number(chapter.start) || 0)),
      end: Math.max(0, Math.min(offset, Number(chapter.end) || offset)),
      provenance: { createdBy: "import", createdAt: now() },
    });
  p.description =
    "Imported FrameTrail video, chapters, and text annotations. Executable snippets and unsupported overlays were omitted.";
  return projectSchema.parse(p);
}
