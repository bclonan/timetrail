import { z } from "zod";

const key = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const link = z
  .string()
  .max(3000)
  .url()
  .refine((s) => {
    const u = new URL(s);
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  });
export const panelEntrySchema = z.object({
  id: key,
  label: z.string().min(1).max(300),
  detail: z.string().max(4000).optional(),
  value: z.number().finite().optional(),
  unit: z.string().max(40).optional(),
  timeSeconds: z.number().min(0).max(86400).optional(),
  sequenceId: key.optional(),
  url: link.optional(),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
});
export const panelSchema = z
  .object({
    id: key,
    title: z.string().min(1).max(300),
    kind: z.enum([
      "text",
      "facts",
      "chart",
      "map",
      "checklist",
      "transcript",
      "score",
      "timer",
    ]),
    body: z.string().max(8000).optional(),
    entries: z.array(panelEntrySchema).max(100).default([]),
    requiresFlag: key.optional(),
    start: z.number().min(0).max(86400).optional(),
    end: z.number().min(0).max(86400).optional(),
    sequenceId: key.optional(),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.entries.map((e) => e.id)).size !== p.entries.length)
      ctx.addIssue({
        code: "custom",
        message: "Panel entry IDs must be unique.",
      });
    if (p.start !== undefined && p.end !== undefined && p.end < p.start)
      ctx.addIssue({
        code: "custom",
        message: "Panel end must follow its start.",
      });
  });
export const viewSchema = z.object({
  id: key,
  name: z.string().min(1).max(60),
  layout: z.enum(["cinema", "research", "classroom", "explorer"]),
  theme: z.enum(["midnight", "paper", "forest"]).default("midnight"),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#96d9ef"),
  aspect: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  context: z.boolean().default(true),
  chapters: z.boolean().default(true),
  panels: z.array(key).max(30).default([]),
});
export const presentationSchema = z
  .object({
    defaultViewId: key,
    views: z.array(viewSchema).min(1).max(8),
    panels: z.array(panelSchema).max(30).default([]),
  })
  .superRefine((p, ctx) => {
    const err = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!p.views.some((v) => v.id === p.defaultViewId))
      err("Default view is missing.");
    if (new Set(p.views.map((v) => v.id)).size !== p.views.length)
      err("View IDs must be unique.");
    if (new Set(p.panels.map((v) => v.id)).size !== p.panels.length)
      err("Panel IDs must be unique.");
    for (const v of p.views)
      if (v.panels.some((id) => !p.panels.some((p) => p.id === id)))
        err("View refers to a missing panel.");
  });
export type Presentation = z.infer<typeof presentationSchema>;
export type PlayerView = z.infer<typeof viewSchema>;
export type PlayerPanel = z.infer<typeof panelSchema>;
export const defaultPresentation = (): Presentation =>
  presentationSchema.parse({
    defaultViewId: "cinema",
    views: [
      { id: "cinema", name: "Cinema", layout: "cinema", panels: [] },
      {
        id: "research",
        name: "Research",
        layout: "research",
        panels: ["transcript"],
      },
      {
        id: "classroom",
        name: "Classroom",
        layout: "classroom",
        panels: ["score", "transcript"],
      },
    ],
    panels: [
      { id: "transcript", kind: "transcript", title: "Transcript" },
      { id: "score", kind: "score", title: "Your progress" },
    ],
  });
