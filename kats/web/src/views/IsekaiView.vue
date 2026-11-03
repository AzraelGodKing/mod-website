<script setup>
import { computed, ref, watch } from "vue";
import PageIntro from "../components/PageIntro.vue";
import DataTable from "../components/DataTable.vue";
import FilterTools from "../components/FilterTools.vue";
import { useStars } from "../composables/useStars";
import { useFilters } from "../composables/useFilters";
import TabBar from "../components/TabBar.vue";
import { loadJson, fmt, uniqueSorted, useLoader } from "../lib/data";
import { rowsOf } from "../lib/catalogs";
import { useSort } from "../composables/useSort";
import { useQueryState } from "../composables/useQueryState";
import { useStickyOffsets } from "../composables/useStickyOffsets";

const { sync } = useStickyOffsets();

const statsRows = ref([]);
const classes = ref([]);
const keystones = ref([]);

const tab = useQueryState("tab", "stats");
const tabs = [
  { id: "stats", label: "Stats" },
  { id: "classes", label: "Classes" },
  { id: "keystones", label: "Constellations" },
];

const sq = useQueryState("q", "");
const cq = useQueryState("cq", "");
const kq = useQueryState("kq", "");
const kclass = useQueryState("class", "");
const kStarred = useQueryState("starred", false);
const kStars = useStars("isekai-keystones");
const kFilters = useFilters([[kq, ""], [kclass, ""], [kStarred, false]]);

function showKeystones(classLabel) {
  kq.value = "";
  kclass.value = classLabel;
  tab.value = "keystones";
}

const sSort = useSort("abbr");
const cSort = useSort("label");
const kSort = useSort("label");

const statCols = [
  { key: "abbr", label: "Abbr" },
  { key: "name", label: "Stat" },
  { key: "description", label: "What it does" },
];

const classCols = [
  { key: "label", label: "Class" },
  { key: "gimmick", label: "Gimmick" },
  { key: "nodes", label: "Nodes", thClass: "hide-sm", align: "right" },
  { key: "keystones", label: "Keystones", align: "right" },
];

const keyCols = [
  { key: "classLabel", label: "Class", thClass: "hide-sm" },
  { key: "label", label: "Keystone" },
  { key: "description", label: "Description" },
  { key: "cost", label: "Cost", align: "right" },
  { key: "bonuses", label: "Bonuses", thClass: "hide-sm" },
];

const { state, error, retry } = useLoader(async () => {
  const [s, c, k] = await Promise.all([
    loadJson("isekai-stats"),
    loadJson("isekai-classes"),
    loadJson("isekai-keystones"),
  ]);
  statsRows.value = s.map(rowsOf["isekai-stats"]);
  classes.value = c.map(rowsOf["isekai-classes"]);
  keystones.value = k.map(rowsOf["isekai-keystones"]);
});

watch(tab, () => sync());

const classLabels = computed(() => uniqueSorted(keystones.value, (r) => r.classLabel));

const pageStats = computed(() => [
  { value: fmt(statsRows.value.length), label: "stats" },
  { value: fmt(classes.value.length), label: "classes" },
  { value: fmt(keystones.value.length), label: "keystones" },
  { value: fmt(classLabels.value.length), label: "trees" },
]);

const filteredStats = computed(() => {
  const term = sq.value.trim().toLowerCase();
  let list = statsRows.value.filter((r) =>
    !term ||
    r.abbr.toLowerCase().includes(term) ||
    r.name.toLowerCase().includes(term) ||
    r.description.toLowerCase().includes(term),
  );
  list = sSort.sorted(list, (r) => r[sSort.sortKey.value]);
  return list.map((r) => ({ ...r, _key: r.abbr }));
});

const filteredClasses = computed(() => {
  const term = cq.value.trim().toLowerCase();
  let list = classes.value.filter((r) =>
    !term ||
    r.label.toLowerCase().includes(term) ||
    r.description.toLowerCase().includes(term) ||
    r.gimmick.toLowerCase().includes(term) ||
    r.gimmickDescription.toLowerCase().includes(term),
  );
  list = cSort.sorted(list, (r) => r[cSort.sortKey.value]);
  return list.map((r) => ({ ...r, _key: r.classKey }));
});

const filteredKeys = computed(() => {
  const term = kq.value.trim().toLowerCase();
  let list = keystones.value.filter((r) =>
    (!kclass.value || r.classLabel === kclass.value) &&
    (!kStarred.value || kStars.has(r.nodeId)) &&
    (!term ||
      r.label.toLowerCase().includes(term) ||
      r.classLabel.toLowerCase().includes(term) ||
      r.description.toLowerCase().includes(term) ||
      r.bonuses.toLowerCase().includes(term) ||
      r.nodeId.toLowerCase().includes(term)),
  );
  list = kSort.sorted(list, (r) => r[kSort.sortKey.value]);
  return list.map((r) => ({ ...r, _key: r.nodeId }));
});
</script>

