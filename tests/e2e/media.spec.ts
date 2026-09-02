import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

test("local video is stored, plays through FrameTrail, survives reload, and travels inside ZIP", async ({
  page,
}) => {
  await page.goto("/new");
  await page.getByLabel("Project title").fill("Local video test");
  await page.getByLabel("Topic", { exact: true }).fill("Two scenes");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#8ab07b";
    ctx.fillRect(0, 0, 320, 180);
    ctx.fillStyle = "#142b21";
    ctx.font = "22px sans-serif";
    ctx.fillText("Local video", 70, 90);
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const recording = new Promise<Blob>(
      (resolve) =>
        (recorder.onstop = () =>
          resolve(new Blob(chunks, { type: "video/webm" }))),
    );
    recorder.start();
    const drawing = setInterval(() => {
      ctx.fillRect(0, 0, 1, 1);
    }, 80);
    setTimeout(() => {
      recorder.stop();
      clearInterval(drawing);
      stream.getTracks().forEach((t) => t.stop());
    }, 1400);
    return Array.from(new Uint8Array(await (await recording).arrayBuffer()));
  });
  await page.getByLabel("Import local files").setInputFiles({
    name: "local.webm",
    mimeType: "video/webm",
    buffer: Buffer.from(bytes),
  });
  await expect(
    page.getByRole("button", { name: "Preview local.webm", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add local.webm to timeline", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const frame = page.frameLocator(
    'iframe[title="FrameTrail interactive preview"]',
  );
  const video = frame.locator("#media-player video").first();
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit clip local.webm", exact: true })
    .click();
  const firstDuration = Number(
    await page
      .getByRole("spinbutton", { name: "Duration", exact: true })
      .inputValue(),
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Add local.webm to timeline", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("slider", { name: "Seek playback" })
    .fill((firstDuration + 0.1).toFixed(1));
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  await page
    .getByRole("combobox", { name: "Export format" })
    .selectOption("project-zip");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Your export is ready");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  const zip = unzipSync(await readFile((await (await downloaded).path())!));
  expect(
    Object.keys(zip).some(
      (path) => path.startsWith("assets/") && path.endsWith(".webm"),
    ),
  ).toBe(true);
});

test("FrameTrail quiz answers update context and its branch hotspot navigates", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.getByRole("slider", { name: "Seek playback" }).fill("84");
  const frame = page.frameLocator(
    'iframe[title="FrameTrail interactive preview"]',
  );
  await expect(
    frame.getByRole("button", { name: "Messenger RNA", exact: true }),
  ).toBeVisible();
  await frame
    .getByRole("button", { name: "Messenger RNA", exact: true })
    .click();
  await expect(page.locator(".context-card.quiz")).toContainText("Correct.");
  await page.getByRole("slider", { name: "Seek playback" }).fill("72");
  await frame
    .getByRole("link", { name: "Explore mutations", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Active sequence" }),
  ).toHaveValue(/branch/);
  await expect(
    page.getByRole("button", { name: "Return to previous sequence" }),
  ).toBeVisible();
});
