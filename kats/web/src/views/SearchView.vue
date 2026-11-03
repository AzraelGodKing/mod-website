<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useLocal } from "../composables/useLocal.js";
import PageIntro from "../components/PageIntro.vue";
import { loadJson, fmt, useLoader } from "../lib/data";
import { CATALOG_PAGES, chatCommand, rowsOf, searchCatalog } from "../lib/catalogs";
import { copyText } from "../composables/useCopy";
import { useQueryState } from "../composables/useQueryState";

const NAMES = Object.keys(CATALOG_PAGES);
const q = useQueryState("q", "");
const catalogs = ref({});

const { state, error, retry } = useLoader(async () => {
  const loaded = await Promise.all(
    NAMES.map((name) =>
      loadJson(name)
        .then((rows) => [name, rows.map(rowsOf[name])])
        .catch(() => [name, null]),
    ),
  );
  if (loaded.every(([, rows]) => rows == null)) throw new Error("The catalogs could not be loaded.");
  catalogs.value = Object.fromEntries(loaded);
});

const groups = computed(() =>
  NAMES.map((name) => ({ name, title: CATALOG_PAGES[name].title, ...searchCatalog(name, catalogs.value[name] ?? [], q.value) }))
    .filter((group) => group.total > 0),
);
const total = computed(() => groups.value.reduce((sum, group) => sum + group.total, 0));
const recent = useLocal("katsrics-recent-searches", []);
let saveTimer;
watch([q, total], () => {
  clearTimeout(saveTimer);
  const term = q.value.trim();
  if (term.length < 2 || !total.value) return;
  saveTimer = setTimeout(() => {
    recent.value = [term, ...recent.value.filter((t) => t.toLowerCase() !== term.toLowerCase())].slice(0, 8);
  }, 900);
});
onBeforeUnmount(() => clearTimeout(saveTimer));

function clearRecent() {
  recent.value = [];
}

// Arrow keys move between results; Enter follows the focused one.
function onKey(event) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const hits = [...document.querySelectorAll(".search-results .hit-label")];
  if (!hits.length) return;
  event.preventDefault();
  const at = hits.indexOf(document.activeElement);
  const next = event.key === "ArrowDown" ? Math.min(hits.length - 1, at + 1) : at - 1;
  if (next < 0) document.querySelector(".search-box")?.focus();
  else hits[next].focus();
}

const missing = computed(() => NAMES.filter((name) => state.value === "ready" && catalogs.value[name] == null));
</script>

<template>
  <div class="page-shell">
    <PageIntro kicker="All channels" title="Search" lede="Search the store, traits, events, weather, commands, genes, backstories, and Isekai at once." />
    <div class="controls">
      <input v-model="q" class="search-box" type="search" placeholder="Search everything… (at least 2 letters)" aria-label="Search every catalog" autofocus @keydown="onKey">
      <span v-if="state === 'ready' && q.trim().length > 1" class="count">{{ fmt(total) }} match{{ total === 1 ? "" : "es" }}</span>
    </div>
    <main class="search-results" @keydown="onKey">
      <div v-if="state === 'loading'" class="empty" role="status">Loading catalog…</div>
      <div v-else-if="state === 'error'" class="empty error" role="alert">
        <p>{{ error }}</p>
        <button type="button" class="retry-btn" @click="retry">Try again</button>
      </div>
      <template v-else-if="q.trim().length < 2">
        <div v-if="recent.length" class="recent" aria-label="Recent searches">
          <span class="muted">Recent:</span>
          <button v-for="term in recent" :key="term" type="button" class="chip" @click="q = term">{{ term }}</button>
          <button type="button" class="link-btn" @click="clearRecent">Clear</button>
        </div>
        <div class="empty">Type at least two letters to search every catalog. Use the arrow keys to move through results.</div>
      </template>
      <div v-else-if="!groups.length" class="empty">Nothing matches “{{ q }}”.</div>
      <template v-else>
        <section v-for="group in groups" :key="group.name" class="change-card">
          <header>
            <h2>{{ group.title }}</h2>
            <router-link class="change-count" :to="CATALOG_PAGES[group.name].link(q.trim())">
              See all {{ fmt(group.total) }} →
            </router-link>
          </header>
          <ul class="hit-list">
            <li v-for="(hit, i) in group.hits" :key="i">
              <router-link :to="CATALOG_PAGES[group.name].link(hit.label)" class="hit-label">{{ hit.label }}</router-link>
              <span class="hit-detail">{{ hit.detail }}</span>
              <button
                v-if="chatCommand[group.name] && chatCommand[group.name](hit.row)"
                type="button"
                class="copy-btn"
                :aria-label="`Copy ${chatCommand[group.name](hit.row)}`"
                @click="copyText(chatCommand[group.name](hit.row))"
              >
                Copy
              </button>
            </li>
          </ul>
        </section>
      </template>
      <p v-if="missing.length" class="muted">Some lists could not be loaded: {{ missing.map((name) => CATALOG_PAGES[name].title).join(", ") }}.</p>
    </main>
  </div>
</template>
