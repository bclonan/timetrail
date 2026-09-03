<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  ArrowRight,
  Check,
  Code2,
  Copy,
  Film,
  Layers,
  Play,
  RotateCcw,
} from "lucide-vue-next";
import {
  comparisonExamples,
  demoVideoPrompt,
  submissionAnswers,
  submissionText,
} from "../demo/hackathon";
import { nativeStatus } from "../webmcp/registry";
import { useWorkspace } from "../stores/workspace";
const w = useWorkspace();
const selected = ref(0);
const step = ref(-1);
const running = ref(false);
const expanded = ref(0);
const example = computed(() => comparisonExamples[selected.value]!);
let timer: ReturnType<typeof setInterval>;
function reset(index = selected.value) {
  clearInterval(timer);
  running.value = false;
  selected.value = index;
  step.value = -1;
  expanded.value = 0;
}
function run() {
  reset();
  running.value = true;
  step.value = 0;
  timer = setInterval(() => {
    step.value++;
    expanded.value = Math.min(step.value, example.value.calls.length - 1);
    if (
      step.value >=
      Math.max(example.value.calls.length, example.value.scrape.length)
    ) {
      clearInterval(timer);
      running.value = false;
    }
  }, 900);
}
async function copy(value: string, label: string) {
  await navigator.clipboard.writeText(value);
  w.notify(`${label} copied.`);
}
onBeforeUnmount(() => clearInterval(timer));
const shots = [
  ["00:00", "The brief", "The live editor and a real creation request."],
  [
    "00:18",
    "Why tools",
    "The illustrated comparison, then actual registered tools.",
  ],
  [
    "00:43",
    "Build",
    "Source footage, upload a file and create one storyboard proposal.",
  ],
  ["01:18", "Human review", "Preview, edit and visibly accept a draft."],
  ["01:43", "The Player", "A hotspot, a quiz and a custom Research view."],
  ["02:05", "Check and export", "A real quality report and portable export."],
  ["02:25", "How it works", "Shared services, local saving and the live URL."],
];
</script>
<template>
  <div class="hackathon page-width">
    <section class="submission-hero">
      <div>
        <p class="eyebrow">TIMETRAIL STUDIO / WEBMCP HACKATHON</p>
        <h1>Create the film.<br /><em>Keep control of every edit.</em></h1>
        <p class="submission-lead">
          A browser editor where an agent can research, build and refine an
          interactive film. You review the draft. Your audience explores the
          story.
        </p>
        <div class="hack-actions">
          <RouterLink to="/demo" class="button primary large"
            ><Play :size="17" />Try the live editor</RouterLink
          >
          <a href="#submission" class="button large"
            >Read the submission<ArrowRight :size="17"
          /></a>
        </div>
        <p class="small-text muted">
          No account required. Built for people and agents in the same browser.
        </p>
      </div>
      <div
        class="submission-art"
        aria-label="Illustration of a TimeTrail storyboard proposal"
      >
        <div class="art-top">
          <span>A BRIEF BECOMES A DRAFT</span><span>01 / OCEAN</span>
        </div>
        <div class="film-illustration">
          <img
            src="/example-assets/europa-orbit.png"
            alt="Illustrated icy world from the Europa example film"
          />
          <div>
            <span class="eyebrow">INTERACTIVE FILM</span>
            <h2>Leave room<br />for curiosity.</h2>
            <span class="art-callout"
              >What lies beneath?<ArrowRight :size="14"
            /></span>
          </div>
        </div>
        <div class="art-tracks">
          <span>Story</span><i>Opening</i><i>Explore</i><i>Check</i
          ><span>Context</span><b>Source</b><b>Hotspot</b><b>Quiz</b>
        </div>
        <div class="art-review">
          <Layers :size="17" /><span>Agent proposal</span
          ><span class="pill purple">Ready for your review</span>
        </div>
      </div>
    </section>

    <section class="judge-entry" aria-label="Judge access">
      <div>
        <p class="eyebrow">OPEN THE WORKING PRODUCT</p>
        <h2>One URL. No account required.</h2>
        <p>
          Use ChatGPT's in-app browser or Google Chrome with WebMCP enabled.
          Native availability depends on your browser configuration. The editor
          also works by hand.
        </p>
      </div>
      <div class="judge-links">
        <a href="https://timetrail-studio-bclonan.netlify.app/demo"
          >timetrail-studio-bclonan.netlify.app/demo<ArrowRight :size="16"
        /></a>
        <p><span class="live-dot" />{{ nativeStatus }}</p>
        <RouterLink to="/webmcp">Inspect tools in the WebMCP Lab</RouterLink
        ><small
          >The Lab labels its local fallback. It does not claim native
          execution.</small
        >
      </div>
    </section>

    <section id="comparison" class="comparison-section">
      <div class="section-title">
        <div>
          <p class="eyebrow">THE SAME EDIT, TWO WAYS</p>
          <h2>Give the agent the editor's vocabulary.</h2>
        </div>
        <Code2 :size="27" />
      </div>
      <p class="muted">
        Screens, clips and cues already have structure. A tool call can carry
        that structure all the way to a reviewable draft.
      </p>
      <div class="scenario-tabs" role="group" aria-label="Comparison scenario">
        <button
          v-for="(item, index) in comparisonExamples"
          :key="item.id"
          :aria-pressed="selected === index"
          @click="reset(index)"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="comparison-brief">
        <p>"{{ example.brief }}"</p>
        <div class="hack-actions">
          <button class="primary" :disabled="running" @click="run">
            <Play :size="15" />Run illustration</button
          ><button @click="reset()"><RotateCcw :size="14" />Reset</button>
        </div>
      </div>
      <p class="simulation-note">
        Illustrated workflow, not a running agent or a speed benchmark. These
        cards do not edit a project. Example IDs stand in for values returned by
        real tools.
      </p>
      <div class="comparison-grid">
        <article class="comparison-card scrape-card">
          <p class="eyebrow">THROUGH THE INTERFACE</p>
          <h3>Agent must scrape</h3>
          <p>
            Read the page, locate the control, fill the form, then check what
            changed.
          </p>
          <ol>
            <li
              v-for="(text, index) in example.scrape"
              :key="text"
              :class="{ reached: step >= index }"
            >
              <span>{{ String(index + 1).padStart(2, "0") }}</span>
              <p>{{ text }}</p>
              <Check v-if="step >= index" :size="15" />
            </li>
          </ol>
          <p class="comparison-foot">
            Useful for visual checks and websites without tools. Time and state
            still need interpretation.
          </p>
        </article>
        <article class="comparison-card tools-card">
          <p class="eyebrow">THROUGH WEBMCP</p>
          <h3>Agent calls tools</h3>
          <p>
            Use named actions with validated arguments and inspect the returned
            result.
          </p>
          <div class="tool-blocks">
            <section
              v-for="(call, index) in example.calls"
              :key="call.name"
              :class="{ reached: step >= index }"
            >
              <button
                :aria-expanded="expanded === index"
                @click="expanded = expanded === index ? -1 : index"
              >
                <Code2 :size="16" /><code>{{ call.name }}</code
                ><Check v-if="step >= index" :size="15" />
              </button>
              <div v-if="expanded === index">
                <pre>{{ JSON.stringify(call.input, null, 2) }}</pre>
                <p>{{ call.result }}</p>
              </div>
            </section>
          </div>
          <p class="comparison-foot">
            The human still reviews the draft and accepts changes. Tool access
            does not replace judgment.
          </p>
        </article>
      </div>
      <p class="reference-note">
        Comparison format inspired by the
        <a
          href="https://googlechromelabs.github.io/webmcp-tools/demos/explainer/"
          target="_blank"
          rel="noopener noreferrer"
          >Google Chrome Labs WebMCP explainer</a
        >. The examples here use TimeTrail's own tools.
      </p>
    </section>

    <section id="submission" class="submission-section">
      <div class="section-title">
        <div>
          <p class="eyebrow">HACKATHON SUBMISSION</p>
          <h2>What we built, and why it matters.</h2>
        </div>
        <button @click="w.run(() => copy(submissionText, 'Submission text'))">
          <Copy :size="15" />Copy submission text
        </button>
      </div>
      <p class="submission-intro">
        TimeTrail joins source research, timeline editing and interactive
        viewing. Its portable project model describes the media, screens, timed
        context, branches and Player layouts. Agents work through the same
        services as the visible editor.
      </p>
      <div class="answer-grid">
        <article
          v-for="(answer, index) in submissionAnswers"
          :key="answer.question"
        >
          <span class="answer-number">0{{ index + 1 }}</span>
          <h3>{{ answer.question }}</h3>
          <p>{{ answer.answer }}</p>
        </article>
      </div>
      <div class="implementation-flow" aria-label="Implementation flow">
        <div>
          <span>01</span><strong>Browser tools</strong
          ><code>document.modelContext</code>
        </div>
        <ArrowRight :size="18" />
        <div>
          <span>02</span><strong>Validated input</strong
          ><small>JSON Schema + Zod</small>
        </div>
        <ArrowRight :size="18" />
        <div>
          <span>03</span><strong>Shared services</strong
          ><small>UI and agent use the same actions</small>
        </div>
        <ArrowRight :size="18" />
        <div>
          <span>04</span><strong>Your review</strong
          ><small>Preview, accept, save locally</small>
        </div>
      </div>
    </section>

    <section class="example-section">
      <div class="section-title">
        <div>
          <p class="eyebrow">OPEN A FINISHED EXAMPLE</p>
          <h2>The film has a life beyond the editor.</h2>
        </div>
        <RouterLink to="/examples"
          >All 41 creation prompts<ArrowRight :size="15"
        /></RouterLink>
      </div>
      <div class="hack-examples">
        <RouterLink to="/player/example_europa?view=research"
          ><Film :size="23" />
          <h3>Europa field notes</h3>
          <p>A science explainer with footage, sources and Research panels.</p>
          <span>Open Player<ArrowRight :size="15" /></span></RouterLink
        ><RouterLink to="/player/example_phishing"
          ><Layers :size="23" />
          <h3>Spot the phish</h3>
          <p>A branching lesson with a quiz and viewer choices.</p>
          <span>Open Player<ArrowRight :size="15" /></span></RouterLink
        ><RouterLink to="/player/example_atlas"
          ><Code2 :size="23" />
          <h3>Atlas product tour</h3>
          <p>Product storytelling with custom views and interactive context.</p>
          <span>Open Player<ArrowRight :size="15" /></span
        ></RouterLink>
      </div>
    </section>

    <section id="demo-video" class="video-section">
      <div>
        <p class="eyebrow">THE SUBMISSION VIDEO</p>
        <h2>A real walkthrough.<br /><em>Two minutes, forty seconds.</em></h2>
        <p>
          Show the live product, actual tool calls, human review and the
          finished Player. Include audible narration and keep the final
          recording under three minutes.
        </p>
        <div class="hack-actions">
          <button
            class="primary"
            @click="w.run(() => copy(demoVideoPrompt, 'Demo video prompt'))"
          >
            <Copy :size="16" />Copy demo video prompt</button
          ><a class="button" href="/examples/hackathon-submission.md" download
            >Download submission</a
          >
        </div>
        <div class="video-delivery">
          <strong>YouTube delivery</strong>
          <p>
            Record and publish the final video as Public, then add its YouTube
            URL to the submission form. No demo video URL has been supplied yet.
            TimeTrail's interactive HTML and ZIP exports are separate from the
            required video recording.
          </p>
        </div>
        <details>
          <summary>Read the complete production prompt</summary>
          <pre class="video-prompt">{{ demoVideoPrompt }}</pre>
        </details>
      </div>
      <ol class="shot-list">
        <li v-for="shot in shots" :key="shot[0]">
          <time>{{ shot[0] }}</time>
          <div>
            <h3>{{ shot[1] }}</h3>
            <p>{{ shot[2] }}</p>
          </div>
        </li>
      </ol>
    </section>
    <footer class="hack-footer">
      <span>TimeTrail Studio · Vue, TypeScript, FrameTrail and WebMCP</span
      ><RouterLink to="/webmcp"
        >Open the tool Lab<ArrowRight :size="14"
      /></RouterLink>
    </footer>
  </div>
