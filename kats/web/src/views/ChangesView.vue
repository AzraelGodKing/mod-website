<script setup>
import { computed, ref } from "vue";
import PageIntro from "../components/PageIntro.vue";
import { loadJson, fmt, longDate, relativeTime, useLoader } from "../lib/data";
import { CATALOG_PAGES } from "../lib/catalogs";

const meta = ref(null);
const { state, error, retry } = useLoader(async () => {
  meta.value = await loadJson("meta");
});

const PARTS = [
  { key: "added", title: "New" },
  { key: "removed", title: "Removed" },
  { key: "prices", title: "Price changes" },
  { key: "enabled", title: "Turned on" },
  { key: "disabled", title: "Turned off" },
];

const sections = computed(() => {
  const changes = meta.value?.changes ?? {};
  return Object.entries(changes)
    .filter(([name]) => CATALOG_PAGES[name])
    .map(([name, diff]) => ({
      name,
      title: CATALOG_PAGES[name].title,
      diff,
      parts: diff ? PARTS.filter((part) => diff[part.key]?.total > 0) : [],
    }));
});

const updated = computed(() => longDate(meta.value?.updatedAt));
const ago = computed(() => relativeTime(meta.value?.updatedAt));

function link(name, entry) {
  return CATALOG_PAGES[name].link(typeof entry === "string" ? entry : entry.name);
}
</script>

<template>
  <div class="page-shell">
    <PageIntro
      kicker="Channel 08"
      title="What changed"
      :lede="updated ? `The catalog was last updated ${updated} (${ago}). Here's what that update changed.` : 'What the latest catalog update changed.'"
    />
    <main class="changes">
      <div v-if="state === 'loading'" class="empty" role="status">Loading catalog…</div>
      <div v-else-if="state === 'error'" class="empty error" role="alert">
        <p>{{ error }}</p>
        <button type="button" class="retry-btn" @click="retry">Try again</button>
      </div>
      <div v-else-if="!sections.length" class="empty">
        No comparison was saved with this update. The next upload will list new items, removals, and price changes here.
      </div>
      <template v-else>
        <section v-for="section in sections" :key="section.name" class="change-card">
          <header>
            <h2>{{ section.title }}</h2>
            <span v-if="section.diff" class="change-count">{{ fmt(section.diff.before) }} → {{ fmt(section.diff.after) }}</span>
          </header>
          <p v-if="!section.diff" class="muted">This list was uploaded, but there was nothing earlier to compare it with.</p>
          <p v-else-if="!section.parts.length" class="muted">No changes.</p>
          <div v-for="part in section.parts" :key="part.key" class="change-part">
            <h3>{{ part.title }} <span class="change-count">{{ fmt(section.diff[part.key].total) }}</span></h3>
            <ul class="change-list">
              <li v-for="(entry, i) in section.diff[part.key].list" :key="i">
                <router-link :to="link(section.name, entry)">{{ typeof entry === "string" ? entry : entry.name }}</router-link>
                <span v-if="part.key === 'prices'" class="price-move">
                  {{ fmt(entry.from) }} → {{ fmt(entry.to) }}
                </span>
              </li>
            </ul>
            <p v-if="section.diff[part.key].total > section.diff[part.key].list.length" class="muted">
              and {{ fmt(section.diff[part.key].total - section.diff[part.key].list.length) }} more
            </p>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
