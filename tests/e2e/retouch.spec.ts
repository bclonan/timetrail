import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";

async function rawCall(
  page: Page,
  name: string,
  args: Record<string, unknown> = {},
) {
  return page.evaluate(
    async ({ name, args }) =>
      JSON.parse(await window.__TIMETRAIL_TOOLS__[name]!.execute(args)),
    { name, args },
  );
}
async function call(
  page: Page,
  name: string,
  args: Record<string, unknown> = {},
) {
  const result = await rawCall(page, name, args);
  expect(result.error, JSON.stringify(result)).toBeUndefined();
  return result;
}
async function newProject(page: Page, title: string) {
  await page.goto("/examples");
  await call(page, "timetrail.project.create", {
    title,
    topic: "Frame edit QA",
    targetSeconds: 20,
  });
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
}
async function png(page: Page, color: string, width = 100, height = 80) {
  const data = await page.evaluate(
    ({ color, width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      return canvas.toDataURL("image/png").split(",")[1]!;
    },
    { color, width, height },
  );
  return Buffer.from(data, "base64");
}
async function pixel(page: Page, url: string, x: number, y: number) {
  return page.evaluate(
    async ({ url, x, y }) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      return Array.from(ctx.getImageData(x, y, 1, 1).data);
    },
    { url, x, y },
  );
}
async function importLocal(
  page: Page,
  name: string,
  mimeType: string,
  buffer: Buffer,
) {
  await page
    .getByLabel("Import local files")
    .setInputFiles({ name, mimeType, buffer });
  await expect(
    page.getByRole("button", { name: `Preview ${name}`, exact: true }),
  ).toBeVisible();
}

