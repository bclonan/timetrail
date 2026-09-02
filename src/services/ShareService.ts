import { strToU8, strFromU8, zlibSync, unzlibSync } from "fflate";
import { projectSchema, type Project } from "../domain/model";
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const base64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export class ShareService {
  encode(project: Project) {
    projectSchema.parse(project);
    if (project.media.some((m) => m.source.kind === "asset"))
      throw new Error(
        "This project contains local files. Export a ZIP or static pack to include them.",
      );
    const payload = canonical(project);
    if (payload.includes("blob:") || payload.includes("file:"))
      throw new Error("Private or temporary paths cannot be shared.");
    if (payload.length > 350000)
      throw new Error("This project is too large for a share code. Use a ZIP.");
    const code = "TT1." + base64(zlibSync(strToU8(payload)));
    if (code.length > 12000)
      throw new Error(
        "This story exceeds the 12,000-character share limit. Use a ZIP or static pack.",
      );
    return code;
  }
  decode(code: string) {
    if (!/^TT1\.[A-Za-z0-9_-]+$/.test(code) || code.length > 12000)
      throw new Error("Invalid or oversized TimeTrail share code.");
    const raw = atob(code.slice(4).replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const decoded = unzlibSync(bytes, { out: new Uint8Array(350001) });
    const text = strFromU8(decoded).replace(/\0+$/, "");
    if (text.length > 350000) throw new Error("Share payload is too large.");
    const p = projectSchema.parse(JSON.parse(text));
    if (p.media.some((m) => m.source.kind === "asset"))
      throw new Error("Shared projects cannot reference local assets.");
    return p;
  }
  link(project: Project) {
    return `${location.origin}/#/watch?tt=${this.encode(project)}`;
  }
}
export const shares = new ShareService();
