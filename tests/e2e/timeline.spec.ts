import { test, expect, type Page, type Locator } from "@playwright/test";
async function inspect(page: Page, collection = "state", itemId?: string) {
  return page.evaluate(
    async (args) =>
      JSON.parse(
        await window.__TIMETRAIL_TOOLS__["timetrail.editor.inspect"]!.execute(
          args,
        ),
      ),
    { collection, itemId },
  );
}
async function ready(page: Page) {
  await page.goto(
    (process.env.TIMETRAIL_BASE_URL || "http://127.0.0.1:4173") + "/demo",
  );
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
}
async function coords(item: Locator, handle?: "start" | "end") {
  const control = handle
    ? item.locator(`.timeline-handle.${handle}`)
    : item.locator(".timeline-body");
  await control.scrollIntoViewIfNeeded();
  const b = (await control.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
const item = (page: Page, id: string) => page.locator(`[data-item-id="${id}"]`);
async function begin(
  page: Page,
  target: Locator,
  deltaSeconds: number,
  handle?: "start" | "end",
) {
  const point = await coords(target, handle);
  const track = (await page.locator(".lane-track.clips").boundingBox())!;
  await page.keyboard.down("Shift");
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + (deltaSeconds / 90) * track.width, point.y, {
    steps: 10,
  });
}
async function drop(page: Page) {
  await page.mouse.up();
  await page.keyboard.up("Shift");
}

test("drag reorders clips and their cues, saves once, and supports undo, redo and reload", async ({
  page,
}) => {
  await ready(page);
  const clips = (await inspect(page, "clips")).items;
  const first = item(page, clips[0].id);
  const before = await inspect(page);
  const cues = (await inspect(page, "cues")).items;
  const chapter = cues.find(
    (c: { kind: string; start: number }) =>
      c.kind === "chapter" && c.start === 0,
  );
  await begin(page, first, 51);
  await expect(first).toHaveAttribute("data-start", "45");
  expect((await inspect(page)).revision).toBe(before.revision);
  await drop(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () => (await inspect(page)).revision)
    .toBe(before.revision + 1);
  expect((await inspect(page, "cues", chapter.id)).item.start).toBe(45);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(first).toHaveAttribute("data-start", "0");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(first).toHaveAttribute("data-start", "45");
  await page.reload();
  await expect(first).toHaveAttribute("data-start", "45");
  expect((await inspect(page)).revision).toBe(before.revision + 3);
});
test("cue dragging and both resize handles update timing, while Escape and pointer cancellation discard previews", async ({
  page,
}) => {
  await ready(page);
  const cues = (await inspect(page, "cues")).items;
  const cue = cues.find((c: { kind: string }) => c.kind === "definition");
  const target = item(page, cue.id);
  const full = (await inspect(page, "cues", cue.id)).item;
  await begin(page, target, 4);
  await drop(page);
  await expect
    .poll(async () => (await inspect(page, "cues", cue.id)).item.start)
    .toBeCloseTo(full.start + 4, 1);
  await begin(page, target, 3, "end");
  await drop(page);
  await expect
    .poll(async () => (await inspect(page, "cues", cue.id)).item.end)
    .toBeCloseTo(full.end + 7, 1);
  await begin(page, target, 2, "start");
  await drop(page);
  await expect
    .poll(async () => (await inspect(page, "cues", cue.id)).item.start)
    .toBeCloseTo(full.start + 6, 1);
  const before = await inspect(page);
  const original = (await inspect(page, "cues", cue.id)).item;
  await begin(page, target, 6);
  await page.keyboard.press("Escape");
  await drop(page);
  expect((await inspect(page)).revision).toBe(before.revision);
  await expect(target).toHaveAttribute("data-start", String(original.start));
  await begin(page, target, 6);
  // A browser interruption must discard the preview just like Escape.
  await target.dispatchEvent("pointercancel");
  await drop(page);
  expect((await inspect(page)).revision).toBe(before.revision);
  await expect(target).toHaveAttribute("data-start", String(original.start));
  await target.locator(".timeline-body").click();
  await expect(
    page.getByRole("button", { name: "Save cue", exact: true }),
  ).toBeVisible();
});
test("clip edge trims stay bounded, free-space moves work and a click still opens the timing form", async ({
  page,
}) => {
  await ready(page);
  const clips = (await inspect(page, "clips")).items;
  const first = item(page, clips[0].id);
  await begin(page, first, -7.5, "end");
  await drop(page);
  await expect(first).toHaveAttribute("data-end", "15");
  await begin(page, first, 5, "start");
  await drop(page);
  await expect(first).toHaveAttribute("data-start", "5");
  await begin(page, first, 5);
  await drop(page);
  await expect(first).toHaveAttribute("data-start", "10");
  await expect(first).toHaveAttribute("data-end", "20");
  await begin(page, first, 20, "end");
  await drop(page);
  await expect(first).toHaveAttribute("data-end", "22.5");
  await first.locator(".timeline-body").click();
  await expect(
    page.getByRole("dialog", { name: "Edit clip timing" }),
  ).toBeVisible();
  await expect(page.getByLabel("Timeline start")).toHaveValue("10");
});
test("keyboard editing and WebMCP use the same timeline operations with proposal review", async ({
  page,
}) => {
  await ready(page);
  const clips = (await inspect(page, "clips")).items;
  const first = item(page, clips[0].id);
  await first.locator(".timeline-body").focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(first).toHaveAttribute("data-start", "22.5");
  const before = await inspect(page);
  const result = await page.evaluate(
    async (args) =>
      JSON.parse(
        await window.__TIMETRAIL_TOOLS__["timetrail.timeline.propose"]!.execute(
          args,
        ),
      ),
    {
      itemId: clips[0].id,
      kind: "clip",
      action: "move",
      time: 50,
      expectedRevision: before.revision,
    },
  );
  expect(result.status).toBe("pending_human_review");
  expect((await inspect(page)).revision).toBe(before.revision);
  await page
    .getByRole("button", { name: "Accept proposal", exact: true })
    .click();
  await expect(first).toHaveAttribute("data-start", "45");
});
test("touch dragging works on a horizontally scrolled timeline", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 480, height: 900 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await ready(page);
  const cue = (await inspect(page, "cues")).items.find(
    (c: { kind: string }) => c.kind === "definition",
  );
  const target = item(page, cue.id);
  await target.scrollIntoViewIfNeeded();
  await page.locator(".timeline-scroll").evaluate((el) => (el.scrollLeft = 55));
  const b = (await target.locator(".timeline-body").boundingBox())!;
  const point = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  for (let i = 1; i <= 8; i++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: point.x + i * 5, y: point.y }],
    });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(async () => (await inspect(page)).revision).toBe(1);
  expect((await inspect(page, "cues", cue.id)).item.start).toBeGreaterThan(
    cue.start,
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await context.close();
});
