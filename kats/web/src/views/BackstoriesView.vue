<script setup>
import { computed, ref, watch } from "vue";
import PageIntro from "../components/PageIntro.vue";
import DataTable from "../components/DataTable.vue";
import FilterTools from "../components/FilterTools.vue";
import ChangeBadge from "../components/ChangeBadge.vue";
import { useStars } from "../composables/useStars";
import { useFilters } from "../composables/useFilters";
import { useChanges } from "../composables/useChanges";
import { loadJson, fmt, uniqueSorted, useLoader } from "../lib/data";
import { rowsOf, detailsOf } from "../lib/catalogs";
import { useSort } from "../composables/useSort";
import { useQueryState } from "../composables/useQueryState";
import { useStickyOffsets } from "../composables/useStickyOffsets";

const { sync } = useStickyOffsets();
const rows = ref([]);
const q = useQueryState("q", "");
const slot = useQueryState("slot", "");
const mod = useQueryState("source", "");
const shuffleOnly = useQueryState("shuffleable", true);
const skill = useQueryState("skill", "");
const noDisables = useQueryState("noDisables", false);
const starredOnly = useQueryState("starred", false);
const stars = useStars("backstories");
const { badge } = useChanges();
const filters = useFilters([[q, ""], [slot, ""], [mod, ""], [shuffleOnly, true], [skill, ""], [noDisables, false], [starredOnly, false]]);

/** "Shooting +3, Melee -2" → [{ name: "Shooting", value: 3 }, …] */
function skillList(text) {
  return String(text)
    .split(/[;,]/)
    .map((part) => part.trim().match(/^(.+?)\s*([+-]\d+)$/))
    .filter(Boolean)
    .map((m) => ({ name: m[1], value: Number(m[2]) }));
}
const { sortKey, sortDir, toggleSort, sorted } = useSort("title");

const columns = [
  { key: "title", label: "Backstory" },
  { key: "slot", label: "Slot" },
  { key: "skills", label: "Skills", thClass: "hide-sm" },
  { key: "workDisables", label: "Work disables", thClass: "hide-sm" },
  { key: "mod", label: "Source", thClass: "hide-sm" },
];

const { state, error, retry } = useLoader(async () => {
  rows.value = (await loadJson("backstories")).map(rowsOf.backstories);
});

watch([q, slot, mod, shuffleOnly, skill, noDisables, starredOnly], () => sync());

const mods = computed(() => uniqueSorted(rows.value, (r) => r.mod));
const skills = computed(() => [...new Set(rows.value.flatMap((r) => skillList(r.skills).map((s) => s.name)))].sort());
const childCount = computed(() => rows.value.filter((r) => r.slot === "Childhood").length);
const adultCount = computed(() => rows.value.filter((r) => r.slot === "Adulthood").length);

const stats = computed(() => [
  { value: fmt(rows.value.length), label: "backstories" },
  { value: fmt(childCount.value), label: "childhood" },
  { value: fmt(adultCount.value), label: "adulthood" },
  { value: String(mods.value.length), label: "sources" },
]);

const filtered = computed(() => {
  const term = q.value.trim().toLowerCase();
  let list = rows.value.filter((r) =>
    (!shuffleOnly.value || r.shuffleable) &&
    (!slot.value || r.slot === slot.value) &&
    (!mod.value || r.mod === mod.value) &&
    (!skill.value || skillList(r.skills).some((s) => s.name === skill.value && s.value > 0)) &&
    (!noDisables.value || !r.workDisables) &&
    (!starredOnly.value || stars.has(r.defName)) &&
    (!term ||
      r.title.toLowerCase().includes(term) ||
      r.defName.toLowerCase().includes(term) ||
      r.titleShort.toLowerCase().includes(term) ||
      r.description.toLowerCase().includes(term) ||
      r.skills.toLowerCase().includes(term)),
  );
  list = sorted(list, (r) => r[sortKey.value]);
  return list.map((r) => ({ ...r, _key: r.defName }));
});
</script>

<template>
  <div class="page-shell">
    <PageIntro
      kicker="Channel 03"
      title="Backstories"
      lede="Read-only catalog of childhood and adulthood backstories from RimWorld (Core + DLCs). Not purchased individually."
      :stats="stats"
    >
      Random reroll only:
      <code>!shufflechildhood</code> and <code>!shuffleadulthood</code>
      (default 1000 coins each). This page is a reference — there is no buy-by-name command.
    </PageIntro>

    <div class="controls">
      <input v-model="q" type="search" placeholder="Search title, defName, or description…" aria-label="Search backstories">
      <select v-model="slot" aria-label="Slot">
        <option value="">All slots</option>
        <option value="Childhood">Childhood</option>
        <option value="Adulthood">Adulthood</option>
      </select>
      <select v-model="mod" aria-label="Source">
        <option value="">All sources</option>
        <option v-for="m in mods" :key="m" :value="m">{{ m }}</option>
      </select>
      <select v-model="skill" aria-label="Boosts skill">
        <option value="">Any skill</option>
        <option v-for="s in skills" :key="s" :value="s">Boosts {{ s }}</option>
      </select>
      <label class="toggle"><input v-model="shuffleOnly" type="checkbox"> Shuffleable only</label>
      <label class="toggle"><input v-model="noDisables" type="checkbox"> No work disabled</label>
      <FilterTools v-model:starred-only="starredOnly" :active="filters.active.value" :star-count="stars.count.value" @clear="filters.clear" />
      <span class="count">{{ fmt(filtered.length) }} backstor{{ filtered.length === 1 ? "y" : "ies" }}</span>
    </div>

    <DataTable
      label="Backstories"
      csv-name="backstories"
      :details-for="detailsOf['backstories']"
      :stars="stars"
      :state="state"
      :error="error"
      @retry="retry"
      :columns="columns"
      :rows="filtered"
      empty="No backstories match your search."
      :sort-key="sortKey"
      :sort-dir="sortDir"
      @sort="toggleSort"
    >
      <template #row="{ row }">
        <td class="title-cell">
          <b>{{ row.title }}</b> <ChangeBadge :info="badge('backstories', row.title)" />
          <span class="def">{{ row.defName }}</span>
          <span v-if="row.description" class="desc">{{ row.description }}</span>
        </td>
        <td>
          <span class="slot-pill" :class="{ adult: row.slot === 'Adulthood' }">{{ row.slot }}</span>
        </td>
        <td class="cat hide-sm">{{ row.skills || "—" }}</td>
        <td class="mod hide-sm">{{ row.workDisables || "—" }}</td>
        <td class="mod hide-sm">{{ row.mod }}</td>
      </template>
    </DataTable>
  </div>
</template>
