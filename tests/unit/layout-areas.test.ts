import { describe, expect, it } from "vitest";
import { createProject, projectSchema } from "../../src/domain/model";
import { layoutAreasSchema } from "../../src/domain/layoutAreas";
import { toFrameTrailContents } from "../../src/runtime/frameTrailMapper";
import { compileProduction } from "../../src/services/ProductionService";

describe("FrameTrail content areas", () => {
  it("keeps custom text inert, derives timed transcript and preserves areas in portable data", () => {
    const project = createProject({ title: "Test", topic: "Europa" });
    const seq = project.sequences[0]!;
    seq.layoutAreas = [
      {
        area: "right",
        content: "text",
        title: '<img src=x onerror="bad()">',
        text: "<script>bad()</script>",
        size: "medium",
        collapsed: true,
      },
      {
        area: "left",
        content: "transcript",
        title: "Transcript",
        size: "small",
        collapsed: false,
      },
    ];
    seq.cues.push({
      id: "caption_one",
      kind: "caption",
      start: 5,
      end: 9,
      body: "An ocean & ice",
      provenance: { createdBy: "human", createdAt: project.createdAt },
    });
    const areas = toFrameTrailContents(project, seq.id)[0]!.hypervideo.config
      .layoutArea;
    expect(areas.areaRight![0]!.name).not.toContain("<img");
    expect(areas.areaRight![0]!.html).not.toContain("<script>");
    expect(areas.areaRight![0]!.onClickContentItem).toBe("");
    expect(areas.areaRight![0]!.initClosed).toBe(true);
    expect(areas.areaLeft![0]!.html).toContain('data-timetrail-seek="5"');
    expect(areas.areaLeft![0]!.html).toContain("An ocean &amp; ice");
    expect(
      projectSchema.parse(JSON.parse(JSON.stringify(project))).sequences[0]!
        .layoutAreas,
    ).toEqual(seq.layoutAreas);
  });
  it("rejects an overfilled area and unsafe content types", () => {
    const area = { area: "left", content: "notes", title: "Notes" };
    expect(layoutAreasSchema.safeParse(Array(5).fill(area)).success).toBe(
      false,
    );
    expect(
      layoutAreasSchema.safeParse([{ ...area, content: "javascript" }]).success,
    ).toBe(false);
  });
  it("includes layout areas in a production proposal without changing approved data", () => {
    const project = createProject({ title: "Test", topic: "Europa" });
    const result = compileProduction(project, {
      title: "A film",
      sequences: [
        {
          key: "main",
          storyboard: {
            title: "Ocean",
            topic: "Europa",
            targetSeconds: 20,
            segments: [{ title: "Ice", body: "A frozen world" }],
          },
          layoutAreas: [{ area: "right", content: "notes", title: "Science" }],
        },
      ],
    });
    const operation = result.operations.find(
      (o) => o.type === "upsert_sequence",
    );
    expect(
      operation?.type === "upsert_sequence" &&
        operation.value.layoutAreas?.[0]?.title,
    ).toBe("Science");
    expect(project.sequences[0]!.layoutAreas).toBeUndefined();
  });
});
