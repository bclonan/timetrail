import { z } from "zod";

export const hotspotStyleSchema = z.object({
  preset: z.enum(["filled", "outline", "marker"]).optional(),
  shape: z.enum(["rounded", "rectangle", "circle"]).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  textColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  borderWidth: z.number().min(0).max(10).optional(),
  borderRadius: z.number().min(0).max(48).optional(),
});
export function hotspotAppearance(style: Record<string, unknown> = {}) {
  const s = hotspotStyleSchema.parse(style);
  const filled = !s.preset || s.preset === "filled";
  return {
    shape: s.shape || (s.preset === "marker" ? "circle" : "rounded"),
    color: s.color || "#bfe693",
    textColor: s.textColor || (filled ? "#142b21" : "#ffffff"),
    backgroundColor: filled ? s.backgroundColor || "#c5ef91" : "",
    borderWidth: s.borderWidth ?? (filled ? 0 : 4),
    borderRadius: s.borderRadius ?? 10,
  };
}
