import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { unzipSync, strFromU8 } from "fflate";
test("generated SVG renders, ZIP round trips, and exported viewers run on a separate static host", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const image = page
    .frameLocator('iframe[title="FrameTrail interactive preview"]')
    .locator("#player .overlayElement img")
    .first();
  await expect
    .poll(() => image.evaluate((e) => (e as HTMLImageElement).naturalWidth))
    .toBe(960);
  await page.screenshot({ path: "docs/demo.png", fullPage: true });
  for (const format of ["project-zip", "standalone-html", "static-pack"]) {
    await page
      .getByRole("combobox", { name: "Export format" })
      .selectOption(format);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "Your export is ready",
    );
    const downloaded = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download", exact: true }).click();
    const download = await downloaded;
    const bytes = await readFile((await download.path())!);
    await page.getByRole("button", { name: "Close dialog" }).click();
    if (format === "project-zip") {
      const files = unzipSync(bytes);
      expect(files["project.json"]).toBeDefined();
      expect(files["manifest.json"]).toBeDefined();
      expect(files["thumbnail.webp"]).toBeDefined();
      expect(JSON.parse(strFromU8(files["manifest.json"]!)).format).toBe(
        "timetrail-pack",
      );
      await page.getByLabel("Import local files").setInputFiles({
        name: "story.zip",
        mimeType: "application/zip",
        buffer: bytes,
      });
      await expect(page).toHaveURL(/\/project\//);
      await expect(
        page.getByRole("button", {
          name: "How DNA Becomes a Protein remix",
          exact: true,
        }),
      ).toBeVisible();
      continue;
    }
    const files: Record<string, Uint8Array> =
      format === "standalone-html" ? { "index.html": bytes } : unzipSync(bytes);
    const server = createServer((req, res) => {
      const path = (req.url || "/").slice(1) || "index.html";
      const file = files[path];
      if (!file) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.setHeader(
        "Content-Type",
        path.endsWith(".html")
          ? "text/html"
          : path.endsWith(".webp")
            ? "image/webp"
            : path.endsWith(".json")
              ? "application/json"
              : "application/octet-stream",
      );
      res.end(file);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Static test host failed.");
    const viewer = await context.newPage();
    const errors: string[] = [];
    viewer.on("pageerror", (e) => errors.push(e.message));
    try {
      await viewer.goto(`http://127.0.0.1:${address.port}/`);
      await expect(viewer.locator("#status")).toContainText("Ready.");
      const image = viewer
        .frameLocator("iframe")
        .locator("#player .overlayElement img")
        .first();
      await expect
        .poll(() => image.evaluate((e) => (e as HTMLImageElement).naturalWidth))
        .toBe(960);
      await viewer.getByRole("button", { name: "Play", exact: true }).click();
      await expect
        .poll(() => viewer.locator("#seek").inputValue())
        .not.toBe("0");
      await viewer.getByRole("button", { name: "Pause", exact: true }).click();
      await viewer.locator("#seek").fill("2");
      const indicator = viewer
        .frameLocator("iframe")
        .getByRole("button", { name: "Open annotation: DNA", exact: true });
      await expect(indicator).toBeVisible();
      expect((await indicator.boundingBox())!.width).toBeLessThanOrEqual(40);
      await indicator.click();
      const details = viewer
        .frameLocator("iframe")
        .getByRole("dialog", { name: "Annotation details" });
      await expect(details).toContainText("DNA");
      await details.getByRole("button", { name: "Close annotation" }).click();
      await expect(details).toBeHidden();
      await viewer.locator("#seek").fill("84");
      await expect(
        viewer.getByText("What carries a gene's message to the ribosome?"),
      ).toBeVisible();
      const popup = viewer
        .frameLocator("iframe")
        .getByRole("dialog", { name: "Video question" });
      await expect(popup).toBeVisible();
      // A side-panel answer must update the popup too.
      await viewer
        .locator("#context")
        .getByRole("button", { name: "Messenger RNA", exact: true })
        .click();
      await expect(popup.getByRole("status")).toContainText("Correct.");
      await popup
        .getByRole("button", { name: "Continue film", exact: true })
        .click();
      await expect(popup).toBeHidden();
      await expect
        .poll(async () => Number(await viewer.locator("#seek").inputValue()))
        .toBeGreaterThan(84.3);
      await viewer
        .getByRole("button", { name: "Start again", exact: true })
        .click();
      await expect(viewer.locator("#seek")).toBeEnabled();
      await viewer.locator("#seek").fill("84");
      await expect(
        popup.getByRole("button", { name: "Messenger RNA", exact: true }),
      ).toBeEnabled();
      await popup
        .getByRole("button", {
          name: "Close question and continue",
          exact: true,
        })
        .click();
      await expect(popup).toBeHidden();
      expect(errors).toEqual([]);
    } finally {
      await viewer.close();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    }
  }
});
test("multiple URLs are staged by the tool without changing approved media", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const before = await page.evaluate(async () =>
    JSON.parse(
      await window.__TIMETRAIL_TOOLS__["timetrail.project.inspect"]!.execute(
        {},
      ),
    ),
  );
  const result = await page.evaluate(async () =>
    JSON.parse(
      await window.__TIMETRAIL_TOOLS__["timetrail.media.import"]!.execute({
        items: [
          {
            url: "https://www.youtube.com/watch?v=example1",
            label: "Video one",
          },
          { url: "https://vimeo.com/123456", label: "Video two" },
          { url: "javascript:alert(1)", label: "Unsafe" },
        ],
      }),
    ),
  );
  expect(result.media).toHaveLength(2);
  expect(result.warnings).toHaveLength(1);
  await expect(page.getByText("Awaiting review")).toHaveCount(2);
  const after = await page.evaluate(async () =>
    JSON.parse(
      await window.__TIMETRAIL_TOOLS__["timetrail.project.inspect"]!.execute(
        {},
      ),
    ),
  );
  expect(after.revision).toBe(before.revision);
});
test("mobile layout and keyboard dialog closure", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Turn a search/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Import media", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeAttached();
  await expect(
    page.getByRole("button", { name: "Import media", exact: true }),
  ).toBeFocused();
});
