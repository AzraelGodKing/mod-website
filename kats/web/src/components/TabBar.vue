<script setup>
const props = defineProps({
  tabs: { type: Array, required: true },
  modelValue: { type: String, required: true },
  label: { type: String, default: "Sections" },
});
const emit = defineEmits(["update:modelValue"]);

function select(id, focus = false) {
  emit("update:modelValue", id);
  if (focus) requestAnimationFrame(() => document.getElementById(`tab-${id}`)?.focus());
}

function onKey(event) {
  const index = props.tabs.findIndex((tab) => tab.id === props.modelValue);
  let next = -1;
  if (event.key === "ArrowRight") next = (index + 1) % props.tabs.length;
  else if (event.key === "ArrowLeft") next = (index - 1 + props.tabs.length) % props.tabs.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = props.tabs.length - 1;
  if (next < 0) return;
  event.preventDefault();
  select(props.tabs[next].id, true);
}
</script>

<template>
  <div class="tabs" role="tablist" :aria-label="label" @keydown="onKey">
    <button
      v-for="tab in tabs"
      :id="`tab-${tab.id}`"
      :key="tab.id"
      type="button"
      role="tab"
      :class="{ active: modelValue === tab.id }"
      :aria-selected="modelValue === tab.id ? 'true' : 'false'"
      :aria-controls="`panel-${tab.id}`"
      :tabindex="modelValue === tab.id ? 0 : -1"
      @click="select(tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
