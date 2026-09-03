import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { unzipSync, strFromU8 } from "fflate";

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
const ready = (page: Page) =>
  expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
const inspect = (page: Page) => call(page, "timetrail.project.inspect");

test("no supplied video directs sourcing, recovers from empty search and uses found footage", async ({
  page,
  baseURL,
}) => {
  const project = await create(page, "Find ocean footage");
  expect(project.videoSourcing.status).toBe("find_source_video");
  expect(project.videoSourcing.suggestedInput.type).toBe("video");
  // A supplied still does not satisfy a request for footage.
  await call(page, "timetrail.media.import", {
    items: [{ url: `${baseURL}/example-assets/europa-orbit.png` }],
  });
  expect((await inspect(page)).videoSourcing.status).toBe("find_source_video");
  let attempts = 0;
  await page.route(
    "https://commons.wikimedia.org/w/api.php?**",
    async (route) => {
      attempts++;
      await route.fulfill({
        json:
          attempts === 1
            ? { query: { pages: {} } }
            : {
                query: {
                  pages: {
                    "1": {
                      title: "File:Footage smoke fixture.mp4",
                      imageinfo: [
                        {
                          url: `${baseURL}/example-assets/europa-nasa.mp4`,
                          descriptionurl:
                            "https://commons.wikimedia.org/wiki/File:Footage_smoke_fixture.mp4",
                          extmetadata: {
                            Artist: {
                              value:
                                "NASA footage reused in a mechanical test fixture",
                            },
                            LicenseShortName: {
                              value: "NASA media guidelines",
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
      });
    },
  );
  const empty = await call(
    page,
    "timetrail.media.search",
    project.videoSourcing.suggestedInput,
  );
  expect(empty.count).toBe(0);
  expect(empty.next).toBe("timetrail.media.search");
  expect(empty.recovery).toContain("other provider");
  const found = await call(page, "timetrail.media.search", {
    query: "ocean",
    provider: "commons",
    type: "video",
  });
  const source = await call(page, "timetrail.media.resolve", {
    provider: "commons",
    resultId: found.results[0].id,
    type: "video",
    stage: true,
  });
  expect(source.attribution.creator).toContain("NASA");
  expect((await inspect(page)).videoSourcing.status).toBe(
    "video_candidates_available",
  );
  expect((await inspect(page)).revision).toBe(0);
  await call(page, "timetrail.build.propose", {
    title: "Found footage",
    topic: "Europa",
    targetSeconds: 15,
    segments: [
      {
        title: "The source video",
        mediaId: source.mediaId,
        summary: "Credited footage for the sourcing smoke test.",
      },
    ],
  });
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await ready(page);
  const clips = await call(page, "timetrail.editor.inspect", {
    collection: "clips",
  });
  expect(JSON.stringify(clips)).toContain(source.mediaId);
  const video = page
    .frameLocator('iframe[title="FrameTrail interactive preview"]')
    .locator("#media-player video")
    .first();
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0.5);
  await expect
    .poll(async () => Number((await inspect(page)).playhead))
    .toBeGreaterThan(0.5);
  expect(attempts).toBe(2);
});
async function create(page: Page, title: string) {
  await page.goto("/examples");
  await expect(
    page.getByRole("heading", { name: "Give your agent a film to make." }),
  ).toBeVisible();
  const p = await call(page, "timetrail.project.create", {
    title,
    topic: title,
    targetSeconds: 150,
  });
  await ready(page);
  return p;
}
async function download(page: Page, format: string) {
  await call(page, "timetrail.export.prepare", { format });
  const event = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  const d = await event;
  const bytes = await readFile((await d.path())!);
  await page.getByRole("button", { name: "Close dialog" }).click();
  return bytes;
}
test("all 41 prompts are accessible and the five authored Players open with isolated viewing tools", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/examples");
  await expect(page.locator(".prompt-card")).toHaveCount(41);
  expect(
    (await call(page, "timetrail.examples.list", { query: "", limit: 15 }))
      .total,
  ).toBe(41);
  for (const id of ["europa", "phishing", "atlas", "mars", "pizza"]) {
    await page.goto(`/player/example_${id}`);
    await ready(page);
    expect(
      (await call(page, "timetrail.checks.run")).missingAssetMediaIds,
    ).toEqual([]);
    await expect(
      page.locator(".app-header,.timeline,.media-library,.cue-inspector"),
    ).toHaveCount(0);
    const names = await page.evaluate(() =>
      Object.keys(window.__TIMETRAIL_TOOLS__),
    );
    expect(names).not.toContain("timetrail.production.propose");
    expect(names).not.toContain("timetrail.editor.fill");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(async () => Number((await inspect(page)).playhead))
      .toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});
test("Europa creation uploads generated image bytes, downloads footage, previews, saves, exports and reimports", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180000);
  const started = Date.now();
  const project = await create(page, "Europa end-to-end smoke");
  const example = await call(page, "timetrail.examples.get", {
    id: "A",
    includeSpec: true,
  });
  const replacements = new Map<string, string>();
  for (const asset of example.media) {
    if (asset.id === "europa_orbit" || asset.id === "europa_ocean") {
      const bytes = await readFile(
        `public/example-assets/${asset.id === "europa_orbit" ? "europa-orbit" : "europa-ocean"}.png`,
      );
      const u = await call(page, "timetrail.media.upload", {
        action: "begin",
        name: asset.id + ".png",
        mimeType: "image/png",
        sizeBytes: bytes.length,
        attribution: asset.attribution,
      });
      for (let offset = 0; offset < bytes.length; offset += 1024 * 1024)
        await call(page, "timetrail.media.upload", {
          action: "chunk",
          uploadId: u.uploadId,
          offset,
          base64: bytes
            .subarray(offset, offset + 1024 * 1024)
            .toString("base64"),
        });
      const imported = await call(page, "timetrail.media.upload", {
        action: "finish",
        uploadId: u.uploadId,
      });
      expect(imported.bytes).toBe(bytes.length);
      replacements.set(asset.id, imported.mediaId);
    } else {
      const imported = await call(page, "timetrail.media.fetch", {
        url: new URL(asset.source.url).href.replace(
          new URL(asset.source.url).origin,
          baseURL!,
        ),
        name: asset.id === "europa_nasa" ? "europa.mp4" : "cutaway.svg",
        attribution: asset.attribution,
      });
      replacements.set(asset.id, imported.mediaId);
    }
  }
  for (const sequence of example.spec.sequences)
    for (const segment of sequence.storyboard.segments)
      if (segment.mediaId) segment.mediaId = replacements.get(segment.mediaId);
  const proposal = await call(page, "timetrail.production.propose", {
    expectedRevision: 0,
    spec: example.spec,
  });
  expect(proposal.counts.sequences).toBe(3);
  expect((await inspect(page)).revision).toBe(0);
  await call(page, "timetrail.proposals.preview", {
    action: "preview",
    proposalId: proposal.proposalId,
  });
  await expect(
    page.getByText("PROPOSAL PREVIEW · UNSAVED", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await ready(page);
  expect((await inspect(page)).revision).toBe(1);
  const zip = await download(page, "project-zip");
  const files = unzipSync(zip);
  const saved = JSON.parse(strFromU8(files["project.json"]!));
  expect(
    Object.keys(files).filter((n) => n.startsWith("assets/")),
  ).toHaveLength(4);
  expect(saved.presentation.views).toHaveLength(3);
  await page.goto(`/player/${project.projectId}?view=research`);
  await ready(page);
  await expect(
    page.getByRole("heading", { name: "Evidence, not a discovery of life" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".transcript-line")
      .evaluateAll((lines) =>
        lines.every((line) => line.scrollWidth <= line.clientWidth + 1),
      ),
  ).toBe(true);
  await page.getByRole("slider", { name: "Seek playback" }).fill("55");
  const time = (await inspect(page)).playhead;
  await page.getByRole("button", { name: "Cinema", exact: true }).click();
  expect((await inspect(page)).playhead).toBe(time);
  await page
    .getByRole("button", { name: "Explore the hidden ocean", exact: true })
    .click();
  await ready(page);
  expect((await inspect(page)).sequenceId).not.toBe(project.sequenceId);
  const html = await download(page, "standalone-html");
  expect(html.toString()).toContain("data:image/png;base64,");
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(html);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Static host unavailable.");
  const exported = await context.newPage();
  const exportErrors: string[] = [];
  exported.on("pageerror", (e) => {
    exportErrors.push(e.message);
    console.error("Exported viewer:", e.message);
  });
  try {
    await exported.goto(`http://127.0.0.1:${address.port}/?view=research`);
    await expect(exported.locator("#status")).toContainText("Ready.");
    await expect(
      exported.getByRole("heading", {
        name: "Evidence, not a discovery of life",
      }),
    ).toBeVisible();
    await exported
      .getByRole("button", { name: "Ocean", exact: true })
      .first()
      .click();
    await expect(exported.locator("#status")).toContainText("Ready.");
    await exported.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(() => exported.locator("#seek").inputValue())
      .not.toBe("0");
    expect(exportErrors).toEqual([]);
  } finally {
    await exported.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
  await page.goto("/demo");
  await ready(page);
  await page.getByLabel("Import local files").setInputFiles({
    name: "europa.zip",
    mimeType: "application/zip",
    buffer: zip,
  });
  await ready(page);
  const importedId = (await inspect(page)).id;
  expect(importedId).not.toBe(project.projectId);
  await page.reload();
  await ready(page);
  expect(
    (await call(page, "timetrail.checks.run")).missingAssetMediaIds,
  ).toEqual([]);
  await mkdir("test-results/evidence", { recursive: true });
  await writeFile(
    "test-results/evidence/production.json",
    JSON.stringify(
      {
        scenario: "A",
        elapsedMs: Date.now() - started,
        uploadedImages: 2,
        downloadedFiles: 2,
        sequences: saved.sequences.length,
        localAssetsInZip: 4,
        views: saved.presentation.views.length,
        baseURL,
      },
      null,
      2,
    ),
  );
});
test("checklist gates a branch, alternative endings work, replay resets state and view reload persists", async ({
  page,
}) => {
  await page.goto("/player/example_phishing?view=classroom");
  await ready(page);
  await expect(
    page.getByRole("button", {
      name: "Report after checking sender",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "I checked the sender address" })
    .check();
  await expect(
    page.getByRole("heading", { name: "Evidence notebook" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Report after checking sender", exact: true })
    .click();
  await ready(page);
  await expect(
    page.getByRole("heading", { name: "You stopped the chain", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await ready(page);
  await expect(
    page.getByRole("checkbox", { name: "I checked the sender address" }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Enter your password", exact: true })
    .click();
  await ready(page);
  await expect(
    page.getByRole("heading", { name: "A password went to the wrong place" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await page.reload();
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Research", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("portrait view on a phone keeps controls and panels within the viewport and sharing opens a clean Player", async ({
  page,
  browser,
}) => {
  await create(page, "Portrait test");
  const example = await call(page, "timetrail.examples.get", {
    id: "12",
    includeSpec: true,
  });
  example.spec.presentation.views[1].aspect = "9:16";
  await call(page, "timetrail.production.propose", {
    expectedRevision: 0,
    spec: example.spec,
  });
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await ready(page);
  await call(page, "timetrail.player.control", { action: "open" });
  await ready(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".film-player")).toHaveClass(/portrait/);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const link = await page
    .getByRole("link", { name: "Open Player" })
    .getAttribute("href");
  const fresh = await browser.newContext();
  const shared = await fresh.newPage();
  try {
    await shared.goto(link!);
    await ready(shared);
    await expect(shared.locator(".app-header,.media-library")).toHaveCount(0);
    expect(
      (await call(shared, "timetrail.views.inspect")).presentation.views[1]
        .aspect,
    ).toBe("9:16");
  } finally {
    await fresh.close();
  }
});
