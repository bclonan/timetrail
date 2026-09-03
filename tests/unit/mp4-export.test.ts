import { describe, it, expect } from "vitest";
import { createProject, clone } from "../../src/domain/model";
import { mp4Sequence } from "../../src/services/Mp4ExportService";

describe("MP4 timeline selection", () => {
  function project() {
    const p = createProject({
      title: "MP4 checks",
      topic: "Exports",
      targetSeconds: 10,
    });
    p.media.push({
      id: "source",
      name: "Source",
      type: "image",
      source: { kind: "remote", url: "https://example.com/image.png" },
      tags: [],
      importedAt: p.createdAt,
      importedBy: "human",
    });
    p.sequences[0]!.clips = [
      {
        id: "clip",
        mediaId: "source",
        timelineStart: 0,
        sourceStart: 0,
        durationSeconds: 10,
      },
    ];
    return p;
  }
  it("uses the approved main screen and leaves the project intact", () => {
    const p = project(),
      before = clone(p);
    p.sequences.push({
      ...clone(p.sequences[0]!),
      id: "branch",
      title: "Optional branch",
    });
    expect(mp4Sequence(p).id).toBe(p.activeSequenceId);
    expect(p.sequences[0]).toEqual(before.sequences[0]);
  });
  it("rejects empty and oversized timelines before encoding", () => {
    const p = project();
    p.sequences[0]!.durationSeconds = 601;
    expect(() => mp4Sequence(p)).toThrow("ten minutes");
    p.sequences[0]!.clips = [];
    expect(() => mp4Sequence(p)).toThrow("Add clips");
  });
  it("requires an actual source file for embedded players", () => {
    const p = project();
    p.media[0]!.type = "youtube";
    expect(() => mp4Sequence(p)).toThrow("YouTube or Vimeo");
  });
});
