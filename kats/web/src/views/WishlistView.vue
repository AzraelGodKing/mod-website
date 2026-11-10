<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageIntro from "../components/PageIntro.vue";
import { useLocal } from "../composables/useLocal.js";
import { useCart } from "../composables/useCart";
import { copyText } from "../composables/useCopy";
import { CATALOG_PAGES, SEARCH_FIELDS, STAR_KEY, decodeWishlist, encodeWishlist, rowsOf, tradeOf } from "../lib/catalogs";
import { loadJson, useLoader } from "../lib/data";

const route = useRoute();
const router = useRouter();
const cart = useCart();
const names = Object.keys(STAR_KEY);
const stars = Object.fromEntries(names.map((name) => [name, useLocal(`katsrics-stars-${name}`, [])]));
const catalogs = ref({});

// A link someone shared shows their list; without one, the page shows your own stars.
const shared = computed(() => (route.query.w ? decodeWishlist(route.query.w) : null));
const mine = computed(() => Object.fromEntries(names.map((name) => [name, stars[name].value]).filter(([, keys]) => keys.length)));
const lists = computed(() => shared.value ?? mine.value);

const { state, error, retry } = useLoader(async () => {
  const wanted = Object.keys({ ...mine.value, ...(shared.value ?? {}) });
  const loaded = await Promise.all(wanted.map(async (name) => [name, (await loadJson(name)).map(rowsOf[name])]));
  catalogs.value = Object.fromEntries(loaded);
});

const groups = computed(() =>
  Object.entries(lists.value)
    .map(([name, keys]) => {
      const byKey = new Map((catalogs.value[name] ?? []).map((row) => [STAR_KEY[name](row), row]));
      const rows = keys.map((key) => ({ key, row: byKey.get(key) })).filter((entry) => entry.row);
      return { name, title: CATALOG_PAGES[name]?.title ?? name, rows, missing: keys.length - rows.length };
    })
    .filter((group) => group.rows.length || group.missing),
);
const count = computed(() => groups.value.reduce((sum, group) => sum + group.rows.length, 0));
const total = computed(() =>
  groups.value.reduce((sum, group) => sum + group.rows.reduce((part, { row }) => part + (tradeOf[group.name]?.(row)?.price ?? 0), 0), 0),
);
const stats = computed(() => [
  { value: String(count.value), label: count.value === 1 ? "star" : "stars" },
  { value: total.value.toLocaleString(), label: "coins for all" },
]);

const label = (name, row) => String(SEARCH_FIELDS[name].label(row));
const detail = (name, row) => SEARCH_FIELDS[name].detail(row);
const trade = (name, row) => {
  const found = tradeOf[name]?.(row);
  return found?.command ? found : null;
};

function shareLink() {
  // The keys are already escaped once; escaping the whole value again keeps them intact through the router.
  copyText(`${location.origin}/wishlist?w=${encodeURIComponent(encodeWishlist(mine.value))}`);
}
function unstar(name, key) {
  stars[name].value = stars[name].value.filter((entry) => entry !== key);
}
const hasAll = computed(() => shared.value && Object.entries(shared.value).every(([name, keys]) => keys.every((key) => stars[name].value.includes(key))));
function saveShared() {
  for (const [name, keys] of Object.entries(shared.value)) stars[name].value = [...new Set([...stars[name].value, ...keys])];
}
function addAllToCart() {
  for (const group of groups.value) for (const { row } of group.rows) cart.add(group.name, trade(group.name, row));
}
</script>

<template>
  <div class="page-shell">
    <PageIntro
      kicker="Channel 10"
      :title="shared ? 'Shared wishlist' : 'Wishlist'"
      :lede="shared ? 'Someone sent you their starred picks. Save them to your own stars, or put them in your cart.' : 'Everything you starred, in one place. Copy a link to share the list.'"
      :stats="state === 'ready' ? stats : []"
    />
    <main class="search-results">
      <div v-if="state === 'loading'" class="empty" role="status">Loading catalog…</div>
      <div v-else-if="state === 'error'" class="empty error" role="alert">
        <p>{{ error }}</p>
        <button type="button" class="retry-btn" @click="retry">Try again</button>
      </div>
      <div v-else-if="!groups.length" class="empty">
        <template v-if="shared">That link has nothing in it. <router-link to="/wishlist">See your own wishlist</router-link>.</template>
        <template v-else>Nothing starred yet. Tap the ☆ on any row to keep it here.</template>
      </div>
      <template v-else>
        <div class="wish-actions">
          <template v-if="shared">
            <button type="button" class="action-btn primary" :disabled="hasAll" @click="saveShared">{{ hasAll ? "Saved to my stars" : "Save to my stars" }}</button>
            <button type="button" class="link-btn" @click="router.push('/wishlist')">My own wishlist</button>
          </template>
          <button v-else type="button" class="action-btn primary" @click="shareLink">Copy share link</button>
          <button v-if="total" type="button" class="action-btn" @click="addAllToCart">Add all to cart</button>
        </div>
        <section v-for="group in groups" :key="group.name" class="change-card">
          <header>
            <h2>{{ group.title }}</h2>
            <span class="change-count">{{ group.rows.length }}</span>
          </header>
          <ul class="hit-list">
            <li v-for="{ key, row } in group.rows" :key="key">
              <router-link :to="CATALOG_PAGES[group.name].link(label(group.name, row))" class="hit-label">{{ label(group.name, row) }}</router-link>
              <span class="hit-detail">{{ detail(group.name, row) }}</span>
              <button v-if="trade(group.name, row)" type="button" class="copy-btn" @click="cart.add(group.name, trade(group.name, row))">
                {{ cart.has(group.name, trade(group.name, row).label) ? "In cart" : "Add to cart" }}
              </button>
              <button v-if="!shared" type="button" class="star-btn on" :aria-label="`Unstar ${label(group.name, row)}`" @click="unstar(group.name, key)">★</button>
            </li>
          </ul>
          <p v-if="group.missing" class="muted">{{ group.missing }} starred {{ group.missing === 1 ? "entry is" : "entries are" }} no longer in the catalog.</p>
        </section>
      </template>
    </main>
  </div>
</template>
