import { test, expect } from "@playwright/test";
test("human and agent workflow, persistence, share, remix, gallery, and lab", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Turn a search/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Start a story" }).click();
  await page
    .getByLabel("Topic", { exact: true })
    .fill("A beginner guide to DNA");
  await page
    .getByLabel("Project title", { exact: true })
    .fill("DNA field notes");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByText("Saved on this device · revision 0"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("My first note");
  await page
    .getByLabel("Body", { exact: true })
    .fill("A useful piece of context.");
  await page.getByRole("button", { name: "Save cue", exact: true }).click();
  await page.getByRole("button", { name: "Close inspector" }).click();
  await expect(page.getByText("0 clips · 1 cues")).toBeVisible();
  await page.getByRole("button", { name: "Load sample proposal" }).click();
  await expect(
    page.getByRole("region", { name: "Agent proposal review" }),
  ).toBeVisible();
  await expect(page.getByText("0 clips · 1 cues")).toBeVisible();
  await page
    .getByRole("button", { name: "Preview proposal", exact: true })
    .click();
  await expect(page.getByText("PROPOSAL PREVIEW · UNSAVED")).toBeVisible();
  await expect(page.getByText("0 clips · 1 cues")).toBeVisible();
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect(page.getByText("4 clips · 22 cues")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /02 Transcription/ }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Messenger RNA", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("4 clips · 22 cues")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const iframe = page.frameLocator(
    'iframe[title="FrameTrail interactive preview"]',
  );
  await expect(
    iframe.locator("#player .overlayElement").first(),
  ).toBeAttached();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Your export is ready");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toContain(".json");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate share code", exact: true })
    .click();
  const code = await page
    .getByLabel("Share code", { exact: true })
    .inputValue();
  expect(code).toMatch(/^TT1\./);
  const watch = await context.newPage();
  await watch.goto("/#/watch?tt=" + code);
  await expect(watch.getByText("SHARED FILM · READ-ONLY")).toBeVisible();
  await expect(
    watch.getByRole("heading", { name: "DNA field notes", exact: true }),
  ).toBeVisible();
  await watch.getByRole("link", { name: "Film library", exact: true }).click();
  await watch
    .getByRole("button", { name: "Save shared copy", exact: true })
    .click();
  await expect(watch).toHaveURL(/\/project\//);
  await watch.getByRole("link", { name: "Discover", exact: true }).click();
  await watch.getByLabel("Search creations").fill("DNA field notes remix");
  await expect(
    watch.getByRole("heading", { name: "DNA field notes remix" }),
  ).toBeVisible();
  await watch.getByRole("link", { name: "WebMCP Lab", exact: true }).click();
  await expect(
    watch.getByRole("heading", { name: "timetrail.project.inspect" }),
  ).toBeVisible();
  await expect(
    watch.getByText("Real WebMCP unavailable", { exact: true }),
  ).toBeVisible();
  await watch.getByRole("button", { name: "Invoke fallback tool" }).click();
  await expect(watch.locator(".tool-result")).toContainText("sequenceId");
  expect(errors).toEqual([]);
});
test("structured proposals require the human review dialog", async ({
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
  const draft = await page.evaluate(async () =>
    JSON.parse(
      await window.__TIMETRAIL_TOOLS__["timetrail.cues.propose"]!.execute({
        cues: [
          {
            kind: "note",
            start: 3,
            end: 8,
            title: "Agent note",
            body: "Review me",
          },
        ],
      }),
    ),
  );
  expect(draft.status).toBe("pending_human_review");
  const after = await page.evaluate(async () =>
    JSON.parse(
      await window.__TIMETRAIL_TOOLS__["timetrail.project.inspect"]!.execute(
        {},
      ),
    ),
  );
  expect(after.revision).toBe(before.revision);
  await page.evaluate((proposalId) => {
    (window as any).reviewResult = window.__TIMETRAIL_TOOLS__[
      "timetrail.proposals.review"
    ]!.execute({ proposalIds: [proposalId], decision: "accept" });
  }, draft.proposalId);
  await expect(page.getByRole("dialog")).toContainText("Accept agent changes?");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await page.evaluate(async () =>
      JSON.parse(await (window as any).reviewResult),
    ),
  ).toMatchObject({ status: "user_cancelled" });
  await page.evaluate((proposalId) => {
    (window as any).reviewResult = window.__TIMETRAIL_TOOLS__[
      "timetrail.proposals.review"
    ]!.execute({ proposalIds: [proposalId], decision: "accept" });
  }, draft.proposalId);
  await page
    .getByRole("button", { name: "Accept changes", exact: true })
    .click();
  expect(
    await page.evaluate(async () =>
      JSON.parse(await (window as any).reviewResult),
    ),
  ).toMatchObject({ status: "human_confirmed", revision: before.revision + 1 });
});
test("quiz, branch, reset, local file import and offline playback", async ({
  page,
  context,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.evaluate(async () =>
    window.__TIMETRAIL_TOOLS__["timetrail.playback.control"]!.execute({
      action: "seek",
      timeSeconds: 84,
    }),
  );
  await expect(
    page.getByText("What carries a gene's message to the ribosome?"),
  ).toBeVisible();
  await page.getByRole("button", { name: /A Messenger RNA/ }).click();
  await expect(page.getByText(/^Correct\./)).toBeVisible();
  await page
    .getByRole("button", { name: "Explore mutations", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Return to previous sequence" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Context Stack" }).getByRole("heading", {
      name: "When the instructions change",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to previous sequence" })
    .click();
  await page.getByLabel("Import local files").setInputFiles({
    name: "caption.vtt",
    mimeType: "text/vtt",
    buffer: Buffer.from(
      "WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nLocal caption",
    ),
  });
  await expect(
    page.getByRole("heading", { name: "caption.vtt" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset demo", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Saved on this device · revision 0"),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () =>
      page.getByRole("slider", { name: "Seek playback" }).inputValue(),
    )
    .not.toBe("0");
  await context.setOffline(false);
});
test("document.modelContext registration and route cleanup contract", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const registry = new Map();
    Object.defineProperty(document, "modelContext", {
      value: {
        registerTool(tool: any, opts: any) {
          registry.set(tool.name, tool);
          opts.signal.addEventListener("abort", () =>
            registry.delete(tool.name),
          );
        },
        getTools() {
          return [...registry.values()];
        },
      },
      configurable: true,
    });
    (window as any).nativeTestRegistry = registry;
  });
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (window as any).nativeTestRegistry.has("timetrail.build.propose"),
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as any).nativeTestRegistry.has("timetrail.build.propose"),
    ),
  ).toBe(false);
  expect(
    await page.evaluate(() =>
      (window as any).nativeTestRegistry.has("timetrail.gallery.search"),
    ),
  ).toBe(true);
});
test("native WebMCP when an experimental browser provides it", async ({
  page,
}) => {
  await page.goto("/demo");
  const available = await page.evaluate(() =>
    Boolean((document as any).modelContext?.getTools),
  );
  test.skip(
    !available,
    "This browser does not expose experimental WebMCP. The API contract test runs in normal CI.",
  );
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const names = await page.evaluate(async () =>
    ((await (document as any).modelContext.getTools()) as any[]).map(
      (t) => t.name,
    ),
  );
  expect(names).toContain("timetrail.build.propose");
});
