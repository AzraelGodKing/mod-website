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
import { loadJson, loadMeta, fmt, uniqueSorted, useLoader } from "../lib/data";
import { DEFAULT_GENE_RATES, geneCost, rowsOf, detailsOf } from "../lib/catalogs";
import { useSort } from "../composables/useSort";
import { useQueryState } from "../composables/useQueryState";
import { useStickyOffsets } from "../composables/useStickyOffsets";

const { sync } = useStickyOffsets();
const rows = ref([]);
const rates = ref(DEFAULT_GENE_RATES);
const ratesLive = ref(false);
const q = useQueryState("q", "");
const category = useQueryState("category", "");
const mod = useQueryState("source", "");
const architeOnly = useQueryState("archite", false);
const metabolism = useQueryState("metabolism", "");
const starredOnly = useQueryState("starred", false);
const { affordable, limit } = useBalance();
const stars = useStars("genes");
const { badge } = useChanges();
const filters = useFilters([[q, ""], [category, ""], [mod, ""], [architeOnly, false], [metabolism, ""], [starredOnly, false]]);
const { sortKey, sortDir, toggleSort, sorted } = useSort("label");

const columns = [
  { key: "label", label: "Gene" },
  { key: "category", label: "Category" },
  { key: "biostatCpx", label: "Cpx", align: "right" },
  { key: "biostatMet", label: "Met", align: "right" },
  { key: "biostatArc", label: "Arc", align: "right" },
  { key: "estCost", label: "Est. $", align: "right" },
  { key: "mod", label: "Source", thClass: "hide-sm" },
];

const { state, error, retry } = useLoader(async () => {
  const [data, meta] = await Promise.all([loadJson("genes"), loadMeta()]);
  if (meta?.geneRates) {
    rates.value = meta.geneRates;
    ratesLive.value = true;
  }
  rows.value = data.map((r) => {
    const gene = rowsOf.genes(r);
    return { ...gene, estCost: geneCost(gene, rates.value) };
  });
});

watch([q, category, mod, architeOnly, metabolism, starredOnly, limit], () => sync());

const mods = computed(() => uniqueSorted(rows.value, (r) => r.mod));
const categories = computed(() => uniqueSorted(rows.value, (r) => r.category));
const architeCount = computed(() => rows.value.filter((r) => r.biostatArc > 0).length);

const stats = computed(() => [
  { value: fmt(rows.value.length), label: "genes" },
  { value: fmt(architeCount.value), label: "archite" },
  { value: String(categories.value.length), label: "categories" },
  { value: String(mods.value.length), label: "sources" },
]);

const filtered = computed(() => {
  const term = q.value.trim().toLowerCase();
  let list = rows.value.filter(
    (r) =>
      (!category.value || r.category === category.value) &&
      (!mod.value || r.mod === mod.value) &&
      (!architeOnly.value || r.biostatArc > 0) &&
      (metabolism.value !== "gives" || r.biostatMet > 0) &&
      (metabolism.value !== "costs" || r.biostatMet < 0) &&
      (metabolism.value !== "none" || r.biostatMet === 0) &&
      affordable(r.estCost) &&
      (!starredOnly.value || stars.has(r.defName)) &&
      (!term ||
        r.label.toLowerCase().includes(term) ||
        r.defName.toLowerCase().includes(term) ||
        r.description.toLowerCase().includes(term) ||
        r.category.toLowerCase().includes(term)),
  );
  list = sorted(list, (r) => r[sortKey.value]);
  return list.map((r) => ({ ...r, _key: r.defName }));
});
</script>

<template>
  <div class="page-shell">
    <PageIntro
      kicker="Channel 07"
      title="Genes"
      lede="Read-only catalog of Biotech (and mod) genes from RimWorld defs. Chat uses !geneedit — not buy-by-name."
      :stats="stats"
    >
      Geneedit rates ({{ ratesLive ? "from the uploaded settings" : "defaults" }}):
      <code>{{ fmt(rates.complexity) }}</code> / complexity,
      <code>{{ fmt(rates.metabolism) }}</code> / metabolism,
      <code>{{ fmt(rates.archite) }}</code> / archite.
      Est. $ is abs(cpx)×{{ rates.complexity }} + abs(met)×{{ rates.metabolism }} + abs(arc)×{{ rates.archite }}.
    </PageIntro>

    <div class="controls">
      <input v-model="q" type="search" placeholder="Search label, defName, or description…" aria-label="Search genes">
      <select v-model="category" aria-label="Category">
        <option value="">All categories</option>
        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-model="mod" aria-label="Source">
        <option value="">All sources</option>
        <option v-for="m in mods" :key="m" :value="m">{{ m }}</option>
      </select>
      <select v-model="metabolism" aria-label="Metabolism">
        <option value="">Any metabolism</option>
        <option value="gives">Gives metabolism (+)</option>
        <option value="costs">Costs metabolism (−)</option>
        <option value="none">No metabolism change</option>
      </select>
      <label class="toggle"><input v-model="architeOnly" type="checkbox"> Archite only</label>
      <FilterTools v-model:starred-only="starredOnly" :active="filters.active.value" :star-count="stars.count.value" show-balance @clear="filters.clear" />
      <span class="count">{{ fmt(filtered.length) }} gene{{ filtered.length === 1 ? "" : "s" }}</span>
    </div>

    <DataTable
      label="Genes"
      csv-name="genes"
      :details-for="detailsOf['genes']"
      :stars="stars"
      :state="state"
      :error="error"
      @retry="retry"
      :columns="columns"
      :rows="filtered"
      empty="No genes match your search."
      :sort-key="sortKey"
      :sort-dir="sortDir"
      @sort="toggleSort"
    >
      <template #row="{ row }">
        <td class="title-cell">
          <b>{{ row.label }}</b> <ChangeBadge :info="badge('genes', row.label)" />
          <span class="def">{{ row.defName }}</span>
          <span v-if="row.description" class="desc">{{ row.description }}</span>
        </td>
        <td>
          <span class="slot-pill" :class="{ adult: row.biostatArc > 0 }">{{ row.category }}</span>
        </td>
        <td class="num">{{ row.biostatCpx }}</td>
        <td class="num">{{ row.biostatMet }}</td>
        <td class="num">{{ row.biostatArc }}</td>
        <td class="num">{{ fmt(row.estCost) }}</td>
        <td class="mod hide-sm">{{ row.mod }}</td>
      </template>
    </DataTable>
  </div>
</template>
