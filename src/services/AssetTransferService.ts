import { z } from "zod";
import { id, safeUrl, mediaSchema, type Media } from "../domain/model";
import { importFile } from "./MediaImportService";

const name = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^/\\]+$/);
const attribution = mediaSchema.shape.attribution;
export const fetchAssetSchema = z.object({
  url: z.string().max(3000),
  name,
  attribution,
});
export const uploadSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("begin"),
    name,
    mimeType: z.string().max(100),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(100 * 1024 * 1024),
    attribution,
  }),
  z.object({
    action: z.literal("chunk"),
    uploadId: z.string().max(100),
    offset: z.number().int().min(0),
    base64: z
      .string()
      .min(1)
      .max(4 * 1024 * 1024)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  }),
  z.object({ action: z.literal("finish"), uploadId: z.string().max(100) }),
  z.object({ action: z.literal("abort"), uploadId: z.string().max(100) }),
]);
type Upload = {
  projectId: string;
  name: string;
  mimeType: string;
  size: number;
  received: number;
  chunks: Uint8Array[];
  expires: number;
  attribution?: Media["attribution"];
};
const sessions = new Map<string, Upload>();
export async function uploadAsset(
  projectId: string,
  raw: unknown,
): Promise<{
  uploadId?: string;
  received?: number;
  media?: Media;
  status: string;
}> {
  const input = uploadSchema.parse(raw);
  for (const [key, session] of sessions)
    if (session.expires < Date.now()) sessions.delete(key);
  if (input.action === "begin") {
    if (sessions.size >= 2)
      throw new Error("Finish or abort the current uploads first.");
    const uploadId = id();
    sessions.set(uploadId, {
      projectId,
      name: input.name,
      mimeType: input.mimeType,
      size: input.sizeBytes,
      received: 0,
      chunks: [],
      expires: Date.now() + 10 * 60_000,
      attribution: input.attribution,
    });
    return {
      uploadId,
      received: 0,
      status: "send_base64_chunks_at_byte_offsets",
    };
  }
  const s = sessions.get(input.uploadId);
  if (!s || s.projectId !== projectId)
    throw new Error(
      "Upload expired or belongs to another project. Begin again.",
    );
  if (input.action === "abort") {
    sessions.delete(input.uploadId);
    return { status: "aborted" };
  }
  if (input.action === "chunk") {
    if (input.offset !== s.received)
      throw new Error(
        `Expected byte offset ${s.received}. Do not repeat accepted chunks.`,
      );
    const binary = atob(input.base64);
    if (s.received + binary.length > s.size)
      throw new Error("Chunk exceeds declared file size.");
    s.chunks.push(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    s.received += binary.length;
    s.expires = Date.now() + 10 * 60_000;
    return {
      uploadId: input.uploadId,
      received: s.received,
      status: s.received === s.size ? "ready_to_finish" : "awaiting_chunks",
    };
  }
  if (s.received !== s.size)
    throw new Error(`Upload incomplete: ${s.received} of ${s.size} bytes.`);
  sessions.delete(input.uploadId);
  const media = await importFile(
    new File(s.chunks as BlobPart[], s.name, { type: s.mimeType }),
    "agent",
  );
  if (s.attribution) media.attribution = s.attribution;
  return { media, status: "file_imported" };
}
export async function fetchAsset(
  raw: unknown,
  by: Media["importedBy"] = "human",
  signal?: AbortSignal,
) {
  const input = fetchAssetSchema.parse(raw);
  const response = await fetch(safeUrl(input.url), {
    credentials: "omit",
    signal: AbortSignal.any([
      AbortSignal.timeout(45000),
      ...(signal ? [signal] : []),
    ]),
  });
  if (!response.ok)
    throw new Error(
      `Download failed with HTTP ${response.status}. Use another source or upload a file.`,
    );
  const maximum = 100 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > maximum)
    throw new Error("File exceeds 100 MB. Use a smaller source.");
  const chunks: Uint8Array[] = [];
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Download body is missing.");
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximum)
        throw new Error("File exceeds 100 MB. Use a smaller source.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  signal?.throwIfAborted();
  const file = new File(chunks as BlobPart[], input.name, {
    type: response.headers.get("content-type")?.split(";")[0] || "",
  });
  const media = await importFile(file, by);
  media.attribution = input.attribution || { sourceUrl: input.url };
  return media;
}
