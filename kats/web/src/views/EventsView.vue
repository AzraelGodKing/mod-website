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
import TabBar from "../components/TabBar.vue";
import { loadJson, fmt, uniqueSorted, useLoader } from "../lib/data";
import { chatCommand, rowsOf } from "../lib/catalogs";
import { useSort } from "../composables/useSort";
import { useQueryState } from "../composables/useQueryState";
import { useStickyOffsets } from "../composables/useStickyOffsets";

const { sync } = useStickyOffsets();

const incidents = ref([]);
const weather = ref([]);
const tab = useQueryState("tab", "incidents");
const tabs = [
  { id: "incidents", label: "Incidents" },
  { id: "weather", label: "Weather" },
];

const iq = useQueryState("q", "");
const icat = useQueryState("category", "");
const imod = useQueryState("mod", "");
const ikarma = useQueryState("karma", "");
const itype = useQueryState("type", "");
const iEnabled = useQueryState("enabled", true);
const wq = useQueryState("wq", "");
const wmod = useQueryState("wmod", "");
const wkarma = useQueryState("wkarma", "");
const wEnabled = useQueryState("wenabled", true);

const iStarred = useQueryState("starred", false);
const wStarred = useQueryState("wstarred", false);
const { affordable, limit } = useBalance();
const iStars = useStars("incidents");
const wStars = useStars("weather");
const { badge } = useChanges();
const iFilters = useFilters([[iq, ""], [icat, ""], [imod, ""], [ikarma, ""], [itype, ""], [iEnabled, true], [iStarred, false]]);
const wFilters = useFilters([[wq, ""], [wmod, ""], [wkarma, ""], [wEnabled, true], [wStarred, false]]);

function karmaClass(karma) {
  const k = String(karma).toLowerCase();
  if (k.includes("good")) return "karma good";
  if (k.includes("doom") || k.includes("bad")) return "karma bad";
  return "karma neutral";
}

const iSort = useSort("label");
const wSort = useSort("label");

const incidentCols = [
  { key: "label", label: "Event" },
  { key: "category", label: "Category", thClass: "hide-sm" },
  { key: "cost", label: "Cost", align: "right" },
  { key: "karma", label: "Karma" },
  { key: "flags", label: "Flags" },
  { key: "mod", label: "Mod", thClass: "hide-sm" },
];

const weatherCols = [
  { key: "label", label: "Weather" },
  { key: "cost", label: "Cost", align: "right" },
  { key: "karma", label: "Karma" },
  { key: "cap", label: "Cap", thClass: "hide-sm", align: "right" },
  { key: "mod", label: "Mod", thClass: "hide-sm" },
];

const { state, error, retry } = useLoader(async () => {
  const [iRows, wRows] = await Promise.all([loadJson("incidents"), loadJson("weather")]);
  incidents.value = iRows.map(rowsOf.incidents);
  weather.value = wRows.map(rowsOf.weather);
});

watch([tab, limit], () => sync());

const cats = computed(() => uniqueSorted(incidents.value, (r) => r.category));
const iMods = computed(() => uniqueSorted(incidents.value, (r) => r.mod));
const iKarmas = computed(() => uniqueSorted(incidents.value, (r) => r.karma));
const wMods = computed(() => uniqueSorted(weather.value, (r) => r.mod));
const wKarmas = computed(() => uniqueSorted(weather.value, (r) => r.karma));
const iEnabledCount = computed(() => incidents.value.filter((r) => r.enabled).length);
const wEnabledCount = computed(() => weather.value.filter((r) => r.enabled).length);

const stats = computed(() => [
  { value: fmt(incidents.value.length), label: "incidents" },
  { value: fmt(iEnabledCount.value), label: "enabled" },
  { value: fmt(weather.value.length), label: "weather" },
  { value: fmt(wEnabledCount.value), label: "weather on" },
]);

function incidentFlags(r) {
  return [
    r.isRaid && "RAID",
    r.isDisease && "DISEASE",
    r.isQuest && "QUEST",
    r.isWeatherIncident && "WEATHER",
    r.availableForCommands && "CMD",
  ].filter(Boolean).join(" ") || "";
}

