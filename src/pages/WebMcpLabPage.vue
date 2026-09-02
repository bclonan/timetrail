<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { Copy, Play, Trash2, Code2, ArrowRight } from "lucide-vue-next";
import { RouterLink } from "vue-router";
import { manifest, registeredNames, nativeStatus } from "../webmcp/registry";
import { useWorkspace } from "../stores/workspace";
import { storage } from "../storage/BrowserWorkspaceStore";
const w = useWorkspace();
const selected = ref("timetrail.project.inspect");
const args = ref("{}");
const result = ref("");
const busy = ref(false);
const tool = computed(() =>
  manifest.value.find((t) => t.name === selected.value),
);
onMounted(async () => (w.events = await storage.events()));
async function invoke() {
  busy.value = true;
  await w.run(async () => {
    const t = window.__TIMETRAIL_TOOLS__[selected.value];
    if (!t)
      throw new Error(
        "This tool is not registered on this route. Open its relevant page.",
      );
    result.value = await t.execute(JSON.parse(args.value));
  });
  busy.value = false;
}
async function copy() {
  await navigator.clipboard.writeText(
    JSON.stringify(
      manifest.value.map(({ execute: _execute, ...tool }) => tool),
      null,
      2,
    ),
  );
  w.notify("Tool manifest copied.");
}
async function clear() {
  if (
    await w.ask(
      "Clear local activity?",
      "This removes the tool and proposal event log on this device. Projects and proposals stay saved.",
      "Clear activity",
    )
  ) {
    await storage.clearLog();
    w.events = [];
  }
}
</script>
<template>
  <div class="lab page-width">
    <header class="lab-header">
      <div>
        <p class="eyebrow">TOOLS WITH MEANING</p>
        <h1>WebMCP <em>Lab.</em></h1>
        <p class="muted">Inspect the structured tools behind the studio.</p>
      </div>
      <button @click="w.run(copy)">
        <Copy :size="16" />Copy tool manifest
      </button>
    </header>
    <div class="lab-status">
      <Code2 :size="23" />
      <div>
        <strong>{{
          nativeStatus === "WebMCP connected"
            ? "Real WebMCP available"
            : "Real WebMCP unavailable"
        }}</strong>
        <p>
          {{
            nativeStatus === "WebMCP connected"
              ? "Tools register through document.modelContext."
              : "Development fallback registry. Manual invocation below is not native WebMCP."
          }}
        </p>
      </div>
      <span class="pill">{{ registeredNames.length }} registered</span>
    </div>
    <div class="lab-layout">
      <nav class="tool-list" aria-label="Tool definitions">
        <button
          v-for="t in manifest"
          :key="t.name"
          :class="{ selected: selected === t.name }"
          @click="
            selected = t.name;
            args = '{}';
            result = '';
          "
        >
          <span>{{ t.name.replace("timetrail.", "") }}</span
          ><span
            class="tool-dot"
            :class="{ registered: registeredNames.includes(t.name) }"
            :aria-label="
              registeredNames.includes(t.name)
                ? 'Registered'
                : 'Unavailable on this route'
            "
          />
        </button>
      </nav>
      <section v-if="tool" class="tool-detail">
        <h2>{{ tool.name }}</h2>
        <p>{{ tool.description }}</p>
        <div class="tool-hints">
          <span>{{
            tool.annotations.readOnlyHint
              ? "Read-only"
              : "Changes state or prepares an action"
          }}</span
          ><span>{{
            tool.annotations.untrustedContentHint
              ? "Untrusted content hint"
              : "Application-generated result"
          }}</span>
        </div>
        <details open>
          <summary>Input schema</summary>
          <pre>{{ JSON.stringify(tool.inputSchema, null, 2) }}</pre>
        </details>
        <label
          >Manual arguments<textarea
            v-model="args"
            spellcheck="false"
            rows="7"
            class="code-input"
          />
        </label>
        <div class="dialog-actions">
          <RouterLink v-if="!w.approved" to="/demo"
            >Open demo to activate project tools<ArrowRight
              :size="14" /></RouterLink
          ><button
            class="primary"
            :disabled="busy || !registeredNames.includes(selected)"
            @click="invoke"
          >
            <Play :size="15" />{{
              busy ? "Waiting for result..." : "Invoke fallback tool"
            }}
          </button>
        </div>
        <pre v-if="result" class="tool-result" role="status">{{ result }}</pre>
      </section>
    </div>
    <section class="activity-log">
      <div class="section-title">
        <h2>Local activity</h2>
        <button class="small" @click="w.run(clear)">
          <Trash2 :size="14" />Clear log
        </button>
      </div>
      <div v-if="!w.events.length" class="empty-gallery">
        Tool executions and proposal decisions will appear here.
      </div>
      <article v-for="e in w.events.slice(0, 40)" :key="e.id">
        <time>{{ new Date(e.startedAt).toLocaleTimeString() }}</time>
        <div>
          <strong>{{ e.message }}</strong
          ><code>{{ e.toolName }} · {{ e.id }}</code>
        </div>
        <span :class="{ 'warning-text': e.status === 'error' }"
          >{{ e.status }} · {{ e.duration }}ms</span
        >
      </article>
    </section>
  </div>
</template>
