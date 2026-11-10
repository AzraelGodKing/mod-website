<script setup>
import { computed, onMounted, ref } from "vue";
import { loadJson, longDate } from "../lib/data";
import { priceTimeline } from "../lib/catalogs";

const props = defineProps({ catalog: String, label: String });
const history = ref(null);
onMounted(async () => {
  history.value = await loadJson("history").catch(() => []);
});

const points = computed(() => priceTimeline(history.value, props.catalog, props.label));
const W = 280;
const H = 56;
// A stepped line: a price holds until the upload that changes it.
const path = computed(() => {
  const list = points.value;
  if (list.length < 2) return "";
  const prices = list.map((point) => point.price);
  const min = Math.min(...prices);
  const span = Math.max(...prices) - min || 1;
  const x = (i) => 4 + (i / list.length) * (W - 8);
  const y = (price) => H - 6 - ((price - min) / span) * (H - 12);
  let d = `M${x(0)},${y(list[0].price)}`;
  for (let i = 1; i < list.length; i += 1) d += `H${x(i)}V${y(list[i].price)}`;
  return `${d}H${W - 4}`;
});
const summary = computed(() => {
  const list = points.value;
  if (list.length < 2) return "";
  const first = list[0].price;
  const last = list.at(-1).price;
  return `${list.length - 1} price change${list.length === 2 ? "" : "s"}: ${first.toLocaleString()} to ${last.toLocaleString()} coins`;
});
</script>

<template>
  <div v-if="history && points.length > 1" class="price-history">
    <h3>Price history</h3>
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="summary" preserveAspectRatio="none">
      <path :d="path" />
    </svg>
    <ol>
      <li v-for="(point, i) in points.slice(1).reverse()" :key="i">
        <span>{{ longDate(point.at) }}</span>
        <b :class="point.price > points[points.length - 2 - i].price ? 'up' : 'down'">
          {{ points[points.length - 2 - i].price.toLocaleString() }} → {{ point.price.toLocaleString() }}
        </b>
      </li>
    </ol>
  </div>
  <p v-else-if="history" class="muted price-history-none">No price changes recorded for this yet.</p>
</template>
