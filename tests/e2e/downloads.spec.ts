import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
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
async function fixture(page: Page) {
  const bundled = await build({
    stdin: {
      contents: `
    import {Output,BufferTarget,Mp4OutputFormat,CanvasSource,AudioBufferSource,Input,BlobSource,ALL_FORMATS,CanvasSink,AudioBufferSink} from 'mediabunny';
    window.qaMedia = {Input,BlobSource,ALL_FORMATS,CanvasSink,AudioBufferSink};
    window.qaFixture = async () => {
      const canvas=document.createElement('canvas'); canvas.width=320;canvas.height=180;
      const ctx=canvas.getContext('2d');
      const output=new Output({format:new Mp4OutputFormat(),target:new BufferTarget()});
      const video=new CanvasSource(canvas,{codec:'avc',bitrate:500000});
      const audio=new AudioBufferSource({codec:'aac',bitrate:128000});
      output.addVideoTrack(video);output.addAudioTrack(audio);await output.start();
      ctx.fillStyle='red';ctx.fillRect(0,0,320,180);await video.add(0,1);
      ctx.fillStyle='blue';ctx.fillRect(0,0,320,180);await video.add(1,1);
      const sound=new AudioBuffer({numberOfChannels:2,length:96000,sampleRate:48000});
      for(let ch=0;ch<2;ch++) {const d=sound.getChannelData(ch);for(let i=0;i<d.length;i++) d[i]=Math.sin(i*2*Math.PI*440/48000)*.2;}
      await audio.add(sound);video.close();audio.close();await output.finalize();
      let binary='';for(const b of new Uint8Array(output.target.buffer)) binary+=String.fromCharCode(b);
      return btoa(binary);
    };`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
  });
  await page.addScriptTag({ content: bundled.outputFiles[0]!.text });
  return page.evaluate(() => (window as any).qaFixture());
}
async function approve(page: Page, revision: number) {
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect
    .poll(async () => (await call(page, "timetrail.project.inspect")).revision)
    .toBe(revision);
}
async function download(page: Page) {
  await expect(
    page.getByRole("dialog", { name: "Your export is ready" }),
  ).toBeVisible({ timeout: 120000 });
  const waiting = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  const file = await waiting;
  return {
    name: file.suggestedFilename(),
    bytes: await readFile((await file.path())!),
  };
}

test("MP4 encodes trimmed timeline pictures, source audio and captions, and leaves the approved film unchanged", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/examples");
  await call(page, "timetrail.project.create", {
    title: "Download QA",
    topic: "Export verification",
    targetSeconds: 10,
  });
  const encoded = await fixture(page);
  const data = Buffer.from(encoded, "base64");
  const upload = await call(page, "timetrail.media.upload", {
    action: "begin",
    name: "red-blue-with-tone.mp4",
    mimeType: "video/mp4",
    sizeBytes: data.length,
  });
  await call(page, "timetrail.media.upload", {
    action: "chunk",
    uploadId: upload.uploadId,
    offset: 0,
    base64: encoded,
  });
  const media = await call(page, "timetrail.media.upload", {
    action: "finish",
    uploadId: upload.uploadId,
  });
  await call(page, "timetrail.build.propose", {
    title: "Download QA",
    topic: "Export verification",
    targetSeconds: 10,
    segments: [
      {
        title: "Opening",
        durationWeight: 2,
        card: {
          layout: "title",
          heading: "Export QA",
          body: "A title card",
          background: "forest",
          illustration: "none",
        },
      },
      {
        title: "Blue source trim",
        durationWeight: 2,
        mediaId: media.mediaId,
        sourceStart: 1,
        narration: "This is the blue source frame.",
      },
      {
        title: "Red source",
        durationWeight: 6,
        mediaId: media.mediaId,
        sourceStart: 0,
      },
    ],
  });
  await approve(page, 1);
  await page
    .getByRole("combobox", { name: "Export format" })
    .selectOption("video-mp4");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const result = await download(page);
  expect(result.name).toMatch(/\.mp4$/);
  expect(result.bytes.subarray(4, 8).toString()).toBe("ftyp");
  expect(result.bytes.includes(Buffer.from("avc1"))).toBe(true);
  expect(result.bytes.includes(Buffer.from("mp4a"))).toBe(true);
  await expect(page.getByRole("dialog")).toContainText("read-aloud narration");
  const metrics = await page.evaluate(async (base64) => {
    const { Input, BlobSource, ALL_FORMATS, CanvasSink, AudioBufferSink } = (
      window as any
    ).qaMedia;
    const input = new Input({
      source: new BlobSource(
        new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))]),
      ),
      formats: ALL_FORMATS,
    });
    const video = await input.getPrimaryVideoTrack(),
      audio = await input.getPrimaryAudioTrack();
    const sink = new CanvasSink(video);
    const pixel = async (t: number) => {
      const f = await sink.getCanvas(t);
      return Array.from(
        f.canvas.getContext("2d").getImageData(10, 10, 1, 1).data,
      );
    };
    const colors = await Promise.all([pixel(2.25), pixel(4.25), pixel(8)]);
    const sounds = new AudioBufferSink(audio);
    const rms = async (t: number) => {
      const b = (await sounds.getBuffer(t)).buffer.getChannelData(0);
      return Math.sqrt(
        b.reduce((s: number, v: number) => s + v * v, 0) / b.length,
      );
    };
    const result = {
      duration: await input.computeDuration(),
      colors,
      audio: [await rms(0.5), await rms(2.5), await rms(7)],
      width: video.displayWidth,
      height: video.displayHeight,
    };
    input.dispose();
    return result;
  }, result.bytes.toString("base64"));
  expect(metrics.duration).toBeCloseTo(10, 1);
  expect(metrics.colors[0]![2]).toBeGreaterThan(220);
  expect(metrics.colors[1]![0]).toBeGreaterThan(220);
  expect(metrics.colors[2]![2]).toBeGreaterThan(220);
  expect(metrics.audio[0]).toBeLessThan(0.005);
  expect(metrics.audio[1]).toBeGreaterThan(0.08);
  expect(metrics.audio[2]).toBeLessThan(0.005);
  expect(metrics.width).toBe(1280);
  expect(metrics.height).toBe(720);
  expect((await call(page, "timetrail.project.inspect")).revision).toBe(1);
});

