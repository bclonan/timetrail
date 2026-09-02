<script setup lang="ts">
import { computed, watch, toRef } from "vue";
import {
  Pin,
  ArrowUpRight,
  GitBranch,
  CheckCircle2,
  BookOpen,
} from "lucide-vue-next";
import { useWorkspace } from "../../stores/workspace";
const w = useWorkspace();
const pinned = toRef(w, "pinnedCues");
const answered = computed(() => w.quizAnswers);
const seen = new Set<string>();
const active = computed(
  () =>
    w.sequence?.cues.filter(
      (c) =>
        !["chapter", "caption", "narration"].includes(c.kind) &&
        ((w.time >= c.start && w.time < (c.end ?? c.start + 5)) ||
          pinned.value.includes(c.id)),
    ) || [],
);
watch(active, (cues) => {
  const quiz = cues.find((c) => c.quiz && !seen.has(c.id));
  if (quiz && w.playerReady) {
    seen.add(quiz.id);
    w.playback("pause");
  }
});
watch(
  () => w.sequenceId,
  () => {
    pinned.value = [];
  },
);
const label = (kind: string) =>
  ({
    fact: "Key fact",
    source: "Source",
    definition: "Definition",
    warning: "Misconception",
    branch: "Take a detour",
    note: "Note",
    quiz: "Quick check",
    image: "Image detail",
    hotspot: "Explore",
  })[kind] || kind;
</script>
<template>
  <section class="context-stack" aria-label="Context Stack">
    <div class="section-heading">
      <span>IN THIS MOMENT</span><span class="count">{{ active.length }}</span>
    </div>
    <p class="context-intro">A little more to the story.</p>
    <div v-if="!active.length" class="context-empty">
      <BookOpen :size="25" />
      <p>Context appears as the story unfolds.</p>
      <span>Play or choose a chapter.</span>
    </div>
    <article
      v-for="cue in active"
      :key="cue.id"
      class="context-card"
      :class="cue.kind"
    >
      <div class="card-eyebrow">
        <span>{{ label(cue.kind) }}</span
        ><button
          class="icon-button"
          :aria-label="
            (pinned.includes(cue.id) ? 'Unpin ' : 'Pin ') +
            (cue.title || cue.kind)
          "
          :aria-pressed="pinned.includes(cue.id)"
          @click="
            pinned.includes(cue.id)
              ? (pinned = pinned.filter((i) => i !== cue.id))
              : pinned.push(cue.id)
          "
        >
          <Pin :size="13" />
        </button>
      </div>
      <h3>{{ cue.title || cue.kind }}</h3>
      <p v-if="cue.body">{{ cue.body }}</p>
      <a
        v-if="cue.url"
        :href="cue.url"
        target="_blank"
        rel="noopener noreferrer"
        >Read source <ArrowUpRight :size="14" /></a
      ><template v-if="cue.quiz"
        ><p>{{ cue.quiz.question }}</p>
        <div class="quiz-choices">
          <button
            v-for="(option, i) in cue.quiz.options"
            :key="option"
            :disabled="answered[cue.id] !== undefined"
            :class="{
              correct:
                answered[cue.id] !== undefined && i === cue.quiz.answerIndex,
            }"
            @click="answered[cue.id] = i"
          >
            <span>{{ String.fromCharCode(65 + i) }}</span
            >{{ option
            }}<CheckCircle2
              v-if="
                answered[cue.id] !== undefined && i === cue.quiz.answerIndex
              "
              :size="16"
            />
          </button>
        </div>
        <p v-if="answered[cue.id] !== undefined" role="status">
          {{
            answered[cue.id] === cue.quiz.answerIndex
              ? "Correct. "
              : "The correct answer is " +
                cue.quiz.options[cue.quiz.answerIndex] +
                ". "
          }}{{ cue.quiz.explanation }}
        </p>
        <button
          v-if="answered[cue.id] !== undefined"
          @click="w.playback('play')"
        >
          Continue film
        </button></template
      ><button
        v-if="cue.branch"
        class="branch-link"
        @click="w.branch(cue.branch.targetSequenceId, cue.branch.targetTime)"
      >
        <GitBranch :size="15" />{{ cue.branch.label }}
      </button>
    </article>
  </section>
</template>
