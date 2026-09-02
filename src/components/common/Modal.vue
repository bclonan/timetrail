<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { X } from "lucide-vue-next";
defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
let prior: HTMLElement | null = null;
onMounted(() => {
  prior = document.activeElement as HTMLElement;
  dialog.value?.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  prior?.focus();
});
</script>
<template>
  <dialog
    ref="dialog"
    class="modal"
    aria-labelledby="dialog-title"
    @cancel.prevent="emit('close')"
  >
    <header>
      <h2 id="dialog-title">{{ title }}</h2>
      <button
        class="icon-button"
        aria-label="Close dialog"
        @click="emit('close')"
      >
        <X :size="20" />
      </button>
    </header>
    <slot />
  </dialog>
</template>