test("interactive download has index.html in Research view with playable bundled media and working choices", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const firstState = await call(page, "timetrail.project.inspect");
  const imported = await call(page, "timetrail.media.import", {
    items: [
      {
        url: new URL("/demo-assets/dna.svg", page.url()).href,
        typeHint: "image",
        label: "Bundled research illustration",
      },
    ],
  });
  await call(page, "timetrail.views.propose", {
    expectedRevision: firstState.revision,
    presentation: {
      defaultViewId: "custom-cinema",
      views: [
        {
          id: "custom-cinema",
          name: "Cinema",
          layout: "cinema",
          theme: "paper",
          panels: [],
        },
      ],
      panels: [
        {
          id: "study-notes",
          title: "Research notes",
          kind: "text",
          body: "These notes travel with the interactive download.",
        },
      ],
    },
  });
  await approve(page, firstState.revision + 1);
  const baseline = await call(page, "timetrail.project.inspect");
  const task = await call(page, "timetrail.export.prepare", {
    format: "interactive-zip",
  });
  expect(task.status).toBe("preparing");
  const result = await download(page);
  expect(result.name).toMatch(/-interactive.zip$/);
  const status = await call(page, "timetrail.export.status");
  expect(status.status).toBe("ready");
  const files = unzipSync(result.bytes);
  const exportedProject = JSON.parse(strFromU8(files["project.json"]!));
  const included = exportedProject.media.find(
    (m: any) => m.id === imported.media[0].id,
  );
  expect(included.source.kind).toBe("asset");
  expect(Object.keys(files)).toContain(`assets/${included.source.assetId}.img`);
  expect(exportedProject.presentation.defaultViewId).toBe("custom-cinema");
  expect(files["index.html"]).toBeDefined();
  expect(files["project.json"]).toBeDefined();
  expect(files["runtime/runtime.html"]).toBeDefined();
  expect(strFromU8(files["index.html"]!)).toContain('"startInResearch":true');
  const server = createServer((req, res) => {
    const path = (req.url || "/").split("?")[0]!.slice(1) || "index.html";
    const file = files[path];
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      path.endsWith("html")
        ? "text/html"
        : path.endsWith("json")
          ? "application/json"
          : "application/octet-stream",
    );
    res.end(file);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No static host.");
  const viewer = await context.newPage();
  try {
    await viewer.goto(`http://127.0.0.1:${address.port}/index.html`);
    await expect(viewer.locator("#status")).toContainText("Ready.");
    await expect(
      viewer.getByRole("button", { name: "Research", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(viewer.locator("body")).toHaveClass(/view-research/);
    await expect(
      viewer.getByText("These notes travel with the interactive download."),
    ).toBeVisible();
    await viewer.locator("#seek").fill("84");
    await expect(
      viewer.getByText("What carries a gene's message to the ribosome?"),
    ).toBeVisible();
    await viewer.getByRole("button", { name: "Cinema", exact: true }).click();
    await expect(viewer.locator("body")).toHaveClass(/view-cinema/);
  } finally {
    await viewer.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  expect((await call(page, "timetrail.project.inspect")).revision).toBe(
    baseline.revision,
  );
});

test("MP4 failure and cancellation never publish a partial file, and Player exposes both download formats", async ({
  page,
}) => {
  await page.goto("/examples");
  const project = await call(page, "timetrail.project.create", {
    title: "Unavailable video QA",
    topic: "Export failure",
    targetSeconds: 10,
  });
  const source = await call(page, "timetrail.media.import", {
    items: [
      {
        url: "https://www.youtube.com/watch?v=exportfixture",
        label: "Embedded fixture",
      },
    ],
  });
  await call(page, "timetrail.build.propose", {
    title: "Unavailable video QA",
    topic: "Export failure",
    targetSeconds: 10,
    segments: [{ title: "Embedded video", mediaId: source.media[0].id }],
  });
  await approve(page, 1);
  await call(page, "timetrail.export.prepare", { format: "video-mp4" });
  await expect
    .poll(async () => (await call(page, "timetrail.export.status")).status)
    .toBe("failed");
  await expect(page.getByRole("alert")).toContainText("YouTube or Vimeo");
  await expect(
    page.getByRole("dialog", { name: "Your export is ready" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Watch", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Export format" }),
  ).toHaveValue("interactive-zip");
  expect(
    await page
      .getByRole("combobox", { name: "Export format" })
      .locator("option")
      .allTextContents(),
  ).toContain("Video only (.mp4)");
  await call(page, "timetrail.export.status");
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await call(page, "timetrail.export.prepare", { format: "video-mp4" });
  await call(page, "timetrail.export.cancel");
  await expect
    .poll(async () => (await call(page, "timetrail.export.status")).status)
    .toBe("canceled");
  await expect(
    page.getByRole("dialog", { name: "Your export is ready" }),
  ).toHaveCount(0);
  expect(project).toBeDefined();
});
