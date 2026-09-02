import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
export function packageRuntime(scripts, styles, root) {
  const mime = {
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".gif": "image/gif",
  };
  const css = styles
    .map((p) =>
      readFileSync(resolve(root, p), "utf8").replace(
        /url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g,
        (full, path) => {
          if (/^(data:|http|#)/.test(path)) return full;
          const file = resolve(
            dirname(resolve(root, p)),
            path.split(/[?#]/)[0],
          );
          return existsSync(file)
            ? `url(data:${mime[extname(file)] || "application/octet-stream"};base64,${readFileSync(file).toString("base64")})`
            : full;
        },
      ),
    )
    .join("\n");
  const js = scripts
    .map((p) => readFileSync(resolve(root, p), "utf8"))
    .join("\n;\n");
  // Callback replacements preserve dollar sequences inside third-party source code.
  const bridge = readFileSync("public/frame-bridge.js", "utf8");
  const html = readFileSync("public/runtime.html", "utf8")
    .replace(
      '<link rel="stylesheet" href="./frametrail/loader.css">',
      () => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
    )
    .replace(
      '<script src="./frametrail/loader.js"></script>',
      () => `<script>${js.replace(/<\/script/gi, "<\\/script")}</script>`,
    )
    .replace(
      '<script type="module" src="./frame-bridge.js"></script>',
      () =>
        `<script type="module">${bridge.replace(/<\/script/gi, "<\\/script")}</script>`,
    );
  const license = (
    readFileSync("LICENSE", "utf8") +
    "\n\n" +
    readFileSync(resolve(root, "LICENSE.md"), "utf8")
  ).replace(/--/g, "- -");
  writeFileSync(
    "public/standalone-runtime.html",
    "<!--\n" + license + "\n-->\n" + html,
  );
}
