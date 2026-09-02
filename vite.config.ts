import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [vue()],
  server: {
    headers: {
      "Permissions-Policy": "tools=(self)",
      "Origin-Agent-Cluster": "?1",
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
  build: { chunkSizeWarningLimit: 900 },
});
