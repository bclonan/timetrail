import { z } from "zod";
import { safeUrl, type Media } from "../domain/model";

export const searchMediaSchema = z.object({
  query: z.string().trim().min(1).max(200),
  provider: z.enum(["nasa", "commons"]).default("nasa"),
  type: z.enum(["image", "video", "audio"]).default("video"),
  page: z.number().int().min(1).max(50).default(1),
  limit: z.number().int().min(1).max(8).default(5),
});
export type MediaResult = {
  provider: "nasa" | "commons";
  id: string;
  title: string;
  type: "image" | "video" | "audio";
  description: string;
  thumbnail?: string;
  url?: string;
  attribution: NonNullable<Media["attribution"]>;
};
async function json(url: string, signal?: AbortSignal) {
  const response = await fetch(url, {
    credentials: "omit",
    signal: AbortSignal.any([
      AbortSignal.timeout(12000),
      ...(signal ? [signal] : []),
    ]),
  });
  if (!response.ok)
    throw new Error(
      `Media provider returned HTTP ${response.status}. Try another search or provider.`,
    );
  const text = await response.text();
  if (text.length > 2_000_000)
    throw new Error("Provider response is too large.");
  return JSON.parse(text);
}
const plain = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export async function searchMedia(
  raw: unknown,
  signal?: AbortSignal,
): Promise<MediaResult[]> {
  const q = searchMediaSchema.parse(raw);
  if (q.provider === "nasa") {
    const params = new URLSearchParams({
      q: q.query,
      media_type: q.type,
      page: String(q.page),
      page_size: String(q.limit),
    });
    const data = await json(
      `https://images-api.nasa.gov/search?${params}`,
      signal,
    );
    return (data.collection?.items || []).slice(0, q.limit).map((item: any) => {
      const d = item.data?.[0] || {};
      return {
        provider: "nasa",
        id: String(d.nasa_id).slice(0, 300),
        title: plain(d.title || "NASA media").slice(0, 300),
        type: q.type,
        description: plain(d.description || "").slice(0, 600),
        thumbnail: item.links?.[0]?.href,
        attribution: {
          title: plain(d.title || "NASA media").slice(0, 300),
          creator: d.secondary_creator || d.center || "NASA",
          sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
          license: "NASA media usage guidelines; check item credits",
        },
      };
    });
  }
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `${q.query} filetype:${q.type === "image" ? "bitmap" : q.type}`,
    gsrnamespace: "6",
    gsrlimit: String(q.limit),
    gsroffset: String((q.page - 1) * q.limit),
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime",
    iiurlwidth: "480",
  });
  const data = await json(
    `https://commons.wikimedia.org/w/api.php?${params}`,
    signal,
  );
  if (data.error)
    throw new Error(plain(data.error.info || "Commons search failed."));
  return Object.values(data.query?.pages || {}).map((item: any) => {
    const info = item.imageinfo?.[0];
    const meta = info?.extmetadata || {};
    return {
      provider: "commons" as const,
      id: item.title,
      title: item.title.replace(/^File:/, "").slice(0, 300),
      type: q.type,
      description: plain(meta.ImageDescription?.value || "").slice(0, 600),
      thumbnail: info?.thumburl,
      url: info?.url,
      attribution: {
        title: item.title.slice(0, 300),
        creator: plain(meta.Artist?.value || "See source credits").slice(
          0,
          1000,
        ),
        sourceUrl: info?.descriptionurl,
        license: plain(meta.LicenseShortName?.value || "Check source license"),
      },
    };
  });
}
export async function resolveNasa(
  id: string,
  type: string,
  signal?: AbortSignal,
): Promise<string> {
  const data = await json(
    `https://images-api.nasa.gov/asset/${encodeURIComponent(id)}`,
    signal,
  );
  const urls: string[] = (data.collection?.items || []).map(
    (i: { href: string }) => i.href,
  );
  const extension =
    type === "video"
      ? /\.mp4$/i
      : type === "audio"
        ? /\.(mp3|wav)$/i
        : /\.(jpg|jpeg|png)$/i;
  const candidates = urls.filter((u) => extension.test(u));
  const selected =
    candidates.find((u) => /~medium\./i.test(u)) ||
    candidates.find((u) => /~small\./i.test(u)) ||
    candidates[0];
  if (!selected)
    throw new Error(
      "This result has no supported downloadable file. Choose another result.",
    );
  const url = new URL(safeUrl(selected));
  if (url.hostname === "images-assets.nasa.gov") url.protocol = "https:";
  return url.href;
}
