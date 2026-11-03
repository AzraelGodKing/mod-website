<script setup>
import { computed, ref, watch } from "vue";
import PageIntro from "../components/PageIntro.vue";
import DataTable from "../components/DataTable.vue";
import FilterTools from "../components/FilterTools.vue";
import ChangeBadge from "../components/ChangeBadge.vue";
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

const commands = ref([]);
const addon = ref([]);
const tab = useQueryState("tab", "rics");
const tabs = [
  { id: "rics", label: "RICS Core" },
  { id: "addon", label: "Addon + Isekai" },
];

const rq = useQueryState("q", "");
const rperm = useQueryState("permission", "");
const rEnabled = useQueryState("enabled", true);
const aq = useQueryState("aq", "");
const ainteg = useQueryState("integration", "");
const aisekaiOnly = useQueryState("isekai", false);

const rStarred = useQueryState("starred", false);
const aStarred = useQueryState("astarred", false);
const rStars = useStars("commands");
const aStars = useStars("addon-commands");
const { badge } = useChanges();
const rFilters = useFilters([[rq, ""], [rperm, ""], [rEnabled, true], [rStarred, false]]);
const aFilters = useFilters([[aq, ""], [ainteg, ""], [aisekaiOnly, false], [aStarred, false]]);

function cooldownText(seconds) {
  const s = Number(seconds) || 0;
  if (s <= 0) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

const rSort = useSort("key");
const aSort = useSort("usage");

const ricsCols = [
  { key: "key", label: "Command" },
  { key: "label", label: "Label", thClass: "hide-sm" },
  { key: "description", label: "Description" },
  { key: "permission", label: "Permission" },
  { key: "cost", label: "Cost", thClass: "hide-sm", align: "right" },
  { key: "cooldown", label: "Cooldown", thClass: "hide-sm", align: "right" },
  { key: "enabled", label: "Status" },
];

const addonCols = [
  { key: "usage", label: "Usage" },
  { key: "description", label: "Description" },
  { key: "integration", label: "Integration" },
];

const { state, error, retry } = useLoader(async () => {
  const [cRows, aRows] = await Promise.all([loadJson("commands"), loadJson("addon-commands")]);
  commands.value = cRows.map(rowsOf.commands);
  addon.value = aRows.map(rowsOf["addon-commands"]);
});

watch(tab, () => sync());

const perms = computed(() => uniqueSorted(commands.value, (r) => r.permission));
const integs = computed(() => uniqueSorted(addon.value, (r) => r.integration));
const rEnabledCount = computed(() => commands.value.filter((r) => r.enabled).length);
const isekaiAddonCount = computed(() => addon.value.filter((r) => r.integration === "ISEKAI RPG LEVELING").length);

const stats = computed(() => [
  { value: fmt(commands.value.length), label: "RICS cmds" },
  { value: fmt(rEnabledCount.value), label: "enabled" },
  { value: fmt(addon.value.length), label: "addon cmds" },
  { value: fmt(isekaiAddonCount.value), label: "isekai cmds" },
]);

const filteredRics = computed(() => {
  const term = rq.value.trim().toLowerCase();
  let list = commands.value.filter((r) =>
    (!rEnabled.value || r.enabled) &&
    (!rperm.value || r.permission === rperm.value) &&
    (!rStarred.value || rStars.has(r.key)) &&
    (!term ||
      r.key.toLowerCase().includes(term) ||
      r.label.toLowerCase().includes(term) ||
      r.description.toLowerCase().includes(term) ||
      (r.alias && r.alias.toLowerCase().includes(term))),
  );
  list = rSort.sorted(list, (r) => {
    if (rSort.sortKey.value === "enabled") return r.enabled ? 1 : 0;
    return r[rSort.sortKey.value];
  });
  return list.map((r) => ({ ...r, _disabled: !r.enabled, _key: r.key }));
});

const filteredAddon = computed(() => {
  const term = aq.value.trim().toLowerCase();
  let list = addon.value.filter((r) =>
    (!aisekaiOnly.value || r.integration === "ISEKAI RPG LEVELING") &&
    (!ainteg.value || r.integration === ainteg.value) &&
    (!aStarred.value || aStars.has(r.key)) &&
    (!term ||
      r.key.toLowerCase().includes(term) ||
      r.usage.toLowerCase().includes(term) ||
      r.description.toLowerCase().includes(term) ||
      r.integration.toLowerCase().includes(term)),
  );
  list = aSort.sorted(list, (r) => r[aSort.sortKey.value]);
  return list.map((r) => ({ ...r, _key: r.key }));
});
</script>

<template>
  <div class="page-shell">
    <PageIntro
      kicker="Channel 05"
      title="Commands"
      lede="Every chat command from RICS core and the RICS Addon (including Isekai RPG Leveling)."
      :stats="stats"
    >
      <template v-if="tab === 'rics'">
        Core RICS commands from live <code>CommandSettings.json</code>.
        Cost/permission vary by colony config.
      </template>
      <template v-else>
        Addon commands from
        <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3760183125" target="_blank" rel="noopener">RICS Addon</a>.
        Isekai: <code>!isekai</code> / <code>!constellation unlock|path|learn</code>.
      </template>
    </PageIntro>

    <TabBar v-model="tab" :tabs="tabs" label="Command lists" />

    <div id="panel-rics" role="tabpanel" aria-labelledby="tab-rics" :class="['panel', { active: tab === 'rics' }]">
      <div class="controls">
        <input v-model="rq" type="search" placeholder="Search commands… (name or description)" aria-label="Search RICS commands">
        <select v-model="rperm" aria-label="Permission">
          <option value="">All permissions</option>
          <option v-for="p in perms" :key="p" :value="p">{{ p }}</option>
        </select>
        <label class="toggle"><input v-model="rEnabled" type="checkbox"> Enabled only</label>
        <FilterTools v-model:starred-only="rStarred" :active="rFilters.active.value" :star-count="rStars.count.value" @clear="rFilters.clear" />
        <span class="count">{{ fmt(filteredRics.length) }} command{{ filteredRics.length === 1 ? "" : "s" }}</span>
      </div>
      <DataTable
        label="RICS commands"
        :columns="ricsCols"
        :rows="filteredRics"
        empty="No commands match your search."
        :sort-key="rSort.sortKey.value"
        :sort-dir="rSort.sortDir.value"
        :state="state"
        :error="error"
        :copy-for="chatCommand.commands"
        :stars="rStars"
        @sort="rSort.toggleSort"
        @retry="retry"
      >
        <template #row="{ row }">
          <td>
            <b>!{{ row.key }}</b> <ChangeBadge :info="badge('commands', `!${row.key}`)" />
            <div v-if="row.alias" class="mod">alias {{ row.alias }}</div>
          </td>
          <td class="cat hide-sm">{{ row.label }}</td>
          <td>{{ row.description }}</td>
          <td class="cat">{{ row.permission }}</td>
          <td class="price hide-sm">{{ row.supportsCost ? fmt(row.cost) : "—" }}</td>
          <td class="num hide-sm">{{ cooldownText(row.cooldown) }}</td>
          <td class="flags">
            <span v-if="row.enabled" class="flag">ON</span>
            <span v-else class="off">DISABLED</span>
          </td>
        </template>
      </DataTable>
    </div>

    <div id="panel-addon" role="tabpanel" aria-labelledby="tab-addon" :class="['panel', { active: tab === 'addon' }]">
      <div class="controls">
        <input v-model="aq" type="search" placeholder="Search addon commands…" aria-label="Search addon commands">
        <select v-model="ainteg" aria-label="Integration">
          <option value="">All integrations</option>
          <option v-for="i in integs" :key="i" :value="i">{{ i }}</option>
        </select>
        <label class="toggle"><input v-model="aisekaiOnly" type="checkbox"> Isekai only</label>
        <FilterTools v-model:starred-only="aStarred" :active="aFilters.active.value" :star-count="aStars.count.value" @clear="aFilters.clear" />
        <span class="count">{{ fmt(filteredAddon.length) }} command{{ filteredAddon.length === 1 ? "" : "s" }}</span>
      </div>
      <DataTable
        label="Addon commands"
        :columns="addonCols"
        :rows="filteredAddon"
        empty="No addon commands match your search."
        :sort-key="aSort.sortKey.value"
        :sort-dir="aSort.sortDir.value"
        :state="state"
        :error="error"
        :copy-for="chatCommand['addon-commands']"
        :stars="aStars"
        @sort="aSort.toggleSort"
        @retry="retry"
      >
        <template #row="{ row }">
          <td><b>{{ row.usage }}</b></td>
          <td>{{ row.description }}</td>
          <td class="cat">{{ row.integration }}</td>
        </template>
      </DataTable>
    </div>
  </div>
</template>