</template>

<style scoped>
.hackathon {
  padding-top: 50px;
  padding-bottom: 28px;
}
.submission-hero {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  gap: 64px;
  align-items: center;
  padding: 20px 0 64px;
}
.submission-hero h1 {
  font-size: clamp(38px, 4.2vw, 62px);
  line-height: 1.12;
  letter-spacing: -1.5px;
  margin: 22px 0;
}
.submission-lead {
  max-width: 540px;
  font-size: 17px;
  line-height: 1.75;
  color: var(--muted);
}
.hack-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 22px 0;
}
.submission-art {
  border: 1px solid #48523e;
  border-radius: 12px;
  background: #192419;
  overflow: hidden;
  box-shadow: 0 25px 80px #0005;
}
.art-top {
  display: flex;
  justify-content: space-between;
  padding: 18px 20px;
  font-size: 9px;
  letter-spacing: 1.8px;
  color: #bac9a6;
}
.film-illustration {
  position: relative;
  min-height: 255px;
  overflow: hidden;
}
.film-illustration img {
  width: 100%;
  height: 100%;
  position: absolute;
  object-fit: cover;
  opacity: 0.38;
}
.film-illustration > div {
  position: relative;
  padding: 34px;
  background: linear-gradient(90deg, #10201be8, transparent);
}
.film-illustration h2 {
  font-size: 40px;
  line-height: 1.12;
  margin: 15px 0 24px;
}
.art-callout {
  display: inline-flex;
  align-items: center;
  gap: 18px;
  border: 1px solid #a2be82;
  padding: 9px 13px;
  border-radius: 6px;
  background: #162c24bb;
  font-size: 11px;
}
.art-tracks {
  display: grid;
  grid-template-columns: 45px 1.2fr 1fr 0.65fr;
  gap: 6px;
  padding: 18px 20px;
  font-size: 10px;
  align-items: center;
}
.art-tracks > span {
  color: var(--muted);
  font-size: 9px;
}
.art-tracks i,
.art-tracks b {
  font-style: normal;
  font-weight: 400;
  border-radius: 3px;
  padding: 9px;
  background: #526945;
  color: #f0f3e6;
}
.art-tracks b {
  background: #65596e;
}
.art-review {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 20px;
  border-top: 1px solid #44533c;
  font-size: 11px;
}
.art-review .pill {
  margin-left: auto;
}
.judge-entry {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 45px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 30px;
  background: #192018;
}
.judge-entry h2 {
  font-size: 27px;
  margin: 12px 0;
}
.judge-entry p {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.8;
  margin-bottom: 0;
}
.judge-links {
  align-self: center;
  min-width: 0;
}
.judge-links > a {
  display: flex;
  gap: 10px;
  align-items: center;
  color: var(--accent);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.judge-links p {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 15px 0;
}
.judge-links small {
  display: block;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.7;
  margin-top: 8px;
}
.comparison-section,
.submission-section,
.example-section,
.video-section {
  padding-top: 76px;
}
.section-title {
  gap: 24px;
}
.section-title h2 {
  font-size: 34px;
  line-height: 1.2;
  margin: 12px 0;
}
.section-title .eyebrow {
  margin: 0;
}
.scenario-tabs {
  display: flex;
  gap: 8px;
  margin: 26px 0 20px;
  flex-wrap: wrap;
}
.scenario-tabs button[aria-pressed="true"] {
  color: var(--accent);
  border-color: #829a69;
  background: #273421;
}
.comparison-brief {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 18px 23px;
  border: 1px solid var(--line);
  background: #191e19;
  border-radius: 9px;
}
.comparison-brief p {
  font-family: Georgia, serif;
  font-size: 19px;
  margin: 0;
}
.comparison-brief .hack-actions {
  margin: 0;
  flex-shrink: 0;
}
.simulation-note,
.reference-note {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.8;
  margin: 13px 0 22px;
}
.reference-note a {
  color: var(--accent);
  text-decoration: underline;
}
.comparison-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
  align-items: start;
}
.comparison-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 27px;
  min-width: 0;
}
.tools-card {
  border-color: #5a6d45;
  background: #1b2419;
}
.comparison-card h3 {
  font-size: 26px;
  margin: 12px 0;
}
.comparison-card > p {
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
}
.comparison-card ol {
  list-style: none;
  padding: 0;
  margin: 24px 0;
}
.comparison-card li {
  display: flex;
  gap: 14px;
  align-items: center;
  border: 1px solid #394034;
  border-radius: 7px;
  padding: 13px;
  margin: 10px 0;
  opacity: 0.65;
  transition: opacity 0.2s;
}
.comparison-card li > span {
  font-family: monospace;
  font-size: 11px;
  color: var(--muted);
}
.comparison-card li p {
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  flex: 1;
}
.comparison-card li.reached {
  opacity: 1;
  border-color: #7f8465;
}
.tool-blocks {
  display: grid;
  gap: 10px;
  margin-top: 24px;
}
.tool-blocks > section {
  border: 1px solid #49553a;
  border-radius: 7px;
  overflow: hidden;
}
.tool-blocks > section.reached {
  border-color: #b0d780;
}
.tool-blocks button {
  width: 100%;
  justify-content: flex-start;
  border: 0;
  border-radius: 0;
  padding: 14px 12px;
  background: #24321f;
  text-align: left;
  white-space: normal;
}
.tool-blocks code {
  font-size: 11px;
  overflow-wrap: anywhere;
}
.tool-blocks button svg:last-child {
  margin-left: auto;
}
.tool-blocks pre {
  font-size: 10px;
  line-height: 1.7;
  padding: 16px;
  margin: 0;
  background: #101a12;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #d1e3b9;
}
.tool-blocks section p {
  font-size: 11px;
  line-height: 1.7;
  margin: 0;
  padding: 12px 16px;
  border-top: 1px solid #39472f;
  color: #c2d0b1;
}
.comparison-foot {
  margin: 24px 0 0;
  border-top: 1px solid var(--line);
  padding-top: 16px;
}
.submission-intro {
  color: var(--muted);
  font-size: 15px;
  line-height: 1.9;
  max-width: 850px;
}
.answer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 25px;
  margin: 28px 0;
}
.answer-grid article {
  border-top: 1px solid #58634a;
  padding: 24px 0 10px;
}
.answer-number {
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--accent);
}
.answer-grid h3 {
  font-size: 22px;
  line-height: 1.4;
  max-width: 440px;
  margin: 14px 0;
}
.answer-grid p {
  font-size: 13px;
  line-height: 1.9;
  color: var(--muted);
  max-width: 550px;
}
.implementation-flow {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #182117;
  border: 1px solid #3a4732;
  border-radius: 9px;
  padding: 25px;
}
.implementation-flow > div {
  display: grid;
  gap: 9px;
  flex: 1;
  min-width: 0;
}
.implementation-flow span {
  font-size: 9px;
  letter-spacing: 2px;
  color: var(--accent);
}
.implementation-flow strong {
  font-size: 12px;
}
.implementation-flow code,
.implementation-flow small {
  font-size: 10px;
  color: var(--muted);
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.implementation-flow > svg {
  color: #8ca973;
  flex-shrink: 0;
}
.hack-examples {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-top: 25px;
}
.hack-examples > a {
  display: block;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 26px;
  background: var(--panel);
}
.hack-examples > a:hover {
  border-color: #90ab73;
}
.hack-examples h3 {
  font-size: 24px;
  margin: 18px 0 12px;
}
.hack-examples p {
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
  min-height: 44px;
}
.hack-examples span {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--accent);
  font-size: 11px;
  margin-top: 20px;
}
.video-section {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 65px;
}
.video-section h2 {
  font-size: 38px;
  line-height: 1.18;
  margin: 18px 0;
}
.video-section p {
  font-size: 13px;
  line-height: 1.85;
  color: var(--muted);
}
.video-delivery {
  border-left: 2px solid #a9c587;
  padding: 0 0 0 17px;
  margin: 30px 0;
}
.video-delivery strong {
  font-size: 12px;
}
.video-prompt {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 430px;
  overflow: auto;
  font:
    12px/1.8 Inter,
    Arial,
    sans-serif;
  background: #1b2419;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 6px;
}
.shot-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.shot-list li {
  display: flex;
  gap: 24px;
  border-bottom: 1px solid var(--line);
  padding: 16px 0;
}
.shot-list time {
  color: var(--accent);
  font: 11px/1.7 monospace;
  min-width: 40px;
}
.shot-list h3 {
  font-family: Inter, Arial, sans-serif;
  font-size: 13px;
  margin: 0 0 7px;
}
.shot-list p {
  font-size: 12px;
  margin: 0;
}
.hack-footer {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin-top: 65px;
  border-top: 1px solid var(--line);
  padding-top: 24px;
  color: var(--muted);
  font-size: 11px;
}
.hack-footer a {
  display: flex;
  gap: 10px;
  align-items: center;
  color: var(--accent);
}
@media (max-width: 1000px) {
  .submission-hero {
    gap: 30px;
  }
  .judge-entry {
    gap: 25px;
  }
  .comparison-brief {
    align-items: flex-start;
    flex-direction: column;
  }
  .video-section {
    gap: 30px;
  }
  .implementation-flow {
    gap: 10px;
    padding: 20px;
  }
  .section-title {
    flex-wrap: wrap;
  }
}
@media (max-width: 720px) {
  .hackathon {
    padding-top: 22px;
  }
  .submission-hero,
  .judge-entry,
  .comparison-grid,
  .answer-grid,
  .video-section {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .submission-hero {
    padding-bottom: 35px;
  }
  .submission-hero h1 {
    font-size: 39px;
  }
  .submission-lead {
    font-size: 15px;
  }
  .judge-entry {
    padding: 22px;
  }
  .comparison-section,
  .submission-section,
  .example-section,
  .video-section {
    padding-top: 48px;
  }
  .comparison-card {
    padding: 21px;
  }
  .section-title h2 {
    font-size: 29px;
  }
  .hack-examples {
    grid-template-columns: 1fr;
  }
  .implementation-flow {
    display: grid;
    grid-template-columns: 1fr;
  }
  .implementation-flow > svg {
    transform: rotate(90deg);
  }
  .hack-footer {
    flex-direction: column;
  }
  .video-section h2 {
    font-size: 33px;
  }
  .film-illustration {
    min-height: 230px;
  }
  .art-review {
    padding: 13px;
    font-size: 10px;
  }
  .hack-actions .button,
  .hack-actions button {
    white-space: normal;
  }
  .comparison-brief {
    padding: 18px;
  }
  .answer-grid {
    gap: 12px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .comparison-card li {
    transition: none;
  }
}
</style>