<template>
  <div class="page-shell">
    <PageIntro
      kicker="Channel 06"
      title="Isekai RPG"
      lede="Stats, classes, and constellation keystones from ISEKAI RPG LEVELING — useful with RICS Addon !isekai / !constellation."
      :stats="pageStats"
    >
      Chat:
      <code>!isekai</code>,
      <code>!isekai level &lt;stat&gt; &lt;amount&gt;</code>,
      <code>!constellation unlock|path|learn</code>.
      Mod:
      <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3657580708" target="_blank" rel="noopener">ISEKAI RPG LEVELING</a>.
    </PageIntro>

    <TabBar v-model="tab" :tabs="tabs" label="Isekai sections" />

    <div id="panel-stats" role="tabpanel" aria-labelledby="tab-stats" :class="['panel', { active: tab === 'stats' }]">
      <div class="controls">
        <input v-model="sq" type="search" placeholder="Search stats…" aria-label="Search stats">
        <span class="count">{{ fmt(filteredStats.length) }} stat{{ filteredStats.length === 1 ? "" : "s" }}</span>
      </div>
      <DataTable
        :columns="statCols"
        :rows="filteredStats"
        empty="No stats match."
        :sort-key="sSort.sortKey.value"
        :sort-dir="sSort.sortDir.value"
        :state="state"
        :error="error"
        @retry="retry"
        @sort="sSort.toggleSort"
      >
        <template #row="{ row }">
          <td><b>{{ row.abbr }}</b></td>
          <td>{{ row.name }}</td>
          <td>{{ row.description }}</td>
        </template>
      </DataTable>
    </div>

    <div id="panel-classes" role="tabpanel" aria-labelledby="tab-classes" :class="['panel', { active: tab === 'classes' }]">
      <div class="controls">
        <input v-model="cq" type="search" placeholder="Search classes…" aria-label="Search classes">
        <span class="count">{{ fmt(filteredClasses.length) }} class{{ filteredClasses.length === 1 ? "" : "es" }}</span>
      </div>
      <DataTable
        :columns="classCols"
        :rows="filteredClasses"
        empty="No classes match."
        :sort-key="cSort.sortKey.value"
        :sort-dir="cSort.sortDir.value"
        :state="state"
        :error="error"
        @retry="retry"
        @sort="cSort.toggleSort"
      >
        <template #row="{ row }">
          <td>
            <b>{{ row.label }}</b>
            <div class="mod">{{ row.description }}</div>
          </td>
          <td>
            <span class="flag">{{ row.gimmick }}</span>
            <div class="mod">{{ row.gimmickDescription }}</div>
          </td>
          <td class="num hide-sm">{{ row.nodes }}</td>
          <td class="num">
            <button v-if="row.keystones" type="button" class="link-btn" @click="showKeystones(row.label)">
              {{ row.keystones }} →
            </button>
            <template v-else>0</template>
          </td>
        </template>
      </DataTable>
    </div>

    <div id="panel-keystones" role="tabpanel" aria-labelledby="tab-keystones" :class="['panel', { active: tab === 'keystones' }]">
      <div class="controls">
        <input v-model="kq" type="search" placeholder="Search keystones…" aria-label="Search keystones">
        <select v-model="kclass" aria-label="Class">
          <option value="">All classes</option>
          <option v-for="c in classLabels" :key="c" :value="c">{{ c }}</option>
        </select>
        <FilterTools v-model:starred-only="kStarred" :active="kFilters.active.value" :star-count="kStars.count.value" @clear="kFilters.clear" />
        <span class="count">{{ fmt(filteredKeys.length) }} keystone{{ filteredKeys.length === 1 ? "" : "s" }}</span>
      </div>
      <DataTable
        :columns="keyCols"
        :rows="filteredKeys"
        :stars="kStars"
        empty="No keystones match."
        :sort-key="kSort.sortKey.value"
        :sort-dir="kSort.sortDir.value"
        :state="state"
        :error="error"
        @retry="retry"
        @sort="kSort.toggleSort"
      >
        <template #row="{ row }">
          <td class="cat hide-sm">{{ row.classLabel }}</td>
          <td>
            <b>{{ row.label }}</b>
            <div class="mod">{{ row.nodeId }}</div>
          </td>
          <td>{{ row.description }}</td>
          <td class="price">{{ row.cost }}</td>
          <td class="mod hide-sm">{{ row.bonuses }}</td>
        </template>
      </DataTable>
    </div>
  </div>
</template>
