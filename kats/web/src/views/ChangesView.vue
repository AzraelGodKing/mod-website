<script setup>
import { computed, ref } from "vue";
import { useQueryState } from "../composables/useQueryState";
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

const only = useQueryState("list", "");
const changedOnly = useQueryState("changed", true);
const SHOW = 24;
const expanded = ref(new Set());
function toggle(id) {
  const next = new Set(expanded.value);
  next.has(id) ? next.delete(id) : next.add(id);
  expanded.value = next;
}

const allSections = computed(() => {
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

const sections = computed(() =>
  allSections.value.filter(
    (section) => (!only.value || section.name === only.value) && (!changedOnly.value || section.parts.length || !section.diff),
  ),
);
const unchanged = computed(() => allSections.value.filter((section) => section.diff && !section.parts.length).map((s) => s.title));

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
      lede="What the latest catalog update added, removed, repriced, and turned on or off."
    />
    <main class="changes">
      <p v-if="state === 'ready' && updated" class="muted changes-when">The catalog was last updated {{ updated }} ({{ ago }}).</p>
      <div v-if="state === 'loading'" class="empty loading" role="status">Loading catalog…</div>
      <div v-else-if="state === 'error'" class="empty error" role="alert">
        <p>{{ error }}</p>
        <button type="button" class="retry-btn" @click="retry">Try again</button>
      </div>
      <div v-else-if="allSections.length" class="change-filters" role="group" aria-label="Show lists">
        <button type="button" :class="['chip', { active: !only }]" :aria-pressed="!only ? 'true' : 'false'" @click="only = ''">All</button>
        <button
          v-for="section in allSections"
          :key="section.name"
          type="button"
          :class="['chip', { active: only === section.name }]"
          :aria-pressed="only === section.name ? 'true' : 'false'"
          @click="only = section.name"
        >
          {{ section.title }}<template v-if="section.parts.length"> · {{ section.parts.reduce((n, p) => n + section.diff[p.key].total, 0) }}</template>
        </button>
        <label class="toggle"><input v-model="changedOnly" type="checkbox"> Hide lists with no changes</label>
      </div>
      <div v-if="state === 'ready' && !allSections.length" class="empty">
        No comparison was saved with this update. The next upload will list new items, removals, and price changes here.
      </div>
      <template v-if="state === 'ready' && allSections.length">
        <p v-if="changedOnly && unchanged.length && !only" class="muted">No changes in {{ unchanged.join(", ") }}.</p>
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
              <li
                v-for="(entry, i) in expanded.has(`${section.name}-${part.key}`) ? section.diff[part.key].list : section.diff[part.key].list.slice(0, SHOW)"
                :key="i"
              >
                <router-link :to="link(section.name, entry)">{{ typeof entry === "string" ? entry : entry.name }}</router-link>
                <span v-if="part.key === 'prices'" class="price-move">
                  {{ fmt(entry.from) }} → {{ fmt(entry.to) }}
                </span>
              </li>
            </ul>
            <button
              v-if="section.diff[part.key].list.length > SHOW"
              type="button"
              class="link-btn"
              @click="toggle(`${section.name}-${part.key}`)"
            >
              {{ expanded.has(`${section.name}-${part.key}`) ? "Show fewer" : `Show all ${section.diff[part.key].list.length}` }}
            </button>
            <p v-if="section.diff[part.key].total > section.diff[part.key].list.length" class="muted">
              and {{ fmt(section.diff[part.key].total - section.diff[part.key].list.length) }} more
            </p>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
