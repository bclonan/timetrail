import { test, expect, type Page } from "@playwright/test";
async function call(
  page: Page,
  name: string,
  args: Record<string, unknown> = {},
) {
  const result = await page.evaluate(
    async ({ name, args }) =>
      JSON.parse(await window.__TIMETRAIL_TOOLS__[name]!.execute(args)),
    { name, args },
  );
  expect(result.error, JSON.stringify(result)).toBeUndefined();
  return result;
}
const inspect = (page: Page) => call(page, "timetrail.project.inspect");
const ready = (page: Page) =>
  expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
async function create(page: Page) {
  await page.goto("/examples");
  await call(page, "timetrail.project.create", {
    title: "Quality fixture",
    topic: "A test card",
    targetSeconds: 30,
  });
  await ready(page);
}
test("older proposal previews after a human save and reload, and tool acceptance still waits for confirmation", async ({
  page,
}) => {
  await create(page);
  const draft = await call(page, "timetrail.cues.propose", {
    rationale: "Keep this draft",
    cues: [
      {
        kind: "note",
        title: "Recovered note",
        body: "Saved after review",
        start: 1,
        end: 5,
      },
    ],
  });
  await call(page, "timetrail.editor.open", {
    form: "project",
    expectedRevision: 0,
  });
  await page.getByLabel("Project title", { exact: true }).fill("Human title");
  await page
    .getByRole("button", { name: "Save project details", exact: true })
    .click();
  await expect.poll(async () => (await inspect(page)).revision).toBe(1);
  await page.reload();
  await ready(page);
  await call(page, "timetrail.proposals.preview", {
    action: "preview",
    proposalId: draft.proposalId,
  });
  await expect(
    page.getByText("PROPOSAL PREVIEW · UNSAVED", { exact: true }),
  ).toBeVisible();
  expect((await inspect(page)).revision).toBe(1);
  const beginReview = () =>
    page.evaluate((proposalId) => {
      (window as any).reviewResult = window.__TIMETRAIL_TOOLS__[
        "timetrail.proposals.review"
      ]!.execute({ proposalIds: [proposalId], decision: "accept" });
    }, draft.proposalId);
  await beginReview();
  await expect(
    page.getByRole("dialog", { name: "Accept agent changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    JSON.parse(
      await page.evaluate(async () => await (window as any).reviewResult),
    ),
  ).toMatchObject({ status: "user_cancelled" });
  expect((await inspect(page)).revision).toBe(1);
  await beginReview();
  await page
    .getByRole("button", { name: "Accept changes", exact: true })
    .click();
  expect(
    JSON.parse(
      await page.evaluate(async () => await (window as any).reviewResult),
    ),
  ).toMatchObject({ status: "human_confirmed", revision: 2 });
  expect((await inspect(page)).title).toBe("Human title");
  expect(
    (await call(page, "timetrail.editor.inspect", { collection: "cues" }))
      .items[0].title,
  ).toBe("Recovered note");
});

test("same-cue independent edits merge while a competing title gets a useful conflict message", async ({
  page,
}) => {
  await create(page);
  await call(page, "timetrail.cues.propose", {
    rationale: "Fixture",
    cues: [
      {
        kind: "note",
        title: "Original",
        body: "Original body",
        start: 1,
        end: 8,
      },
    ],
  });
  await page
    .getByRole("button", { name: "Accept proposal", exact: true })
    .click();
  await expect.poll(async () => (await inspect(page)).revision).toBe(1);
  const cueId = (
    await call(page, "timetrail.editor.inspect", { collection: "cues" })
  ).items[0].id;
  const proposeTitle = async (title: string, revision: number) => {
    await call(page, "timetrail.editor.open", {
      form: "cue",
      itemId: cueId,
      expectedRevision: revision,
    });
    await call(page, "timetrail.editor.fill", {
      expectedRevision: revision,
      input: { form: "cue", fields: { title } },
    });
    return call(page, "timetrail.editor.propose", {
      expectedRevision: revision,
    });
  };
  await proposeTitle("Agent title", 1);
  await call(page, "timetrail.editor.open", {
    form: "cue",
    itemId: cueId,
    expectedRevision: 1,
  });
  await page.getByLabel("Body", { exact: true }).fill("Human body");
  await page.getByRole("button", { name: "Save cue", exact: true }).click();
  await expect.poll(async () => (await inspect(page)).revision).toBe(2);
  await page
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview proposal", exact: true })
    .click();
  await expect(
    page.getByText("PROPOSAL PREVIEW · UNSAVED", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Accept proposal", exact: true })
    .click();
  await expect.poll(async () => (await inspect(page)).revision).toBe(3);
  expect(
    (
      await call(page, "timetrail.editor.inspect", {
        collection: "cues",
        itemId: cueId,
      })
    ).item,
  ).toMatchObject({ title: "Agent title", body: "Human body" });
  await proposeTitle("Competing title", 3);
  await call(page, "timetrail.editor.open", {
    form: "cue",
    itemId: cueId,
    expectedRevision: 3,
  });
  await page.getByLabel("Title", { exact: true }).fill("Human title");
  await page.getByRole("button", { name: "Save cue", exact: true }).click();
  await expect.poll(async () => (await inspect(page)).revision).toBe(4);
  await page
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Accept proposal", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Item 1 conflicts with newer edits at update cue.title",
  );
  expect((await inspect(page)).revision).toBe(4);
  expect(
    (
      await call(page, "timetrail.editor.inspect", {
        collection: "cues",
        itemId: cueId,
      })
    ).item.title,
  ).toBe("Human title");
});
test("accept item reviews required dependencies, cancellation preserves state and independent proposals still accept", async ({
  page,
}) => {
  await create(page);
  await call(page, "timetrail.build.propose", {
    title: "Dependent draft",
    topic: "Test",
    targetSeconds: 30,
    segments: [{ title: "A card" }],
  });
  await page.getByText("Review individual changes", { exact: true }).click();
  await page
    .getByRole("button", { name: "Accept item 2", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Accept related changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await inspect(page)).revision).toBe(0);
  await page
    .getByRole("button", { name: "Accept item 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Accept related changes", exact: true })
    .click();
  await ready(page);
  await expect.poll(async () => (await inspect(page)).revision).toBe(1);
  expect((await inspect(page)).title).toBe("Quality fixture");
  await page
    .getByRole("button", { name: "Accept proposal", exact: true })
    .click();
  await expect
    .poll(async () => (await inspect(page)).title)
    .toBe("Dependent draft");
  for (const title of ["First independent", "Second independent"])
    await call(page, "timetrail.cues.propose", {
      rationale: title,
      cues: [
        { kind: "note", title, start: 1, end: 5, body: "Independent note" },
      ],
    });
  await page
    .locator(".proposal-card")
    .filter({ hasText: "First independent" })
    .getByRole("button", { name: "Accept proposal", exact: true })
    .click();
  await expect.poll(async () => (await inspect(page)).revision).toBe(3);
  await page
    .locator(".proposal-card")
    .filter({ hasText: "Second independent" })
    .getByRole("button", { name: "Accept proposal", exact: true })
    .click();
  await expect.poll(async () => (await inspect(page)).revision).toBe(4);
  await page.reload();
  await ready(page);
  expect((await inspect(page)).revision).toBe(4);
  expect((await inspect(page)).proposals).toEqual([]);
});
test("styled grouped hotspots render, quality review finds blockers and selected fixes improve the film", async ({
  page,
}) => {
  await create(page);
  await call(page, "timetrail.build.propose", {
    title: "Hotspot film",
    topic: "Test",
    targetSeconds: 30,
    segments: [{ title: "Picture" }],
  });
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect.poll(async () => (await inspect(page)).revision).toBe(1);
  await ready(page);
  await call(page, "timetrail.hotspots.propose", {
    expectedRevision: 1,
    group: "Explanations",
    style: {
      preset: "filled",
      shape: "rectangle",
      color: "#99aabb",
      backgroundColor: "#112233",
      textColor: "#112233",
      borderWidth: 3,
    },
    create: ["Alpha", "Beta"].map((title) => ({
      title,
      body: `Explanation for ${title}`,
      start: 1,
      end: 10,
      position: { x: 20, y: 20, width: 60, height: 60 },
    })),
  });
  await page
    .getByRole("button", { name: "Accept proposal", exact: true })
    .click();
  await ready(page);
  await call(page, "timetrail.playback.control", {
    action: "seek",
    timeSeconds: 2,
  });
  const frame = page.frameLocator(
    'iframe[title="FrameTrail interactive preview"]',
  );
  await expect(frame.locator(".hotspot-element").first()).toHaveCSS(
    "background-color",
    "rgb(17, 34, 51)",
  );
  await expect(frame.locator(".hotspot-element").first()).toHaveCSS(
    "border-radius",
    "0px",
  );
  const review = await call(page, "timetrail.quality.review", {
    checkMedia: false,
  });
  expect(review.screensReviewed).toBe(1);
  expect(review.findings.map((f: { code: string }) => f.code)).toEqual(
    expect.arrayContaining(["blocking_hotspots", "low_contrast"]),
  );
  const fixes = review.findings
    .filter((f: { fixable: boolean }) => f.fixable)
    .map((f: { id: string }) => f.id);
  const proposed = await call(page, "timetrail.quality.propose", {
    reportId: review.reportId,
    findingIds: fixes,
    expectedRevision: 2,
  });
  expect((await inspect(page)).revision).toBe(2);
  await call(page, "timetrail.proposals.preview", {
    action: "preview",
    proposalId: proposed.proposalId,
  });
  await expect(
    page.getByText("PROPOSAL PREVIEW · UNSAVED", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Accept proposal", exact: true })
    .click();
  await ready(page);
  const after = await call(page, "timetrail.quality.review", {
    checkMedia: false,
  });
  expect(
    after.findings.some((f: { code: string }) =>
      ["blocking_hotspots", "low_contrast"].includes(f.code),
    ),
  ).toBe(false);
  const cues = await call(page, "timetrail.editor.inspect", {
    collection: "cues",
  });
  expect(JSON.stringify(cues)).toContain("Explanations");
  await call(page, "timetrail.playback.control", {
    action: "seek",
    timeSeconds: 2,
  });
  await expect(frame.locator(".hotspot-label").first()).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await expect(frame.locator(".hotspot-element").first()).toHaveCSS(
    "background-color",
    "rgb(17, 34, 51)",
  );
  await page
    .getByRole("button", { name: "Review film quality", exact: true })
    .click();
  await page.getByRole("button", { name: "Scan film", exact: true }).click();
  await expect(page.getByText(/1 screens, 1 clips/)).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
});
test("media checks report a broken source without claiming the film passed", async ({
  page,
  baseURL,
}) => {
  await page.route("**/quality-broken.mp4", (route) =>
    route.fulfill({ status: 404, contentType: "video/mp4", body: "missing" }),
  );
  await page.route("**/quality-broken-image.svg", (route) =>
    route.fulfill({
      status: 404,
      contentType: "image/svg+xml",
      body: "missing",
    }),
  );
  await create(page);
  const imported = await call(page, "timetrail.media.import", {
    items: [
      { url: "https://quality-fixtures.test/quality-broken.mp4" },
      ...Array.from({ length: 12 }, (_, i) => ({
        url: `${baseURL}/demo-assets/dna.svg?quality=${i}`,
      })),
    ],
  });
  expect(imported.media).toHaveLength(13);
  await call(page, "timetrail.build.propose", {
    title: "Broken-source fixture",
    topic: "Test",
    targetSeconds: 30,
    segments: [
      ...imported.media.map((m: { id: string }, i: number) => ({
        title: `Clip ${i}`,
        mediaId: m.id,
      })),
      {
        title: "Card with broken image",
        card: {
          layout: "image-focus",
          heading: "Missing image",
          body: "QA fixture",
          image: "https://quality-fixtures.test/quality-broken-image.svg",
        },
      },
    ],
  });
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect.poll(async () => (await inspect(page)).revision).toBe(1);
  const review = await call(page, "timetrail.quality.review");
  expect(
    review.findings.some(
      (f: { code: string; severity: string }) =>
        f.code === "media_unavailable" && f.severity === "error",
    ),
  ).toBe(true);
  expect(review.remainingMediaCount).toBe(2);
  expect(review.mediaChecked).toBe(12);
  const complete = await call(page, "timetrail.quality.review", {
    reportId: review.reportId,
  });
  expect(complete.mediaChecked).toBe(14);
  expect(complete.remainingMediaCount).toBe(0);
  expect(
    complete.findings.filter(
      (f: { code: string }) => f.code === "media_unavailable",
    ),
  ).toHaveLength(2);
  expect((await inspect(page)).revision).toBe(1);
});

test("paused video seeking shows styled hotspots at the correct source time, including after the end", async ({
  page,
  baseURL,
}) => {
  await create(page);
  const imported = await call(page, "timetrail.media.import", {
    items: [{ url: `${baseURL}/example-assets/europa-nasa.mp4` }],
  });
  await call(page, "timetrail.build.propose", {
    title: "Video hotspots",
    topic: "QA",
    targetSeconds: 15,
    segments: [{ title: "Footage", mediaId: imported.media[0].id }],
  });
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect.poll(async () => (await inspect(page)).revision).toBe(1);
  await call(page, "timetrail.hotspots.propose", {
    expectedRevision: 1,
    layout: "grid",
    group: "Video callouts",
    style: {
      shape: "rectangle",
      backgroundColor: "#112233",
      textColor: "#ffffff",
    },
    create: [
      {
        title: "Inspect the footage",
        body: "This control must render above the real video.",
        start: 1,
        end: 12,
      },
    ],
  });
  await page
    .getByRole("button", { name: "Accept proposal", exact: true })
    .click();
  await expect.poll(async () => (await inspect(page)).revision).toBe(2);
  await ready(page);
  const frame = page.frameLocator(
    'iframe[title="FrameTrail interactive preview"]',
  );
  for (const afterEnd of [false, true]) {
    if (afterEnd)
      await call(page, "timetrail.playback.control", {
        action: "seek",
        timeSeconds: 15,
      });
    await call(page, "timetrail.playback.control", {
      action: "seek",
      timeSeconds: 4,
    });
    await expect
      .poll(() =>
        frame
          .locator("#media-player video")
          .evaluate((v) => (v as HTMLVideoElement).currentTime),
      )
      .toBeCloseTo(4, 1);
    const hotspot = frame
      .locator("#media-player")
      .getByRole("link", { name: "Inspect the footage", exact: true });
    await expect(hotspot).toBeVisible();
    await expect(hotspot).toHaveCSS("background-color", "rgb(17, 34, 51)");
    await hotspot.click();
    await expect(
      page.getByRole("textbox", { name: "Title", exact: true }),
    ).toHaveValue("Inspect the footage");
    await page
      .getByRole("button", { name: "Close inspector", exact: true })
      .click();
  }
  const ranges = await page.evaluate(async () => {
    const results = [];
    for (const range of ["bytes=0-15", "bytes=-16", "bytes=999999999-"]) {
      const response = await fetch("/example-assets/europa-nasa.mp4", {
        headers: { Range: range },
      });
      results.push({
        status: response.status,
        length: (await response.arrayBuffer()).byteLength,
        range: response.headers.get("Content-Range"),
      });
    }
    return results;
  });
  expect(ranges[0]).toMatchObject({
    status: 206,
    length: 16,
    range: expect.stringMatching(/^bytes 0-15\//),
  });
  expect(ranges[1]).toMatchObject({ status: 206, length: 16 });
  expect(ranges[2]).toMatchObject({ status: 416, length: 0 });
});
