import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}
const files = walk("dist")
  .filter((f) => !f.endsWith("sw.js"))
  // The loader already contains these source files; cache each byte only once.
  .filter(
    (f) =>
      !/^dist[\\/]frametrail[\\/](?:_lib|_shared|player)[\\/].*\.(?:js|css)$/.test(
        f,
      ),
  )
  .map((f) => "/" + f.replace(/\\/g, "/").replace(/^dist\//, ""));
const hash = createHash("sha256");
for (const file of files) hash.update(readFileSync("dist" + file));
const version = "timetrail-" + hash.digest("hex").slice(0, 12);
async function cachedResponse(request, response) {
  const range = request.headers.get("range");
  if (!range || response.status !== 200) return response;
  const blob = await response.blob();
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const invalid = () =>
    new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${blob.size}` },
    });
  if (!match || (!match[1] && !match[2])) return invalid();
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, blob.size - Number(match[2]));
  const end =
    match[1] && match[2]
      ? Math.min(Number(match[2]), blob.size - 1)
      : blob.size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= blob.size
  )
    return invalid();
  const headers = new Headers(response.headers);
  headers.delete("Content-Encoding");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${start}-${end}/${blob.size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(blob.slice(start, end + 1, blob.type), {
    status: 206,
    headers,
  });
}
writeFileSync(
  "dist/sw.js",
  `const CACHE=${JSON.stringify(version)},FILES=${JSON.stringify(files)};${cachedResponse.toString()};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('timetrail-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||e.request.method!=='GET')return;e.respondWith((async()=>{const c=await caches.open(CACHE);if(FILES.includes(u.pathname)){const hit=await c.match(e.request,{ignoreSearch:true,ignoreVary:true});if(hit)return cachedResponse(e.request,hit)}try{return await fetch(e.request)}catch{return (e.request.mode==='navigate'?await c.match('/index.html',{ignoreVary:true}):undefined)||Response.error()}})())});`,
);
console.log("Offline shell includes " + files.length + " local files.");
