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
writeFileSync(
  "dist/sw.js",
  `const CACHE=${JSON.stringify(version)},FILES=${JSON.stringify(files)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('timetrail-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||e.request.method!=='GET')return;e.respondWith((async()=>{const c=await caches.open(CACHE);if(FILES.includes(u.pathname)){const hit=await c.match(e.request,{ignoreSearch:true,ignoreVary:true});if(hit)return hit}try{return await fetch(e.request)}catch{return (e.request.mode==='navigate'?await c.match('/index.html',{ignoreVary:true}):undefined)||Response.error()}})())});`,
);
console.log("Offline shell includes " + files.length + " local files.");
