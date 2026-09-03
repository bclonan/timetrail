import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { unzipSync } from "fflate";

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
test("FrameTrail areas stay usable around footage in Studio, Player and the exported Research viewer", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/demo");
  const created = await call(page, "timetrail.project.create", {
    title: "Area smoke test",
    topic: "Europa",
    targetSeconds: 20,
  });
  const imported = await call(page, "timetrail.media.import", {
    items: [
      { url: `${baseURL}/example-assets/europa-nasa.mp4`, label: "Europa" },
    ],
  });
  await call(page, "timetrail.build.propose", {
    title: "Area smoke test",
    topic: "Europa",
    targetSeconds: 20,
    segments: [
      {
        title: "Europa's ocean",
        mediaId: imported.media[0].id,
        narration: "A world of ice and ocean.",
        cards: [
          {
            kind: "note",
            title: "Ice shell",
            body: "An ocean beneath the surface.",
          },
        ],
      },
    ],
  });
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Edit screen", exact: true }).click();
  await page.getByRole("button", { name: "Add area tab", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Area tab 1", exact: true })
      .getByLabel("Tab title"),
  ).toHaveValue("Notes");
  const layoutAreas = [
    {
      area: "right",
      content: "transcript",
      title: "Transcript",
      size: "medium",
      collapsed: false,
    },
    {
      area: "right",
      content: "chapters",
      title: "Chapters",
      size: "medium",
      collapsed: false,
    },
    {
      area: "left",
      content: "text",
      title: "Field notes",
      size: "small",
      collapsed: false,
      text: "Research notes\n".repeat(60),
    },
    {
      area: "top",
      content: "text",
      title: "Mission",
      size: "small",
      collapsed: false,
      text: "Observe Europa from orbit.",
    },
    {
      area: "bottom",
      content: "timelines",
      title: "Timeline",
      size: "small",
      collapsed: false,
    },
  ];
  await call(page, "timetrail.editor.fill", {
    expectedRevision: 1,
    input: { form: "sequence", fields: { layoutAreas } },
  });
  expect((await call(page, "timetrail.project.inspect")).revision).toBe(1);
  await page.getByRole("button", { name: "Save screen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const frame = page.frameLocator(
    'iframe[title="FrameTrail interactive preview"]',
  );
  await page.getByRole("slider", { name: "Seek playback" }).fill("4");
  await expect(frame.locator("#media-status")).toBeHidden();
  await expect
    .poll(() =>
      frame
        .locator("#media-player video")
        .evaluate((v) => (v as HTMLVideoElement).readyState),
    )
    .toBeGreaterThanOrEqual(2);
  for (const name of [
    "Transcript, right area",
    "Field notes, left area",
    "Mission, top area",
    "Timeline, bottom area",
  ])
    await expect(frame.getByRole("tab", { name, exact: true })).toBeVisible();
  await expect(frame.locator("#player .areaRightContainer")).toContainText(
    "A world of ice and ocean.",
  );
  const picture = frame.locator("#picture-layer");
  await expect(
    frame.locator("#player .timelinesContainer .userTimeline"),
  ).toBeVisible();
  await frame
    .locator("#player .timelinesContainer .userTimeline")
    .scrollIntoViewIfNeeded();
  await expect(
    frame.locator("#player .timelinesContainer .userTimeline"),
  ).toBeInViewport();
  const bounds = (await picture.boundingBox())!;
  const right = (await frame
    .locator("#player .areaRightContainer")
    .boundingBox())!;
  const outer = (await page
    .locator('iframe[title="FrameTrail interactive preview"]')
    .boundingBox())!;
  expect(outer.width).toBeLessThanOrEqual(
    (await page.locator(".player-shell").boundingBox())!.width,
  );
  expect(right.x + right.width).toBeLessThanOrEqual(outer.x + outer.width + 2);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(right.x + 2);
  const nativeVideo = (await frame.locator("#media-player").boundingBox())!;
  expect(Math.abs(nativeVideo.width - bounds.width)).toBeLessThan(2);
  await frame
    .getByRole("button", { name: "Close right area", exact: true })
    .press("Enter");
  await expect(frame.locator("#player .areaRightContainer")).toHaveClass(
    /closed/,
  );
  expect((await picture.boundingBox())!.width).toBeGreaterThan(bounds.width);
  await frame
    .getByRole("tab", { name: "Transcript, right area", exact: true })
    .press("Enter");
  await expect(frame.locator("#player .areaRightContainer")).not.toHaveClass(
    /closed/,
  );
  await frame
    .getByRole("tab", { name: "Chapters, right area", exact: true })
    .click();
  await frame
    .locator("#player .areaRightContainer")
    .getByRole("button", { name: /0:00/ })
    .click();
  expect((await call(page, "timetrail.editor.inspect")).time).toBeLessThan(0.2);
  const scroll = frame.locator("#player .areaLeftContainer .contentViewScroll");
  expect(await scroll.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(
    true,
  );
  await scroll.hover();
  await page.mouse.wheel(0, 240);
  await expect
    .poll(() => scroll.evaluate((e) => e.scrollTop))
    .toBeGreaterThan(0);
  await page.getByRole("slider", { name: "Seek playback" }).fill("4");
  await expect(frame.locator("#media-status")).toBeHidden();
  await expect(
    frame.getByRole("button", {
      name: "Open annotation: Ice shell",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/layout-areas-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    frame.getByRole("tab", { name: "Chapters, right area", exact: true }),
  ).toBeVisible();
  const mobilePicture = (await picture.boundingBox())!;
  const mobileOuter = (await page
    .locator('iframe[title="FrameTrail interactive preview"]')
    .boundingBox())!;
  expect(mobileOuter.width).toBeLessThan(390);
  expect(mobilePicture.width).toBeGreaterThan(280);
  expect(mobilePicture.height).toBeGreaterThanOrEqual(120);
  await page.screenshot({
    path: "test-results/layout-areas-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  const inspect = await call(page, "timetrail.project.inspect");
  await page.goto(`/watch/${inspect.projectId || created.projectId}`);
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await expect(
    frame.getByRole("tab", { name: "Transcript, right area", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cinema", exact: true }).click();
  await expect(
    frame.getByRole("tab", { name: "Field notes, left area", exact: true }),
  ).toBeVisible();
  await page.goto(`/project/${inspect.projectId || created.projectId}`);
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Export format" })
    .selectOption("interactive-zip");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Your export is ready");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  const files = unzipSync(
    await readFile((await (await downloadEvent).path())!),
  );
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url || "/").slice(1)) || "index.html";
    const bytes = files[path];
    if (!bytes) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      path.endsWith(".html")
        ? "text/html"
        : path.endsWith(".mp4")
          ? "video/mp4"
          : "application/octet-stream",
    );
    res.end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Export host unavailable");
  const viewer = await context.newPage();
  try {
    await viewer.goto(`http://127.0.0.1:${address.port}/`);
    await expect(viewer.locator("#status")).toContainText("Ready.");
    const exported = viewer.frameLocator("iframe");
    await expect(
      exported.getByRole("tab", {
        name: "Transcript, right area",
        exact: true,
      }),
    ).toBeVisible();
    await exported
      .getByRole("button", { name: "Close right area", exact: true })
      .click();
    await expect(exported.locator("#player .areaRightContainer")).toHaveClass(
      /closed/,
    );
    await exported
      .getByRole("tab", { name: "Transcript, right area", exact: true })
      .click();
    await expect(
      exported.locator("#player .areaRightContainer"),
    ).not.toHaveClass(/closed/);
    expect(errors).toEqual([]);
  } finally {
    await viewer.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
