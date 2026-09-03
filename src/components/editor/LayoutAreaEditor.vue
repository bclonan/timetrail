<script setup lang="ts">
import type { LayoutArea } from "../../domain/layoutAreas";
const areas = defineModel<LayoutArea[]>({ default: () => [] });
function add() {
  const area = (["right", "left", "bottom", "top"] as const).find(
    (side) => areas.value.filter((a) => a.area === side).length < 4,
  );
  if (area)
    areas.value = [
      ...areas.value,
      {
        area,
        content: "notes",
        title: "Notes",
        size: "medium",
        collapsed: false,
      },
    ];
}
</script>
<template>
  <fieldset class="area-editor">
    <legend>FrameTrail sidebars and areas</legend>
    <p class="small-text muted">
      Place tabs beside, above or below the video. Viewers can open and close
      them in any Player view and in interactive exports.
    </p>
    <div class="area-map" aria-label="Layout area positions">
      <span>Top</span>
      <div><span>Left</span><strong>Video</strong><span>Right</span></div>
      <span>Bottom</span>
    </div>
    <section
      v-for="(area, index) in areas"
      :key="index"
      class="area-fields"
      :aria-label="`Area tab ${index + 1}`"
    >
      <div class="form-row">
        <label
          >Tab title<input v-model="area.title" maxlength="80" required
        /></label>
        <label
          >Area<select v-model="area.area">
            <option>left</option>
            <option>right</option>
            <option>top</option>
            <option>bottom</option>
          </select></label
        >
      </div>
      <div class="form-row">
        <label
          >Content<select v-model="area.content">
            <option value="notes">Notes and sources</option>
            <option value="transcript">Transcript</option>
            <option value="chapters">Chapters</option>
            <option value="timelines">FrameTrail timelines</option>
            <option value="text">Custom text</option>
          </select></label
        >
        <label
          >Size<select v-model="area.size">
            <option>small</option>
            <option>medium</option>
            <option>large</option>
          </select></label
        >
      </div>
      <label v-if="area.content === 'text'"
        >Text<textarea v-model="area.text" maxlength="8000" />
      </label>
      <div class="area-actions">
        <label
          ><input type="checkbox" v-model="area.collapsed" /> Start
          closed</label
        ><button
          type="button"
          @click="areas = areas.filter((_, i) => i !== index)"
        >
          Remove tab
        </button>
      </div>
    </section>
    <button type="button" :disabled="areas.length >= 16" @click="add">
      Add area tab
    </button>
    <p class="small-text muted">
      Captions supply the transcript. Chapter and note buttons seek to their
      time. These areas belong to this screen.
    </p>
  </fieldset>
</template>
<style scoped>
.area-editor {
  margin: 20px 0;
  padding: 16px;
  border: 1px solid var(--border, #43523b);
  border-radius: 8px;
  min-width: 0;
}
.area-editor legend {
  padding: 0 8px;
}
.area-map {
  display: grid;
  gap: 5px;
  text-align: center;
  font-size: 12px;
  margin: 12px auto;
  max-width: 300px;
}
.area-map span {
  background: #263c2c;
  border-radius: 4px;
  padding: 5px;
}
.area-map div {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 5px;
  align-items: center;
}
.area-fields {
  padding: 12px 0;
  border-top: 1px solid #43523b;
}
.area-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
