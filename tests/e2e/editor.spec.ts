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
const state = (page: Page) => call(page, "timetrail.editor.inspect");
async function open(page: Page, form: string, itemId?: string) {
  const s = await state(page);
  return call(page, "timetrail.editor.open", {
    form,
    itemId,
    expectedRevision: s.revision,
  });
}
async function fill(page: Page, form: string, fields: Record<string, unknown>) {
  return call(page, "timetrail.editor.fill", {
    expectedRevision: (await state(page)).revision,
    input: { form, fields },
  });
}
async function propose(page: Page) {
  return call(page, "timetrail.editor.propose", {
    expectedRevision: (await state(page)).revision,
  });
}
async function accept(page: Page) {
  await page
    .getByRole("button", { name: "Accept proposal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Accept proposal", exact: true }),
  ).toHaveCount(0);
}
test("tools populate visible screen, card, clip and quiz forms and stage changes for human review", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const original = await state(page);
  await open(page, "sequence");
  await fill(page, "sequence", {
    title: "An agent-created screen",
    description: "A separate timeline",
    durationSeconds: 40,
    baseMode: "generated-canvas",
  });
  await expect(page.getByLabel("Screen title", { exact: true })).toHaveValue(
    "An agent-created screen",
  );
  expect((await state(page)).revision).toBe(original.revision);
  const screenForm = await call(page, "timetrail.editor.inspect", {
    collection: "form",
  });
  const screenId = screenForm.itemId;
  await propose(page);
  await accept(page);
  await call(page, "timetrail.editor.control", {
    action: "select-sequence",
    sequenceId: screenId,
  });
  await expect(page.getByLabel("Active sequence")).toHaveValue(screenId);
  await open(page, "card");
  await fill(page, "card", {
    heading: "The new screen",
    body: "First idea | Second idea",
    layout: "comparison",
    background: "sand",
    illustration: "none",
    narration: "Two ideas side by side",
    duration: 12,
  });
  await expect(page.getByLabel("Heading", { exact: true })).toHaveValue(
    "The new screen",
  );
  await expect(page.getByLabel("Narration and captions")).toHaveValue(
    "Two ideas side by side",
  );
  const cardProposal = await propose(page);
  await call(page, "timetrail.proposals.preview", {
    action: "preview",
    proposalId: cardProposal.proposalId,
  });
  await expect(page.getByText("PROPOSAL PREVIEW · UNSAVED")).toBeVisible();
  expect(
    (await call(page, "timetrail.editor.inspect", { collection: "clips" }))
      .total,
  ).toBe(0);
  await call(page, "timetrail.proposals.preview", { action: "restore" });
  await accept(page);
  const clips = await call(page, "timetrail.editor.inspect", {
    collection: "clips",
  });
  expect(clips.total).toBe(1);
  await open(page, "clip", clips.items[0].id);
  await fill(page, "clip", { durationSeconds: 14, sourceStart: 0 });
  await expect(page.getByLabel("Duration", { exact: true })).toHaveValue("14");
  await propose(page);
  await accept(page);
  await open(page, "cue");
  await fill(page, "cue", {
    kind: "quiz",
    start: 2,
    end: 10,
    title: "A check",
    quiz: {
      question: "How many ideas?",
      options: ["One", "Two"],
      answerIndex: 1,
      explanation: "There are two.",
    },
    position: { x: 10, y: 10, width: 30, height: 30 },
  });
  await expect(page.getByLabel("Question", { exact: true })).toHaveValue(
    "How many ideas?",
  );
  await expect(page.getByLabel("Answers, one per line")).toHaveValue(
    "One\nTwo",
  );
  await propose(page);
  await accept(page);
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await call(page, "timetrail.playback.control", {
    action: "seek",
    timeSeconds: 3,
  });
  const cues = await call(page, "timetrail.editor.inspect", {
    collection: "cues",
  });
  const quiz = cues.items.find((c: { kind: string }) => c.kind === "quiz");
  await call(page, "timetrail.editor.control", {
    action: "answer-quiz",
    cueId: quiz.id,
    answerIndex: 1,
  });
  await expect(page.getByText("Correct. There are two.")).toBeVisible();
  await call(page, "timetrail.editor.control", {
    action: "pin-context",
    cueId: quiz.id,
    pinned: true,
  });
  await call(page, "timetrail.playback.control", {
    action: "seek",
    timeSeconds: 20,
  });
  await expect(
    page.getByText("How many ideas?", { exact: true }),
  ).toBeVisible();
  await call(page, "timetrail.editor.control", {
    action: "captions",
    enabled: false,
  });
  await expect(
    page.getByRole("button", { name: "Toggle captions" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await call(page, "timetrail.editor.control", {
    action: "select-sequence",
    sequenceId: screenId,
  });
  expect(
    (await call(page, "timetrail.editor.inspect", { collection: "clips" }))
      .items[0].duration,
  ).toBe(14);
  expect(errors).toEqual([]);
});
test("project forms save through the visible button and tool history requires confirmation", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const before = await state(page);
  await open(page, "project");
  await fill(page, "project", {
    title: "A title filled by the agent",
    tags: ["biology", "lesson"],
  });
  await expect(page.getByLabel("Project title", { exact: true })).toHaveValue(
    "A title filled by the agent",
  );
  expect((await state(page)).revision).toBe(before.revision);
  await page
    .getByRole("button", { name: "Save project details", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "A title filled by the agent",
      exact: true,
    }),
  ).toBeVisible();
  const stale = await page.evaluate(
    async (revision) =>
      JSON.parse(
        await window.__TIMETRAIL_TOOLS__["timetrail.editor.open"]!.execute({
          form: "project",
          expectedRevision: revision,
        }),
      ),
    before.revision,
  );
  expect(stale.error).toContain("Stale revision");
  const current = await state(page);
  await page.evaluate((revision) => {
    (window as any).historyRequest = window.__TIMETRAIL_TOOLS__[
      "timetrail.history.request"
    ]!.execute({ action: "undo", expectedRevision: revision });
  }, current.revision);
  await expect(page.getByRole("dialog")).toContainText("Undo the last edit?");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await page.evaluate(async () =>
      JSON.parse(await (window as any).historyRequest),
    ),
  ).toMatchObject({ status: "user_cancelled" });
  expect((await state(page)).revision).toBe(current.revision);
  await page.evaluate((revision) => {
    (window as any).historyRequest = window.__TIMETRAIL_TOOLS__[
      "timetrail.history.request"
    ]!.execute({ action: "undo", expectedRevision: revision });
  }, current.revision);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  expect(
    await page.evaluate(async () =>
      JSON.parse(await (window as any).historyRequest),
    ),
  ).toMatchObject({
    status: "human_confirmed",
    revision: current.revision + 1,
  });
});