test("image selection, drawn mask, character references, file handoff and reviewed replacement preserve outside pixels", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await newProject(page, "Image retouch QA");
  const original = await png(page, "#ff0000"),
    edited = await png(page, "#00ff00");
  await importLocal(page, "original.png", "image/png", original);
  await importLocal(
    page,
    "character.png",
    "image/png",
    await png(page, "#ffff00"),
  );
  await page
    .getByRole("button", { name: "Add original.png to timeline", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await call(page, "timetrail.editor.inspect", { collection: "clips" }))
          .items.length,
    )
    .toBe(1);
  const before = await call(page, "timetrail.project.inspect", {
    include: ["media"],
  });
  const originalId = before.media.find(
    (m: any) => m.name === "original.png",
  ).id;
  const referenceId = before.media.find(
    (m: any) => m.name === "character.png",
  ).id;
  await page
    .getByRole("button", {
      name: "Select frames or edit image original.png",
      exact: true,
    })
    .click();
  const clip = (
    await call(page, "timetrail.editor.inspect", { collection: "clips" })
  ).items[0];
  await page
    .getByLabel("Target clip", { exact: true })
    .selectOption(`${before.sequenceId}:${clip.id}`);
  await page
    .getByRole("button", { name: "Capture selected frames", exact: true })
    .click();
  const picture = page.getByAltText("Selected source frame", { exact: true });
  await expect(picture).toBeVisible();
  const svg = page.getByRole("img", {
    name: "Draw edit areas on the frame",
    exact: true,
  });
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.75);
  await page.mouse.up();
  await expect(page.getByLabel("Edit area width")).toBeVisible();
  for (const [field, value] of Object.entries({
    x: 25,
    y: 25,
    width: 50,
    height: 50,
  }))
    await page
      .getByLabel(`Edit area ${field}`, { exact: true })
      .fill(String(value));
  await page
    .getByRole("button", { name: "Save selected areas", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save selected areas", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Edit type", { exact: true })
    .selectOption("replace-character");
  await page
    .getByLabel("Edit instructions", { exact: true })
    .fill(
      "Replace the selected character with the yellow reference. Keep all unselected pixels.",
    );
  await page.getByLabel("Character reference images").selectOption(referenceId);
  await page
    .getByRole("button", { name: "Prepare editing request", exact: true })
    .click();
  await expect(
    page.getByText("Ready for your agent. No AI edit has run yet.", {
      exact: true,
    }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download editing files", exact: true })
    .click();
  const files = unzipSync(
    await readFile((await (await downloadEvent).path())!),
  );
  expect(Object.keys(files)).toEqual(
    expect.arrayContaining([
      "frame-1.png",
      "mask-1.png",
      "reference-1.png",
      "request.txt",
      "manifest.json",
    ]),
  );
  const manifest = JSON.parse(strFromU8(files["manifest.json"]!));
  expect(manifest.source.id).toBe(originalId);
  expect(manifest.mode).toBe("replace-character");
  const request = await call(page, "timetrail.retouch.inspect", {
    jobId: manifest.jobId,
  });
  const transfer = await call(page, "timetrail.retouch.read", {
    jobId: request.id,
    assetId: request.frames[0].assetId,
  });
  expect(transfer.nextOffset).toBeNull();
  expect(
    await pixel(page, `data:image/png;base64,${transfer.base64}`, 10, 10),
  ).toEqual([255, 0, 0, 255]);
  const mask = await call(page, "timetrail.retouch.read", {
    jobId: request.id,
    assetId: request.frames[0].maskAssetId,
  });
  expect(
    await pixel(page, `data:image/png;base64,${mask.base64}`, 50, 40),
  ).toEqual([255, 255, 255, 255]);
  expect(
    await pixel(page, `data:image/png;base64,${mask.base64}`, 5, 5),
  ).toEqual([0, 0, 0, 255]);
  await page
    .getByRole("button", { name: "Copy editing prompt", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "actual edited video",
  );
  await page
    .getByLabel("Upload edited result for this frame", { exact: true })
    .setInputFiles({
      name: "returned.png",
      mimeType: "image/png",
      buffer: edited,
    });
  await expect(
    page.getByLabel("Returned media for this frame", { exact: true }),
  ).not.toHaveValue("");
  await page
    .getByRole("button", { name: "Propose returned edit", exact: true })
    .click();
  const after = page.getByAltText("Returned edit", { exact: true });
  await expect(after).toBeVisible();
  expect(await pixel(page, (await after.getAttribute("src"))!, 50, 40)).toEqual(
    [0, 255, 0, 255],
  );
  expect(await pixel(page, (await after.getAttribute("src"))!, 5, 5)).toEqual([
    255, 0, 0, 255,
  ]);
  expect((await call(page, "timetrail.project.inspect")).revision).toBe(
    before.revision,
  );
  await page
    .getByRole("button", { name: "Preview returned edit", exact: true })
    .click();
  await expect(
    page.getByText("PROPOSAL PREVIEW · UNSAVED", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect
    .poll(async () => (await call(page, "timetrail.project.inspect")).revision)
    .toBeGreaterThan(before.revision);
  const state = await call(page, "timetrail.project.inspect", {
    include: ["media"],
  });
  expect(state.media.some((m: any) => m.id === originalId)).toBe(true);
  await page.reload();
  const saved = await call(page, "timetrail.retouch.inspect", {
    jobId: request.id,
  });
  expect(saved.proposalId).toBeTruthy();
  expect(saved.frames[0].regions).toEqual([
    { x: 25, y: 25, width: 50, height: 50 },
  ]);
  await page.getByRole("button", { name: "Frame edits", exact: true }).click();
  await page
    .getByLabel("Saved editing request", { exact: true })
    .selectOption(saved.id);
  await expect(
    page.getByAltText("Selected source frame", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/retouch-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("video frames can return as still holds or an actual replacement video without saving the preview", async ({
  page,
}) => {
  await newProject(page, "Video retouch QA");
  const bytes = await readFile(
    resolve("public/example-assets/europa-nasa.mp4"),
  );
  await importLocal(page, "source.mp4", "video/mp4", bytes);
  await page
    .getByRole("button", { name: "Add source.mp4 to timeline", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await call(page, "timetrail.editor.inspect", { collection: "clips" }))
          .items.length,
    )
    .toBe(1);
  const inspect = await call(page, "timetrail.editor.inspect", {
    collection: "clips",
  });
  const initial = await call(page, "timetrail.project.inspect", {
    include: ["media"],
  });
  const mediaId = initial.media.find((m: any) => m.name === "source.mp4").id;
  // Inspect the actual saved model through the editor's typed collection API.
  const clipId = inspect.clips?.[0]?.id || inspect.items?.[0]?.id;
  expect(clipId, JSON.stringify(inspect)).toBeTruthy();
  let job = await call(page, "timetrail.retouch.capture", {
    expectedRevision: initial.revision,
    mediaId,
    sequenceId: initial.sequenceId,
    clipId,
    sourceSeconds: [1, 3],
  });
  expect(job.frames).toHaveLength(2);
  expect(job.frames.map((f: any) => f.sourceSeconds)).toEqual([1, 3]);
  for (const f of job.frames)
    job = await call(page, "timetrail.retouch.mask", {
      jobId: job.id,
      expectedVersion: job.version,
      frameId: f.id,
      regions: [{ x: 20, y: 20, width: 30, height: 30 }],
    });
  job = await call(page, "timetrail.retouch.prepare", {
    jobId: job.id,
    expectedVersion: job.version,
    mode: "replace-character",
    instruction:
      "Replace the selected subject, preserving the rest of the source.",
  });
  const invalid = await rawCall(page, "timetrail.retouch.propose", {
    jobId: job.id,
    expectedVersion: job.version,
    expectedRevision: initial.revision,
    placement: "replace-clip",
    results: [{ frameId: job.frames[0].id, mediaId }],
  });
  expect(invalid.error).toContain("actual edited file");
  const upload = await call(page, "timetrail.media.upload", {
    action: "begin",
    name: "returned-video.mp4",
    mimeType: "video/mp4",
    sizeBytes: bytes.length,
  });
  for (let offset = 0; offset < bytes.length; offset += 512000)
    await call(page, "timetrail.media.upload", {
      action: "chunk",
      uploadId: upload.uploadId,
      offset,
      base64: bytes.subarray(offset, offset + 512000).toString("base64"),
    });
  const returned = await call(page, "timetrail.media.upload", {
    action: "finish",
    uploadId: upload.uploadId,
  });
  const videoProposal = await call(page, "timetrail.retouch.propose", {
    jobId: job.id,
    expectedVersion: job.version,
    expectedRevision: initial.revision,
    placement: "replace-clip",
    results: [{ frameId: job.frames[0].id, mediaId: returned.mediaId }],
  });
  await call(page, "timetrail.proposals.preview", {
    action: "preview",
    proposalId: videoProposal.proposalId,
  });
  await expect(
    page.getByText("PROPOSAL PREVIEW · UNSAVED", { exact: true }),
  ).toBeVisible();
  await call(page, "timetrail.proposals.preview", { action: "restore" });
  // A new request version can propose still holds without accepting the video alternative.
  job = await call(page, "timetrail.retouch.inspect", { jobId: job.id });
  job = await call(page, "timetrail.retouch.prepare", {
    jobId: job.id,
    expectedVersion: job.version,
    mode: "inpaint",
    instruction: "Retouch the two selected frame areas.",
  });
  const resultBytes = await png(
    page,
    "#00ff00",
    job.frames[0].width,
    job.frames[0].height,
  );
  const u = await call(page, "timetrail.media.upload", {
    action: "begin",
    name: "edited-frame.png",
    mimeType: "image/png",
    sizeBytes: resultBytes.length,
  });
  await call(page, "timetrail.media.upload", {
    action: "chunk",
    uploadId: u.uploadId,
    offset: 0,
    base64: resultBytes.toString("base64"),
  });
  const image = await call(page, "timetrail.media.upload", {
    action: "finish",
    uploadId: u.uploadId,
  });
  const holdProposal = await call(page, "timetrail.retouch.propose", {
    jobId: job.id,
    expectedVersion: job.version,
    expectedRevision: initial.revision,
    placement: "frame-holds",
    results: job.frames.map((f: any) => ({
      frameId: f.id,
      mediaId: image.mediaId,
      holdSeconds: 0.5,
    })),
  });
  const detail = await call(page, "timetrail.proposals.list", {});
  expect(JSON.stringify(detail)).toContain(holdProposal.proposalId);
  await call(page, "timetrail.proposals.preview", {
    action: "preview",
    proposalId: holdProposal.proposalId,
  });
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await call(page, "timetrail.playback.control", {
    action: "seek",
    timeSeconds: 1.25,
  });
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  expect((await call(page, "timetrail.project.inspect")).revision).toBe(
    initial.revision,
  );
});

test("capture reports unsupported and CORS-blocked sources without saving a request", async ({
  page,
}) => {
  await newProject(page, "Blocked capture QA");
  const validImage = await png(page, "#0000ff");
  await page.route("https://capture-denied.test/image.png", (route) =>
    route.fulfill({
      status: 200,
      body: validImage,
      contentType: "image/png",
      headers: { "access-control-allow-origin": "https://another-origin.test" },
    }),
  );
  const imported = await call(page, "timetrail.media.import", {
    items: [
      { url: "https://capture-denied.test/image.png", typeHint: "image" },
    ],
  });
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect
    .poll(async () => (await call(page, "timetrail.project.inspect")).revision)
    .toBe(1);
  const state = await call(page, "timetrail.project.inspect");
  const denied = await rawCall(page, "timetrail.retouch.capture", {
    expectedRevision: state.revision,
    mediaId: imported.media[0].id,
  });
  expect(denied.error).toMatch(/cross-origin|capture/);
  expect((await call(page, "timetrail.retouch.inspect")).jobs).toEqual([]);
  const embedded = await call(page, "timetrail.media.import", {
    items: [{ url: "https://www.youtube.com/watch?v=fixture" }],
  });
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect
    .poll(async () => (await call(page, "timetrail.project.inspect")).revision)
    .toBeGreaterThan(state.revision);
  const latest = await call(page, "timetrail.project.inspect");
  const unsupported = await rawCall(page, "timetrail.retouch.capture", {
    expectedRevision: latest.revision,
    mediaId: embedded.media[0].id,
  });
  expect(unsupported.error).toContain("Embedded YouTube and Vimeo");
});
