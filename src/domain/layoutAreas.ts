import { z } from "zod";

export const layoutAreasSchema = z
  .array(
    z.object({
      area: z.enum(["left", "right", "top", "bottom"]),
      content: z.enum(["notes", "transcript", "chapters", "timelines", "text"]),
      title: z.string().trim().min(1).max(80),
      size: z.enum(["small", "medium", "large"]).default("medium"),
      collapsed: z.boolean().default(false),
      text: z.string().max(8000).optional(),
    }),
  )
  .max(16)
  .refine(
    (areas) =>
      ["left", "right", "top", "bottom"].every(
        (area) => areas.filter((a) => a.area === area).length <= 4,
      ),
    "Use at most four tabs in each area.",
  );
export type LayoutArea = z.infer<typeof layoutAreasSchema>[number];
