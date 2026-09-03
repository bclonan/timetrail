import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { makeDemo } from "../src/demo/demoProject";
import { z } from "zod";
import { projectShape } from "../src/domain/model";
import { gallerySchema } from "../src/services/GalleryService";
import { makeExample, recipeIds, recipe } from "../src/demo/exampleRecipes";
import { smokeScenarios, fullPrompt } from "../src/demo/smokePrompts";
import { submissionText, demoVideoPrompt } from "../src/demo/hackathon";
mkdirSync("public/schemas", { recursive: true });
writeFileSync(
  "public/schemas/project.schema.json",
  JSON.stringify(z.toJSONSchema(projectShape), null, 2),
);
writeFileSync(
  "public/schemas/gallery.schema.json",
  JSON.stringify(z.toJSONSchema(gallerySchema), null, 2),
);
const p = makeDemo();
mkdirSync("public/gallery", { recursive: true });
writeFileSync("public/gallery/dna.json", JSON.stringify(p, null, 2));
writeFileSync(
  "public/gallery/catalog.json",
  JSON.stringify(
    {
      version: 1,
      updatedAt: p.updatedAt,
      items: [
        {
          id: "published_dna",
          title: p.title,
          summary: p.description,
          creator: "TimeTrail",
          tags: p.tags,
          durationSeconds: 90,
          thumbnail: "/demo-assets/dna.svg",
          projectUrl: "/gallery/dna.json",
          watchUrl: "/watch/published_dna",
          license: "MIT",
        },
      ],
    },
    null,
    2,
  ),
);
mkdirSync("public/demo-assets", { recursive: true });
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#193527"/>' +
  Array.from({ length: 20 }, (_, i) => {
    const x = 480 + Math.sin(i * 0.5) * 120;
    return `<path d="M${x} ${i * 28}L${960 - x} ${i * 28}" stroke="#739c75" stroke-width="5"/><circle cx="${x}" cy="${i * 28}" r="11" fill="#c5ef91"/><circle cx="${960 - x}" cy="${i * 28}" r="11" fill="#80bba0"/>`;
  }).join("") +
  "</svg>";
writeFileSync("public/demo-assets/dna.svg", svg);
mkdirSync("public/examples", { recursive: true });
const origin =
  process.env.TIMETRAIL_PUBLIC_ORIGIN ||
  "https://timetrail-studio-bclonan.netlify.app";
const catalog = JSON.parse(readFileSync("public/gallery/catalog.json", "utf8"));
for (const id of recipeIds) {
  const example = makeExample(id, origin);
  writeFileSync(`public/gallery/${id}.json`, JSON.stringify(example, null, 2));
  writeFileSync(
    `public/examples/${id}-spec.json`,
    JSON.stringify(recipe(id, origin), null, 2),
  );
  catalog.items.push({
    id: example.id,
    title: example.title,
    summary: example.description,
    creator: example.provenance.creator,
    tags: example.tags,
    durationSeconds: example.sequences[0]!.durationSeconds,
    thumbnail:
      id === "europa"
        ? "/example-assets/europa-orbit.png"
        : id === "atlas"
          ? "/example-assets/atlas.png"
          : undefined,
    projectUrl: `/gallery/${id}.json`,
    watchUrl: `/player/${example.id}`,
    license: example.provenance.license,
  });
}
writeFileSync("public/gallery/catalog.json", JSON.stringify(catalog, null, 2));
const promptDoc =
  "# TimeTrail creation smoke tests\n\n41 prompts. Five authored example films accompany the library. A prompt is not a passed test. See BUG_LOG.md for measured verification and limits.\n\n" +
  smokeScenarios
    .map(
      (s) =>
        `## ${s.id}. ${s.title}\n\n${fullPrompt(s)}\n${s.recipe ? `\nAuthored example: ${origin}/player/example_${s.recipe}\n` : ""}`,
    )
    .join("\n");
writeFileSync("docs/SMOKE_PROMPTS.md", promptDoc);
writeFileSync("public/examples/smoke-prompts.md", promptDoc);
writeFileSync("public/examples/hackathon-submission.md", submissionText);
writeFileSync("public/examples/demo-video-prompt.txt", demoVideoPrompt);
writeFileSync("docs/HACKATHON_SUBMISSION.md", submissionText);
if (existsSync("docs/BUG_LOG.md"))
  writeFileSync("public/examples/bug-log.md", readFileSync("docs/BUG_LOG.md"));
