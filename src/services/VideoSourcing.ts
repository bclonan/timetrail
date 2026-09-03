import type { Media } from "../domain/model";

export const videoSourcingRule =
  "If no user-supplied or existing video is usable and you are not generating an actual video, find relevant source footage before building. Search, resolve, import and use it in the timeline. Generated stills and title cards do not replace this step. Verify playback and retain credits.";

export function videoSourcing(media: Media[], topic: string) {
  const candidates = media.filter(
    (m) =>
      ["video", "youtube", "vimeo"].includes(m.type) &&
      m.source.kind !== "generated",
  );
  return candidates.length
    ? {
        status: "video_candidates_available",
        count: candidates.length,
        instruction:
          "Use suitable supplied, staged or generated video in the timeline and verify playback. If none is usable, search for replacement footage. Metadata alone does not prove playback.",
      }
    : {
        status: "find_source_video",
        count: 0,
        nextTool: "timetrail.media.search",
        suggestedInput: {
          query: topic.trim().slice(0, 200),
          provider: "commons",
          type: "video",
        },
        instruction: videoSourcingRule,
      };
}