function matchesType(r) {
  if (!itype.value) return true;
  if (itype.value === "raid") return r.isRaid;
  if (itype.value === "disease") return r.isDisease;
  if (itype.value === "quest") return r.isQuest;
  if (itype.value === "weather") return r.isWeatherIncident;
  return true;
}

const filteredIncidents = computed(() => {
  const term = iq.value.trim().toLowerCase();
  let list = incidents.value.filter((r) =>
    (!iEnabled.value || r.enabled) &&
    (!icat.value || r.category === icat.value) &&
    (!imod.value || r.mod === imod.value) &&
    (!ikarma.value || r.karma === ikarma.value) &&
    matchesType(r) &&
    affordable(r.cost) &&
    (!iStarred.value || iStars.has(r.defName)) &&
    (!term || r.label.toLowerCase().includes(term) || r.defName.toLowerCase().includes(term)),
  );
  list = iSort.sorted(list, (r) => (iSort.sortKey.value === "flags" ? incidentFlags(r) || "~" : r[iSort.sortKey.value]));
  return list.map((r) => ({ ...r, _disabled: !r.enabled, _key: r.defName }));
});

const incidentsEmpty = computed(() =>
  iEnabled.value && incidents.value.length && !iEnabledCount.value
    ? `No incidents are enabled in the current settings. Untick "Enabled only" to see all ${fmt(incidents.value.length)}.`
    : "No incidents match your search.",
);
const weatherEmpty = computed(() =>
  wEnabled.value && weather.value.length && !wEnabledCount.value
    ? `No weather is enabled in the current settings. Untick "Enabled only" to see all ${fmt(weather.value.length)}.`
    : "No weather types match your search.",
);

const filteredWeather = computed(() => {
  const term = wq.value.trim().toLowerCase();
  let list = weather.value.filter((r) =>
    (!wEnabled.value || r.enabled) &&
    (!wmod.value || r.mod === wmod.value) &&
    (!wkarma.value || r.karma === wkarma.value) &&
    affordable(r.cost) &&
    (!wStarred.value || wStars.has(r.defName)) &&
    (!term || r.label.toLowerCase().includes(term) || r.defName.toLowerCase().includes(term)),
  );
  list = wSort.sorted(list, (r) => r[wSort.sortKey.value]);
  return list.map((r) => ({ ...r, _disabled: !r.enabled, _key: r.defName }));
});
</script>

