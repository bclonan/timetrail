export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (
    input: unknown,
    context?: { signal?: AbortSignal },
  ) => Promise<string>;
}
export interface ModelContextPort {
  registerTool: (
    tool: ToolDefinition,
    options: { signal: AbortSignal },
  ) => Promise<void> | void;
}
/** Route ownership and fallback registration, independent of Vue and the domain model. */
export class ToolRegistry {
  private controller = new AbortController();
  private generation = 0;
  definitions: Record<string, ToolDefinition> = {};
  async replace(tools: ToolDefinition[], context?: ModelContextPort) {
    const mine = ++this.generation;
    this.controller.abort();
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.definitions = Object.fromEntries(tools.map((t) => [t.name, t]));
    if (!context?.registerTool) return "Development fallback";
    try {
      for (const tool of tools) {
        if (signal.aborted) return;
        await context.registerTool(tool, { signal });
      }
      if (mine === this.generation) return "WebMCP connected";
    } catch (e) {
      if (!signal.aborted)
        return `Registration unavailable: ${e instanceof Error ? e.message : "experimental API mismatch"}`;
    }
  }
  destroy() {
    this.controller.abort();
    this.definitions = {};
  }
}
