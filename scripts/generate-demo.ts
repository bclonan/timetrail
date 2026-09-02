import { mkdirSync, writeFileSync } from "node:fs";
import { makeDemo } from "../src/demo/demoProject";
import { z } from "zod";
import { projectShape } from "../src/domain/model";
import { gallerySchema } from "../src/services/GalleryService";
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
