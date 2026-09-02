import {
  existsSync,
  readFileSync,
  mkdirSync,
  cpSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { packageRuntime } from "./runtime-package.mjs";
const pin = "310a68a8bf60d70a3d64502147e2163132d5cfc5";
const vendor = resolve("vendor/frametrail");
if (!existsSync(vendor)) {
  execFileSync(
    "git",
    [
      "clone",
      "--depth",
      "1",
      "https://github.com/OpenHypervideo/FrameTrail.git",
      vendor,
    ],
    { stdio: "inherit" },
  );
}
const head = execFileSync("git", ["-C", vendor, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (head !== pin) {
  execFileSync("git", ["-C", vendor, "fetch", "--depth", "1", "origin", pin], {
    stdio: "inherit",
  });
  execFileSync("git", ["-C", vendor, "checkout", "--detach", pin], {
    stdio: "inherit",
  });
}
const output = resolve("public/frametrail");
mkdirSync(output, { recursive: true });
// Copy browser dependencies in their original paths, without PHP or administration entry points.
for (const dir of ["_lib", "_shared", "player"])
  cpSync(resolve(vendor, "src", dir), resolve(output, dir), {
    recursive: true,
    filter: (p) => !p.endsWith(".php"),
  });
cpSync(resolve(vendor, "LICENSE.md"), resolve(output, "LICENSE.md"));
const html = readFileSync(resolve(vendor, "src/index.html"), "utf8");
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => !p.includes("resourcemanager") && !/^https?:/.test(p));
const styles = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)]
  .map((m) => m[1])
  .filter((p) => !p.startsWith("_data") && !p.includes("resourcemanager"));
writeFileSync(
  resolve(output, "loader.js"),
  scripts.map((p) => readFileSync(resolve(output, p), "utf8")).join("\n;\n"),
);
writeFileSync(
  resolve(output, "loader.css"),
  styles
    .map((p) =>
      readFileSync(resolve(output, p), "utf8").replace(
        /url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g,
        (full, path) =>
          /^(data:|https?:|\/|#)/.test(path)
            ? full
            : `url('./${posix.normalize(posix.join(posix.dirname(p), path))}')`,
      ),
    )
    .join("\n"),
);
writeFileSync(
  resolve(output, "version.json"),
  JSON.stringify({ commit: pin, license: "MIT OR GPL-3.0-or-later" }),
);
console.log(`Prepared unchanged FrameTrail ${pin.slice(0, 12)}`);
await build({
  entryPoints: ["src/runtime/frame.ts"],
  outfile: "public/frame-bridge.js",
  bundle: true,
  format: "esm",
  minify: true,
});
packageRuntime(scripts, styles, output);
await build({
  entryPoints: ["src/runtime/standaloneClient.ts"],
  outfile: "public/standalone-viewer.js",
  bundle: true,
  format: "iife",
  minify: true,
});
await build({
  entryPoints: ["scripts/generate-demo.ts"],
  outfile: "node_modules/.cache/timetrail-demo.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
});
await import(
  pathToFileURL(resolve("node_modules/.cache/timetrail-demo.mjs")).href
);
