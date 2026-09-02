<script setup lang="ts">
import { computed } from "vue";
import { Check, X, Eye, Sparkles, RotateCcw } from "lucide-vue-next";
import { useWorkspace } from "../../stores/workspace";
import type { Operation } from "../../domain/model";
const w = useWorkspace();
const total = computed(() =>
  w.pending.reduce((n, p) => n + p.operations.length, 0),
);
const label = (op: Operation) =>
  op.type === "set_project_meta"
    ? "Project details"
    : "value" in op
      ? "name" in op.value
        ? op.value.name
        : "title" in op.value
          ? op.value.title
          : op.type
      : op.type;
</script>
<template>
  <section
    v-if="w.pending.length"
    class="proposal-review"
    aria-label="Agent proposal review"
  >
    <header>
      <div>
        <Sparkles :size="18" />
        <div>
          <h2>Your agent has a draft.</h2>
          <p>
            {{ w.pending.length }} pending proposals · {{ total }} changes to
            review
          </p>
        </div>
      </div>
      <div class="proposal-actions">
        <button v-if="w.previewProject" @click="w.restore">
          <RotateCcw :size="15" />Restore approved</button
        ><button
          @click="
            w.run(() =>
              w.review(
                w.pending.map((p) => p.id),
                'reject',
              ),
            )
          "
        >
          Reject all</button
        ><button
          class="primary"
          @click="
            w.run(() =>
              w.review(
                w.pending.map((p) => p.id),
                'accept',
              ),
            )
          "
        >
          <Check :size="16" />Accept all
        </button>
      </div>
    </header>
    <article v-for="p in w.pending" :key="p.id" class="proposal-card">
      <div class="proposal-line">
        <h3>{{ p.title }}</h3>
        <span class="pill purple">Agent proposal</span
        ><time>{{
          new Date(p.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        }}</time>
      </div>
      <div class="diff-counts">
        <span>+{{ p.summary.mediaAdded }} media</span
        ><span>+{{ p.summary.clipsAdded }} clips</span
        ><span>+{{ p.summary.chapters }} chapters</span
        ><span>+{{ p.summary.notes }} context cards</span
        ><span>+{{ p.summary.sources }} sources</span
        ><span>+{{ p.summary.quizzes }} quizzes</span
        ><span>+{{ p.summary.branches }} branches</span>
      </div>
      <p v-for="warning in p.warnings" :key="warning" class="warning-text">
        {{ warning }}
      </p>
      <details>
        <summary>Review individual changes</summary>
        <div v-for="(op, i) in p.operations" :key="i" class="operation-row">
          <span
            >{{ label(op)
            }}<small>{{ op.type.replaceAll("_", " ") }}</small></span
          ><span v-if="p.reviewedOperations[String(i)]">{{
            p.reviewedOperations[String(i)]
          }}</span
          ><template v-else
            ><button
              class="small"
              :aria-label="'Accept item ' + (i + 1)"
              @click="w.run(() => w.review([p.id], 'accept', [i]))"
            >
              Accept item</button
            ><button
              class="small"
              :aria-label="'Reject item ' + (i + 1)"
              @click="w.run(() => w.review([p.id], 'reject', [i]))"
            >
              Reject item
            </button></template
          >
        </div>
        <p class="small-text muted">
          Accept resource changes before sequences that use them. Accept all
          applies the whole proposal together.
        </p>
      </details>
      <footer>
        <code>Agent · {{ p.correlationId || p.id }}</code>
        <div>
          <button class="small" @click="w.preview(p)">
            <Eye :size="14" />Preview proposal</button
          ><button
            class="small subtle"
            @click="w.run(() => w.review([p.id], 'reject'))"
          >
            <X :size="14" />Reject</button
          ><button
            class="small"
            @click="w.run(() => w.review([p.id], 'accept'))"
          >
            <Check :size="14" />Accept proposal
          </button>
        </div>
      </footer>
    </article>
  </section>
</template>
