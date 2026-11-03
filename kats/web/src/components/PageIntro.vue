<script setup>
defineProps({
  kicker: { type: String, default: "Catalog" },
  title: String,
  lede: String,
  stats: { type: Array, default: () => [] },
});

const wide = typeof window === "undefined" || !window.matchMedia || window.matchMedia("(min-width: 641px)").matches;
</script>

<template>
  <section class="page-intro">
    <p class="kicker">{{ kicker }}</p>
    <h1>{{ title }}</h1>
    <p class="lede">{{ lede }}</p>
    <div v-if="stats.length" class="meta-row">
      <span v-for="stat in stats" :key="stat.label" class="stat-card">
        <b>{{ stat.value }}</b>
        <em>{{ stat.label }}</em>
      </span>
    </div>
    <details v-if="$slots.default" class="hint" :open="wide">
      <summary class="hint-label">Chat</summary>
      <div class="hint-body">
        <slot />
      </div>
    </details>
  </section>
</template>
