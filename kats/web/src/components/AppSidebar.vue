<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { currentTheme, toggleTheme } from "../composables/useTheme";
import { loadMeta, longDate, relativeTime } from "../lib/data";
import { links } from "../lib/nav";

const route = useRoute();
const router = useRouter();
const theme = ref(currentTheme());
const term = ref("");
const meta = ref(null);

onMounted(async () => {
  meta.value = await loadMeta();
});

function onToggle() {
  toggleTheme();
  theme.value = currentTheme();
}

function onSearch() {
  const q = term.value.trim();
  if (!q) return;
  router.push({ path: "/search", query: { q } });
}


const isDark = computed(() => theme.value === "dark");
const updatedAgo = computed(() => relativeTime(meta.value?.updatedAt));
const updatedOn = computed(() => longDate(meta.value?.updatedAt));
</script>

<template>
  <aside class="rail">
    <div class="rail-top">
      <router-link class="brand" to="/">
        <span class="brand-mark">KAT</span>
        <span class="brand-word">RICS</span>
        <span class="brand-sub">Chat coin catalog</span>
      </router-link>
      <button
        type="button"
        class="theme-toggle theme-toggle-sm"
        :aria-label="isDark ? 'Day side: switch to light mode' : 'Night side: switch to dark mode'"
        @click="onToggle"
      >
        {{ isDark ? "Day side" : "Night side" }}
      </button>
    </div>

    <form class="rail-search" role="search" @submit.prevent="onSearch">
      <input v-model="term" type="search" placeholder="Search everything…" aria-label="Search every catalog">
    </form>

    <p class="rail-kicker">Broadcast index</p>
    <nav class="nav" aria-label="Primary">
      <router-link
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        :class="{ active: route.name === link.match }"
        :aria-current="route.name === link.match ? 'page' : undefined"
      >
        <span class="nav-code" aria-hidden="true">{{ link.code }}</span>
        <span class="nav-label">{{ link.label }}</span>
      </router-link>
    </nav>

    <div class="rail-end">
      <router-link v-if="updatedAgo" class="live-pill" to="/changes" :title="`Catalog updated ${updatedOn}`">
        <span class="live-dot" aria-hidden="true"></span>
        Updated {{ updatedAgo }}
      </router-link>
      <span v-else class="live-pill" aria-hidden="true">&nbsp;</span>
      <button
        type="button"
        class="theme-toggle theme-toggle-lg"
        :aria-label="isDark ? 'Day side: switch to light mode' : 'Night side: switch to dark mode'"
        @click="onToggle"
      >
        {{ isDark ? "Day side" : "Night side" }}
      </button>
    </div>
  </aside>
</template>
