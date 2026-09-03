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

test("one dismissible quiz over footage works in Cinema, identifies repeated questions and resets on replay", async ({
  page,
  baseURL,
}) => {
  await page.goto("/demo");
  await call(page, "timetrail.project.create", {
    title: "Quiz popup regression",
    topic: "Viewer controls",
    targetSeconds: 20,
  });
  const imported = await call(page, "timetrail.media.import", {
    items: [
      {
        url: `${baseURL}/example-assets/europa-nasa.mp4`,
        label: "Test footage",
      },
    ],
  });
  const mediaId = imported.media[0].id;
  const quiz = {
    question: 'Same question: "A & B"?',
    options: ["Yes & more", "No <thanks>"],
    answerIndex: 0,
    explanation: "Feedback stays readable until Continue.",
  };
  await call(page, "timetrail.build.propose", {
    title: "Quiz popup regression",
    topic: "Viewer controls",
    targetSeconds: 20,
    segments: [
      { title: "First", mediaId, quiz },
      { title: "Second", mediaId, quiz },
    ],
  });
  await call(page, "timetrail.views.propose", {
    expectedRevision: 0,
    presentation: {
      defaultViewId: "cinema",
      views: [
        {
          id: "cinema",
          name: "Cinema",
          layout: "cinema",
          context: false,
          panels: [],
        },
      ],
      panels: [],
    },
  });
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect
    .poll(async () => (await call(page, "timetrail.project.inspect")).revision)
    .toBe(1);
  const cues = await call(page, "timetrail.editor.inspect", {
    collection: "cues",
    limit: 20,
  });
  const quizzes = cues.items.filter((c: any) => c.kind === "quiz");
  await call(page, "timetrail.player.control", { action: "open" });
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const frame = page.frameLocator(
    'iframe[title="FrameTrail interactive preview"]',
  );
  const popup = frame.getByRole("dialog", { name: "Video question" });
  await call(page, "timetrail.playback.control", {
    action: "seek",
    timeSeconds: quizzes[0].start + 0.5,
  });
  await expect(popup).toBeVisible();
  await expect(frame.locator("#media-player video")).toBeVisible();
  await expect(frame.locator('.resourceDetail[data-type="quiz"]')).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("region", { name: "Context Stack" }),
  ).toBeHidden();
  await popup.getByRole("button", { name: "Yes & more", exact: true }).click();
  await expect(popup.getByRole("status")).toContainText("Correct.");
  await expect
    .poll(
      async () =>
        (await call(page, "timetrail.player.control", { action: "inspect" }))
          .answers[quizzes[0].id],
    )
    .toBe(0);
  await popup
    .getByRole("button", { name: "Continue film", exact: true })
    .click();
  await expect(popup).toBeHidden();
  await expect
    .poll(
      async () =>
        (await call(page, "timetrail.player.control", { action: "inspect" }))
          .time,
    )
    .toBeGreaterThan(quizzes[0].start + 0.8);
  await call(page, "timetrail.playback.control", { action: "pause" });
  await call(page, "timetrail.playback.control", {
    action: "seek",
    timeSeconds: quizzes[1].start + 0.5,
  });
  await expect(
    popup.getByRole("button", { name: "No <thanks>", exact: true }),
  ).toBeEnabled();
  await popup.getByRole("button", { name: "No <thanks>", exact: true }).click();
  await expect(popup.getByRole("status")).toContainText(
    "The correct answer is Yes & more.",
  );
  await expect
    .poll(
      async () =>
        (await call(page, "timetrail.player.control", { action: "inspect" }))
          .answers[quizzes[1].id],
    )
    .toBe(1);
  await popup
    .getByRole("button", { name: "Continue film", exact: true })
    .press("Escape");
  await expect(popup).toBeHidden();
  await call(page, "timetrail.player.control", { action: "restart" });
  await call(page, "timetrail.playback.control", {
    action: "seek",
    timeSeconds: quizzes[0].start + 0.5,
  });
  await expect(
    popup.getByRole("button", { name: "Yes & more", exact: true }),
  ).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await popup
    .getByRole("button", { name: "Close question and continue", exact: true })
    .click();
  await expect(popup).toBeHidden();
  expect((await call(page, "timetrail.project.inspect")).revision).toBe(1);
});
