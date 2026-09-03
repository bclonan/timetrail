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
test("compact notes over footage open details and the position guide edits only the draft", async ({
  page,
  baseURL,
}) => {
  await page.goto("/demo");
  await call(page, "timetrail.project.create", {
    title: "Annotation placement",
    topic: "Notes",
    targetSeconds: 20,
  });
  const media = await call(page, "timetrail.media.import", {
    items: [
      { url: `${baseURL}/example-assets/europa-nasa.mp4`, label: "Europa" },
    ],
  });
  await call(page, "timetrail.build.propose", {
    title: "Annotation placement",
    topic: "Notes",
    targetSeconds: 20,
    segments: [{ title: "Footage", mediaId: media.media[0].id }],
  });
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await call(page, "timetrail.editor.open", {
    form: "cue",
    expectedRevision: 1,
  });
  await call(page, "timetrail.editor.fill", {
    expectedRevision: 1,
    input: {
      form: "cue",
      fields: {
        title: "Small note",
        body: "Read the detail without covering the whole film.",
        start: 0,
        end: 15,
      },
    },
  });
  const inspect = () =>
    call(page, "timetrail.editor.inspect", { collection: "form" });
  expect((await inspect()).placement).toMatchObject({
    width: 4,
    height: 7,
    unit: "percent",
  });
  await page
    .getByRole("button", { name: "Adjust on video", exact: true })
    .click();
  const box = page.getByTestId("cue-position-box");
  await expect(box).toBeVisible();
  await page.getByLabel("X · from left %", { exact: true }).fill("20");
  await expect(box).toHaveCSS("left", /px$/);
  expect((await inspect()).fields.position.x).toBe(20);
  const move = page.getByRole("button", {
    name: "Move annotation",
    exact: true,
  });
  await move.press("ArrowRight");
  expect((await inspect()).fields.position.x).toBe(21);
  const bounds = (await move.boundingBox())!;
  await page.mouse.move(bounds.x + 4, bounds.y + 4);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 60, bounds.y + 30, { steps: 4 });
  expect((await inspect()).fields.position.x).toBeGreaterThan(21);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await inspect()).fields.position.x).toBe(21);
  await page
    .getByRole("button", { name: "Resize annotation", exact: true })
    .press("ArrowRight");
  expect((await inspect()).fields.position.width).toBe(5);
  expect((await call(page, "timetrail.project.inspect")).revision).toBe(1);
  await page.getByRole("button", { name: "Save cue", exact: true }).click();
  await expect
    .poll(async () => (await call(page, "timetrail.project.inspect")).revision)
    .toBe(2);
  await page
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  await expect(box).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const frame = page.frameLocator(
    'iframe[title="FrameTrail interactive preview"]',
  );
  const indicator = frame.getByRole("button", {
    name: "Open annotation: Small note",
    exact: true,
  });
  await expect(indicator).toHaveCount(1);
  const marker = (await indicator.boundingBox())!;
  expect(marker.width).toBeLessThanOrEqual(40);
  expect(marker.height).toBeLessThanOrEqual(40);
  await indicator.click();
  const details = frame.getByRole("dialog", { name: "Annotation details" });
  await expect(details).toContainText(
    "Read the detail without covering the whole film.",
  );
  await details
    .getByRole("button", { name: "Close annotation" })
    .press("Escape");
  await expect(details).toBeHidden();
  await page
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(indicator).toBeVisible();
  expect((await indicator.boundingBox())!.width).toBeGreaterThanOrEqual(24);
  expect((await call(page, "timetrail.project.inspect")).revision).toBe(2);
});