<template>
  <div class="page-shell">
    <PageIntro kicker="Channel 04" title="Events & Weather" lede="Incidents and weather you can trigger with chat coins." :stats="stats">
      <template v-if="tab === 'incidents'">
        Trigger with <code>!event &lt;event_name&gt;</code> (e.g. <code>!event ambush</code>).
        Look up prices with <code>!lookup event &lt;name&gt;</code>.
        Raids also use <code>!raid</code> / <code>!raidinfo</code>.
      </template>
      <template v-else>
        Set weather with <code>!weather &lt;type&gt;</code>
        (e.g. <code>!weather rain</code>, <code>!weather clear</code>).
        Look up costs with <code>!lookup weather &lt;name&gt;</code>.
      </template>
    </PageIntro>

    <TabBar v-model="tab" :tabs="tabs" label="Incidents or weather" />

    <div id="panel-incidents" role="tabpanel" aria-labelledby="tab-incidents" :class="['panel', { active: tab === 'incidents' }]">
      <div class="controls">
        <input v-model="iq" type="search" placeholder="Search incidents… (name or defName)" aria-label="Search incidents">
        <select v-model="icat" aria-label="Category">
          <option value="">All categories</option>
          <option v-for="c in cats" :key="c" :value="c">{{ c }}</option>
        </select>
        <select v-model="imod" aria-label="Mod">
          <option value="">All mods</option>
          <option v-for="m in iMods" :key="m" :value="m">{{ m }}</option>
        </select>
        <select v-model="ikarma" aria-label="Karma">
          <option value="">All karma</option>
          <option v-for="k in iKarmas" :key="k" :value="k">{{ k }}</option>
        </select>
        <select v-model="itype" aria-label="Type">
          <option value="">All types</option>
          <option value="raid">Raid</option>
          <option value="disease">Disease</option>
          <option value="quest">Quest</option>
          <option value="weather">Weather incident</option>
        </select>
        <label class="toggle"><input v-model="iEnabled" type="checkbox"> Enabled only</label>
        <FilterTools v-model:starred-only="iStarred" :active="iFilters.active.value" :star-count="iStars.count.value" show-balance @clear="iFilters.clear" />
        <span class="count">{{ fmt(filteredIncidents.length) }} incident{{ filteredIncidents.length === 1 ? "" : "s" }}</span>
      </div>
      <DataTable
        label="Incidents"
        :columns="incidentCols"
        :rows="filteredIncidents"
        :empty="incidentsEmpty"
        :sort-key="iSort.sortKey.value"
        :sort-dir="iSort.sortDir.value"
        :state="state"
        :error="error"
        :copy-for="chatCommand.incidents"
        :stars="iStars"
        @sort="iSort.toggleSort"
        @retry="retry"
      >
        <template #row="{ row }">
          <td>
            <b>{{ row.label }}</b> <ChangeBadge :info="badge('incidents', row.label)" />
            <div class="mod">{{ row.defName }}</div>
          </td>
          <td class="cat hide-sm">{{ row.category }}</td>
          <td class="price">{{ fmt(row.cost) }}</td>
          <td><span :class="karmaClass(row.karma)">{{ row.karma }}</span></td>
          <td class="flags">
            <span v-if="row.isRaid" class="flag">RAID</span>
            <span v-if="row.isDisease" class="flag">DISEASE</span>
            <span v-if="row.isQuest" class="flag">QUEST</span>
            <span v-if="row.isWeatherIncident" class="flag">WEATHER</span>
            <span v-if="row.availableForCommands" class="flag">CMD</span>
            <span v-if="!row.enabled" class="off">DISABLED</span>
          </td>
          <td class="mod hide-sm">{{ row.mod }}</td>
        </template>
      </DataTable>
    </div>

    <div id="panel-weather" role="tabpanel" aria-labelledby="tab-weather" :class="['panel', { active: tab === 'weather' }]">
      <div class="controls">
        <input v-model="wq" type="search" placeholder="Search weather… (name or defName)" aria-label="Search weather">
        <select v-model="wmod" aria-label="Mod">
          <option value="">All mods</option>
          <option v-for="m in wMods" :key="m" :value="m">{{ m }}</option>
        </select>
        <select v-model="wkarma" aria-label="Karma">
          <option value="">All karma</option>
          <option v-for="k in wKarmas" :key="k" :value="k">{{ k }}</option>
        </select>
        <label class="toggle"><input v-model="wEnabled" type="checkbox"> Enabled only</label>
        <FilterTools v-model:starred-only="wStarred" :active="wFilters.active.value" :star-count="wStars.count.value" show-balance @clear="wFilters.clear" />
        <span class="count">{{ fmt(filteredWeather.length) }} weather type{{ filteredWeather.length === 1 ? "" : "s" }}</span>
      </div>
      <DataTable
        label="Weather"
        :columns="weatherCols"
        :rows="filteredWeather"
        :empty="weatherEmpty"
        :sort-key="wSort.sortKey.value"
        :sort-dir="wSort.sortDir.value"
        :state="state"
        :error="error"
        :copy-for="chatCommand.weather"
        :stars="wStars"
        @sort="wSort.toggleSort"
        @retry="retry"
      >
        <template #row="{ row }">
          <td>
            <b>{{ row.label }}</b> <ChangeBadge :info="badge('weather', row.label)" />
            <div class="mod">{{ row.defName }}</div>
            <span v-if="!row.enabled" class="off">DISABLED</span>
          </td>
          <td class="price">{{ fmt(row.cost) }}</td>
          <td><span :class="karmaClass(row.karma)">{{ row.karma }}</span></td>
          <td class="num hide-sm">{{ row.cap }}</td>
          <td class="mod hide-sm">{{ row.mod }}</td>
        </template>
      </DataTable>
    </div>
  </div>
</template>
