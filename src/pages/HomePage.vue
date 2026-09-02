<script setup lang="ts">
import { ref, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { ArrowRight, Play, Film, Layers, HardDrive } from "lucide-vue-next";
import { storage } from "../storage/BrowserWorkspaceStore";
import type { ProjectRecord } from "../domain/model";
const recent = ref<ProjectRecord[]>([]);
onMounted(
  async () =>
    (recent.value = (await storage.records())
      .sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt))
      .slice(0, 3)),
);
</script>
<template>
  <div class="home page-width">
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">
          <span class="live-dot" />A NEW WAY TO TELL WHAT YOU KNOW
        </p>
        <h1>Turn a search into<br />an <em>interactive film.</em></h1>
        <p class="hero-description">
          Bring your sources together. Give them a timeline.<br />Make room for
          the questions along the way.
        </p>
        <div class="hero-actions">
          <RouterLink to="/new" class="button primary large"
            >Start a story<ArrowRight :size="18" /></RouterLink
          ><RouterLink to="/demo" class="button large subtle"
            ><Play :size="16" />Explore the demo</RouterLink
          >
        </div>
        <p class="local-note">
          <HardDrive :size="14" />Made on your device. Yours to keep.
        </p>
      </div>
      <RouterLink
        to="/demo"
        class="hero-art"
        aria-label="Watch How DNA Becomes a Protein"
        ><div class="art-top">
          <span>FEATURED STORY</span><span>01 / BIOLOGY</span>
        </div>
        <img
          src="/demo-assets/dna.svg"
          alt="A locally drawn DNA double helix"
        />
        <div class="art-caption">
          <div>
            <span>90 SECONDS OF CURIOSITY</span>
            <h2>How DNA becomes<br />a protein.</h2>
          </div>
          <span class="round-play"><Play :size="24" /></span>
        </div>
        <div class="floating-note">
          <span class="small-dot" />Definition at 0:03<br /><strong
            >It starts with a code.</strong
          >
        </div></RouterLink
      >
    </section>
    <section class="home-strip">
      <div>
        <Film :size="22" />
        <p>
          <strong>Build from what you find.</strong
          ><span>Videos, images, documents, and your own words.</span>
        </p>
      </div>
      <div>
        <Layers :size="22" />
        <p>
          <strong>Let an agent draft the story.</strong
          ><span>Review each proposed change before it goes live.</span>
        </p>
      </div>
      <div>
        <HardDrive :size="22" />
        <p>
          <strong>Take the whole thing with you.</strong
          ><span>Share a code or export a portable project.</span>
        </p>
      </div>
    </section>
    <section class="recent">
      <div class="section-title">
        <h2>
          {{
            recent.length ? "Pick up your story" : "Your next story starts here"
          }}
        </h2>
        <RouterLink to="/discover"
          >All projects <ArrowRight :size="15"
        /></RouterLink>
      </div>
      <div v-if="recent.length" class="project-grid">
        <RouterLink
          v-for="r in recent"
          :key="r.project.id"
          :to="'/project/' + r.project.id"
          class="project-card"
          ><div class="project-thumbnail"><Film :size="36" /></div>
          <span class="eyebrow">ON THIS DEVICE</span>
          <h3>{{ r.project.title }}</h3>
          <p>
            {{ r.project.sequences[0]?.durationSeconds }} seconds ·
            {{ r.project.media.length }} resources
          </p></RouterLink
        >
      </div>
      <div v-else class="prompt-card">
        <span class="eyebrow">TRY A TOPIC</span>
        <p>"How does a tiny seed become a forest?"</p>
        <RouterLink to="/new" class="button"
          >Make it a story<ArrowRight :size="16"
        /></RouterLink>
      </div>
    </section>
  </div>
</template>
