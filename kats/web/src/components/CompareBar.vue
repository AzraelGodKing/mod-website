<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { useCompare } from "../composables/useCompare";
import { useCart } from "../composables/useCart";
import { CATALOG_PAGES } from "../lib/catalogs";

const compare = useCompare();
const cart = useCart();
const dialog = ref(null);

watch(
  () => compare.open.value,
  async (value) => {
    await nextTick();
    if (value && !dialog.value?.open) dialog.value?.showModal?.();
    if (!value && dialog.value?.open) dialog.value.close();
  },
);

const columns = computed(() => compare.picked.value.map((entry) => entry.details));
// Every field any of the picked rows has, in the order they first appear.
const rows = computed(() => {
  const labels = [];
  for (const details of columns.value) for (const [label] of details.fields) if (!labels.includes(label)) labels.push(label);
  return labels.map((label) => {
    const values = columns.value.map((details) => details.fields.find(([name]) => name === label)?.[1] ?? "—");
    return { label, values, differs: new Set(values).size > 1 };
  });
});
const listTitle = computed(() => CATALOG_PAGES[columns.value[0]?.catalog]?.title ?? "");

function onClick(event) {
  if (event.target === dialog.value) compare.open.value = false;
}
</script>

<template>
  <div v-if="compare.count.value" class="compare-bar" role="region" aria-label="Compare">
    <span class="compare-names">
      <b>Compare</b>
      <span v-for="entry in compare.picked.value" :key="entry.id" class="compare-pill">
        {{ entry.details.title }}
        <button type="button" :aria-label="`Remove ${entry.details.title} from compare`" @click="compare.remove(entry.id)">✕</button>
      </span>
    </span>
    <span class="compare-go">
      <span v-if="compare.count.value < 2" class="muted">Pick one more from the same list (ⓘ on a row).</span>
      <button v-else type="button" class="action-btn primary" @click="compare.open.value = true">Compare {{ compare.count.value }}</button>
      <button type="button" class="link-btn" @click="compare.clear()">Clear</button>
    </span>
  </div>
  <dialog ref="dialog" class="detail-dialog compare-dialog" aria-labelledby="compare-title" @close="compare.open.value = false" @click="onClick">
    <div v-if="compare.open.value" class="detail-body">
      <header>
        <div>
          <h2 id="compare-title">Side by side</h2>
          <p class="muted">{{ listTitle }} · rows that differ are marked</p>
        </div>
        <button type="button" class="detail-close" aria-label="Close" @click="compare.open.value = false">✕</button>
      </header>
      <div class="compare-scroll">
        <table class="compare-table">
          <tbody>
            <tr class="compare-head">
              <td></td>
              <th v-for="details in columns" :key="details.key || details.title" scope="col">
                {{ details.title }}
                <small v-if="details.subtitle">{{ details.subtitle }}</small>
              </th>
            </tr>
            <tr v-for="row in rows" :key="row.label" :class="{ differs: row.differs }">
              <th scope="row">{{ row.label }}</th>
              <td v-for="(value, i) in row.values" :key="i">{{ value }}</td>
            </tr>
            <tr v-if="columns.some((details) => details.trade?.command)">
              <th scope="row">Cart</th>
              <td v-for="details in columns" :key="details.key || details.title">
                <button v-if="details.trade?.command" type="button" class="copy-btn" @click="cart.add(details.catalog, details.trade)">
                  {{ cart.has(details.catalog, details.trade.label) ? "In cart" : "Add" }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </dialog>
</template>
