<script setup>
import { computed, ref, watch } from "vue";
import PageIntro from "../components/PageIntro.vue";
import DataTable from "../components/DataTable.vue";
import FilterTools from "../components/FilterTools.vue";
import ChangeBadge from "../components/ChangeBadge.vue";
import { useBalance } from "../composables/useBalance";
import { useStars } from "../composables/useStars";
import { useFilters } from "../composables/useFilters";
import { useChanges } from "../composables/useChanges";
import { loadJson, fmt, uniqueSorted, useLoader } from "../lib/data";
import { chatCommand, rowsOf } from "../lib/catalogs";
import { useSort } from "../composables/useSort";
import { useQueryState } from "../composables/useQueryState";
import { useStickyOffsets } from "../composables/useStickyOffsets";

const { sync } = useStickyOffsets();
const items = ref([]);
const q = useQueryState("q", "");
const cat = useQueryState("category", "");
const mod = useQueryState("mod", "");
const cmd = useQueryState("command", "");
const enabledOnly = useQueryState("purchasable", true);
const starredOnly = useQueryState("starred", false);
const { sortKey, sortDir, toggleSort, sorted } = useSort("name");
const { affordable, limit } = useBalance();
const stars = useStars("items");
const { badge } = useChanges();
const filters = useFilters([[q, ""], [cat, ""], [mod, ""], [cmd, ""], [enabledOnly, true], [starredOnly, false]]);

const columns = [
  { key: "name", label: "Item" },
  { key: "category", label: "Category", thClass: "hide-sm" },
  { key: "price", label: "Price", align: "right" },
  { key: "qty", label: "Max Qty", thClass: "hide-sm", align: "right" },
  { key: "commands", label: "Commands" },
  { key: "mod", label: "Mod", thClass: "hide-sm" },
];

const { state, error, retry } = useLoader(async () => {
  items.value = (await loadJson("items")).map(rowsOf.items);
});

watch([q, cat, mod, cmd, enabledOnly, starredOnly, limit], () => sync());

const cats = computed(() => uniqueSorted(items.value, (r) => r.category));
const mods = computed(() => uniqueSorted(items.value, (r) => r.mod));
const purchasable = computed(() => items.value.filter((r) => r.enabled).length);

const stats = computed(() => [
  { value: fmt(items.value.length), label: "items" },
  { value: fmt(purchasable.value), label: "purchasable" },
  { value: String(cats.value.length), label: "categories" },
  { value: String(mods.value.length), label: "mods" },
]);

function cmdLabel(r) {
  return [r.usable && "USE", r.equippable && "EQUIP", r.wearable && "WEAR"].filter(Boolean).join(" ") || "";
}

function matchesCmd(r) {
  if (!cmd.value) return true;
  if (cmd.value === "use") return r.usable;
  if (cmd.value === "equip") return r.equippable;
  if (cmd.value === "wear") return r.wearable;
  if (cmd.value === "any") return r.usable || r.equippable || r.wearable;
  if (cmd.value === "none") return !(r.usable || r.equippable || r.wearable);
  return true;
}

const filtered = computed(() => {
  const term = q.value.trim().toLowerCase();
  let list = items.value.filter((r) =>
    (!enabledOnly.value || r.enabled) &&
    (!cat.value || r.category === cat.value) &&
    (!mod.value || r.mod === mod.value) &&
    matchesCmd(r) &&
    affordable(r.price) &&
    (!starredOnly.value || stars.has(r.defName)) &&
    (!term || r.name.toLowerCase().includes(term) || r.defName.toLowerCase().includes(term)),
  );
  list = sorted(list, (r) => (sortKey.value === "commands" ? cmdLabel(r) || "~" : r[sortKey.value]));
  return list.map((r) => ({ ...r, _disabled: !r.enabled, _key: r.defName }));
});
</script>

<template>
  <div class="page-shell">
    <PageIntro kicker="Channel 01" title="Store" lede="Everything you can buy with chat coins. Search, filter, and sort the catalog, then tap a row to copy its command." :stats="stats">
      Buy with <code>!buy &lt;item&gt;</code> (e.g. <code>!buy thrumbo</code>).
      <span class="flag">USE</span> → <code>!use</code>,
      <span class="flag">EQUIP</span> → <code>!equip</code>,
      <span class="flag">WEAR</span> → <code>!wear</code>.
      Balance <code>!bal</code> · price <code>!pricecheck &lt;item&gt;</code> ·
      <code>!lookup item &lt;name&gt;</code>.
    </PageIntro>

    <div class="controls">
      <input v-model="q" type="search" placeholder="Search items… (name or defName)" aria-label="Search items">
      <select v-model="cat" aria-label="Category">
        <option value="">All categories</option>
        <option v-for="c in cats" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-model="mod" aria-label="Mod">
        <option value="">All mods</option>
        <option v-for="m in mods" :key="m" :value="m">{{ m }}</option>
      </select>
      <select v-model="cmd" aria-label="Command type">
        <option value="">All commands</option>
        <option value="use">USE</option>
        <option value="equip">EQUIP</option>
        <option value="wear">WEAR</option>
        <option value="any">Any command</option>
        <option value="none">No commands</option>
      </select>
      <label class="toggle"><input v-model="enabledOnly" type="checkbox"> Purchasable only</label>
      <FilterTools v-model:starred-only="starredOnly" :active="filters.active.value" :star-count="stars.count.value" show-balance @clear="filters.clear" />
      <span class="count">{{ fmt(filtered.length) }} item{{ filtered.length === 1 ? "" : "s" }}</span>
    </div>

    <DataTable
      label="Store items"
      :columns="columns"
      :rows="filtered"
      empty="No items match your search."
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :state="state"
      :error="error"
      :copy-for="chatCommand.items"
      :stars="stars"
      @sort="toggleSort"
      @retry="retry"
    >
      <template #row="{ row }">
        <td><b>{{ row.name }}</b> <ChangeBadge :info="badge('items', row.name)" /></td>
        <td class="cat hide-sm">{{ row.category }}</td>
        <td class="price">{{ fmt(row.price) }}</td>
        <td class="qty hide-sm">{{ fmt(row.qty) }}</td>
        <td class="flags">
          <span v-if="row.usable" class="flag">USE</span>
          <span v-if="row.equippable" class="flag">EQUIP</span>
          <span v-if="row.wearable" class="flag">WEAR</span>
          <span v-if="!row.enabled" class="off">DISABLED</span>
        </td>
        <td class="mod hide-sm">{{ row.mod }}</td>
      </template>
    </DataTable>
  </div>
</template>
