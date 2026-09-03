import { z } from "zod";
import type { ToolBuilder } from "./editorTools";
import { smokeScenarios, fullPrompt } from "../demo/smokePrompts";
import { recipe, type RecipeId } from "../demo/exampleRecipes";
export function createExampleTools(tool: ToolBuilder) {
  return [
    tool(
      "timetrail.examples.list",
      "Browse 41 complete creation and smoke-test prompts. Search by topic or workflow; fetch a scenario for its full prompt and optional executable example spec.",
      z.object({
        query: z.string().max(200).default(""),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(15).default(10),
      }),
      true,
      false,
      ({ query, offset, limit }) => {
        const matches = smokeScenarios.filter((s) =>
          `${s.title} ${s.category} ${s.prompt}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        );
        return {
          total: matches.length,
          items: matches
            .slice(offset, offset + limit)
            .map((s) => ({
              id: s.id,
              title: s.title,
              category: s.category,
              example: s.recipe ? `/player/example_${s.recipe}` : undefined,
            })),
          nextOffset: offset + limit < matches.length ? offset + limit : null,
        };
      },
      5000,
    ),
    tool(
      "timetrail.examples.get",
      "Get a complete scenario prompt, acceptance checks, and optionally an authored example production spec with remote media. Example data is a starting point, not a claim that research or generation just ran. Use real agent-created uploads for upload smoke tests.",
      z.object({
        id: z.string().max(3),
        includeSpec: z.boolean().default(false),
      }),
      true,
      false,
      ({ id, includeSpec }) => {
        const s = smokeScenarios.find((s) => s.id === id);
        if (!s) throw new Error("Scenario not found.");
        return {
          id: s.id,
          prompt: fullPrompt(s),
          checks: s.checks,
          ...(includeSpec && s.recipe
            ? recipe(s.recipe as RecipeId, location.origin)
            : {}),
        };
      },
      50000,
    ),
  ];
}
