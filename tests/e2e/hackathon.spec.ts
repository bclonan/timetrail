import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
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
test("hackathon submission covers requirements, illustrates real tools and copies the complete video prompt", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/hackathon");
  await expect(
    page.getByRole("heading", {
      name: "Create the film. Keep control of every edit.",
    }),
  ).toBeVisible();
  for (const name of [
    "Why is this a strong fit for WebMCP?",
    "How does it improve the user experience?",
    "What can people and agents do together?",
    "How did you implement WebMCP?",
  ])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  await page
    .getByRole("button", { name: "Style a group", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run illustration", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Run illustration", exact: true }),
  ).toBeEnabled({ timeout: 10000 });
  await expect(page.locator(".tools-card .reached")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Copy submission text", exact: true })
    .click();
  const submission = await page.evaluate(() => navigator.clipboard.readText());
  expect(submission).toContain("Authentication: none");
  expect(submission).toContain("/player/example_europa");
  await page
    .getByRole("button", { name: "Copy demo video prompt", exact: true })
    .click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("160 seconds");
  expect(prompt).toContain("H.264 MP4 with AAC audio");
  expect(prompt).toContain("Never auto-accept");
  await expect
    .poll(() =>
      page
        .locator(".submission-art img")
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole("link", { name: /Europa field notes/ }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    const frame = document.querySelector("iframe")!;
    frame.contentWindow!.postMessage(
      { type: "browser-integration-ready" },
      location.origin,
    );
    frame.contentWindow!.postMessage(null, location.origin);
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Invalid preview message.", { exact: true }),
  ).toBeHidden();
  await page.evaluate(() => {
    document
      .querySelector("iframe")!
      .contentWindow!.postMessage(
        { type: "TIMETRAIL_PLAYBACK", action: "invalid" },
        location.origin,
      );
  });
  await expect(
    page.getByText("Invalid preview message.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry preview", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});
test("hackathon page fits a phone without clipped comparison cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/hackathon");
  await page
    .getByRole("button", { name: "Review the film", exact: true })
    .click();
  await page
    .getByRole("button", { name: "timetrail.quality.propose", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/hackathon-phone.png",
    fullPage: true,
  });
});
test("a failed source pauses the timeline, offers skip and retries the actual video without changing the project", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let healthy = false;
  await page.route("https://media-recovery.test/clip.mp4", (route) =>
    healthy
      ? route.fulfill({
          path: resolve("public/example-assets/europa-nasa.mp4"),
          contentType: "video/mp4",
        })
      : route.fulfill({
          status: 404,
          body: "missing",
          contentType: "text/plain",
        }),
  );
  await page.goto("/examples");
  await call(page, "timetrail.project.create", {
    title: "Media recovery fixture",
    topic: "QA",
    targetSeconds: 20,
  });
  const imported = await call(page, "timetrail.media.import", {
    items: [{ url: "https://media-recovery.test/clip.mp4", typeHint: "video" }],
  });
  await call(page, "timetrail.build.propose", {
    title: "Recovery",
    topic: "QA",
    targetSeconds: 20,
    segments: [
      { title: "Source", mediaId: imported.media[0].id },
      { title: "Next scene" },
    ],
  });
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const frame = page.frameLocator(
    'iframe[title="FrameTrail interactive preview"]',
  );
  await expect(
    frame.getByText("This clip could not load", { exact: true }),
  ).toBeVisible();
  await expect(frame.locator("#media-player .interfaceModal")).toBeHidden();
  await call(page, "timetrail.playback.control", { action: "play" });
  const state = await call(page, "timetrail.editor.inspect");
  expect(state.paused).toBe(true);
  expect(state.time).toBeLessThan(1);
  await call(page, "timetrail.playback.control", { action: "skip-media" });
  await expect(frame.locator("#media-status")).toBeHidden();
  await expect
    .poll(async () => (await call(page, "timetrail.editor.inspect")).time)
    .toBe(10);
  await call(page, "timetrail.playback.control", {
    action: "seek",
    timeSeconds: 0,
  });
  await expect(
    frame.getByText("This clip could not load", { exact: true }),
  ).toBeVisible();
  healthy = true;
  await frame.getByRole("button", { name: "Retry clip", exact: true }).click();
  await expect(frame.locator("#media-status")).toBeHidden();
  await expect
    .poll(() =>
      frame
        .locator("#media-player video")
        .evaluate((v) => (v as HTMLVideoElement).readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await call(page, "timetrail.playback.control", { action: "play" });
  await expect
    .poll(async () => (await call(page, "timetrail.editor.inspect")).time)
    .toBeGreaterThan(0.5);
  expect((await call(page, "timetrail.editor.inspect")).revision).toBe(1);
  // Failed FrameTrail instances have a delayed source check. It must not break the replacement.
  await page.waitForTimeout(26000);
  await expect(
    page.getByText("Invalid preview message.", { exact: false }),
  ).toBeHidden();
  expect(errors).toEqual([]);
});
