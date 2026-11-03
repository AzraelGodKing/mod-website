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
import { chatCommand, rowsOf, detailsOf } from "../lib/catalogs";
import { useSort } from "../composables/useSort";
import { useQueryState } from "../composables/useQueryState";
import { useStickyOffsets } from "../composables/useStickyOffsets";

const { sync } = useStickyOffsets();

const traits = ref([]);
const xenotypes = ref([]);
const tab = useQueryState("tab", "traits");
const tabs = [
  { id: "traits", label: "Traits" },
  { id: "xenotypes", label: "Xenotypes" },
];

const tq = useQueryState("q", "");
const tmod = useQueryState("mod", "");
const tAddable = useQueryState("addable", false);
const tRemovable = useQueryState("removable", false);
const tBypass = useQueryState("bypass", false);
const xq = useQueryState("xq", "");
const xrace = useQueryState("race", "");
const xEnabled = useQueryState("enabled", true);

const tStarred = useQueryState("starred", false);
const xStarred = useQueryState("xstarred", false);
const { affordable, limit } = useBalance();
const tStars = useStars("traits");
const xStars = useStars("xenotypes");
const { badge } = useChanges();
const tFilters = useFilters([[tq, ""], [tmod, ""], [tAddable, false], [tRemovable, false], [tBypass, false], [tStarred, false]]);
const xFilters = useFilters([[xq, ""], [xrace, ""], [xEnabled, true], [xStarred, false]]);

const tSort = useSort("name");
const xSort = useSort("xenotype", 1, "x");

const traitCols = [
  { key: "name", label: "Trait" },
  { key: "effects", label: "Effects", thClass: "hide-sm" },
  { key: "degree", label: "Degree", thClass: "hide-sm", align: "right" },
  { key: "addPrice", label: "Add $", align: "right" },
  { key: "removePrice", label: "Remove $", align: "right" },
  { key: "flags", label: "Flags", csv: (r) => traitFlags(r) },
  { key: "mod", label: "Mod", thClass: "hide-sm" },
];

const xenoCols = [
  { key: "xenotype", label: "Xenotype" },
  { key: "race", label: "Race" },
  { key: "price", label: "Price", align: "right" },
  { key: "enabled", label: "Enabled", csv: (r) => (r.ok ? "yes" : "no") },
  { key: "modActive", label: "Mod active", thClass: "hide-sm" },
];

const { state, error, retry } = useLoader(async () => {
  const [tRows, xRows] = await Promise.all([loadJson("traits"), loadJson("xenotypes")]);
  traits.value = tRows.map(rowsOf.traits);
  xenotypes.value = xRows.map(rowsOf.xenotypes);
});

watch([tab, limit], () => sync());

const mods = computed(() => uniqueSorted(traits.value, (r) => r.mod));
const races = computed(() => uniqueSorted(xenotypes.value, (r) => r.race));
const addableCount = computed(() => traits.value.filter((r) => r.canAdd).length);
const enabledXenos = computed(() => xenotypes.value.filter((r) => r.xenotypeEnabled && r.raceEnabled).length);

const stats = computed(() => [
  { value: fmt(traits.value.length), label: "traits" },
  { value: fmt(addableCount.value), label: "addable" },
  { value: fmt(xenotypes.value.length), label: "xenotype prices" },
  { value: fmt(enabledXenos.value), label: "enabled" },
  { value: String(races.value.length), label: "races" },
]);

function traitFlags(r) {
  return [r.canAdd && "ADD", r.canRemove && "REMOVE", r.bypassLimit && "BYPASS"].filter(Boolean).join(" ") || "";
}

const filteredTraits = computed(() => {
  const term = tq.value.trim().toLowerCase();
  let list = traits.value.filter((r) =>
    (!tmod.value || r.mod === tmod.value) &&
    (!tAddable.value || r.canAdd) &&
    (!tRemovable.value || r.canRemove) &&
    (!tBypass.value || r.bypassLimit) &&
    affordable(r.addPrice) &&
    (!tStarred.value || tStars.has(`${r.defName}-${r.degree}`)) &&
    (!term ||
      r.name.toLowerCase().includes(term) ||
      r.defName.toLowerCase().includes(term) ||
      r.effects.toLowerCase().includes(term) ||
      r.description.toLowerCase().includes(term)),
  );
  list = tSort.sorted(list, (r) => (tSort.sortKey.value === "flags" ? traitFlags(r) || "~" : r[tSort.sortKey.value]));
  return list.map((r) => ({ ...r, _key: `${r.defName}-${r.degree}` }));
});

const filteredXenos = computed(() => {
  const term = xq.value.trim().toLowerCase();
  let list = xenotypes.value.filter((r) =>
    (!xrace.value || r.race === xrace.value) &&
    (!xEnabled.value || (r.xenotypeEnabled && r.raceEnabled)) &&
    affordable(r.price) &&
    (!xStarred.value || xStars.has(`${r.raceDef}-${r.xenotype}`)) &&
    (!term ||
      r.race.toLowerCase().includes(term) ||
      r.raceDef.toLowerCase().includes(term) ||
      r.xenotype.toLowerCase().includes(term)),
  );
  list = xSort.sorted(list, (r) => {
    if (xSort.sortKey.value === "enabled") return r.xenotypeEnabled && r.raceEnabled ? 1 : 0;
    return r[xSort.sortKey.value];
  });
  return list.map((r) => ({
    ...r,
    ok: r.xenotypeEnabled && r.raceEnabled,
    _disabled: !(r.xenotypeEnabled && r.raceEnabled),
    _key: `${r.raceDef}-${r.xenotype}`,
  }));
});
</script>

<template>
  <div class="page-shell">
    <PageIntro
      kicker="Channel 02"
      title="Traits & Xenotypes"
      lede="Pawn traits and xenotype prices from the CAP ChatInteractive config, including what each trait does."
      :stats="stats"
    >
      <template v-if="tab === 'traits'">
        Look up with <code>!trait &lt;name&gt;</code> or <code>!lookup trait &lt;name&gt;</code>.
        Add <code>!addtrait &lt;trait&gt;</code> · remove <code>!removetrait &lt;trait&gt;</code> ·
        replace <code>!replacetrait &lt;old&gt; &lt;new&gt;</code>.
      </template>
      <template v-else>
        List xenotypes for a race with <code>!xenotypes &lt;race&gt;</code>
        (e.g. <code>!xenotypes human</code>). Prices apply when buying a pawn via <code>!pawn</code> / <code>!buy</code>.
      </template>
    </PageIntro>

    <TabBar v-model="tab" :tabs="tabs" label="Traits or xenotypes" />

    <div id="panel-traits" role="tabpanel" aria-labelledby="tab-traits" :class="['panel', { active: tab === 'traits' }]">
      <div class="controls">
        <input v-model="tq" type="search" placeholder="Search traits… (name, effect, or description)" aria-label="Search traits">
        <select v-model="tmod" aria-label="Mod">
          <option value="">All mods</option>
          <option v-for="m in mods" :key="m" :value="m">{{ m }}</option>
        </select>
        <label class="toggle"><input v-model="tAddable" type="checkbox"> Addable only</label>
        <label class="toggle"><input v-model="tRemovable" type="checkbox"> Removable only</label>
        <label class="toggle"><input v-model="tBypass" type="checkbox"> Bypass limit only</label>
        <FilterTools v-model:starred-only="tStarred" :active="tFilters.active.value" :star-count="tStars.count.value" show-balance @clear="tFilters.clear" />
        <span class="count">{{ fmt(filteredTraits.length) }} trait{{ filteredTraits.length === 1 ? "" : "s" }}</span>
      </div>
      <DataTable
        label="Traits"
        csv-name="traits"
        :details-for="detailsOf['traits']"
        :columns="traitCols"
        :rows="filteredTraits"
        empty="No traits match your search."
        :sort-key="tSort.sortKey.value"
        :sort-dir="tSort.sortDir.value"
        :state="state"
        :error="error"
        :copy-for="chatCommand.traits"
        :stars="tStars"
        @sort="tSort.toggleSort"
        @retry="retry"
      >
        <template #row="{ row }">
          <td class="trait-cell">
            <b>{{ row.name }}</b> <ChangeBadge :info="badge('traits', row.name)" />
            <span class="def">{{ row.defName }}</span>
            <span v-if="row.description" class="desc">{{ row.description }}</span>
            <span v-if="row.effects" class="effects">{{ row.effects }}</span>
          </td>
          <td class="cat hide-sm">
            <template v-if="row.effects">{{ row.effects }}</template>
            <span v-else class="off">—</span>
          </td>
          <td class="num hide-sm">{{ row.degree }}</td>
          <td class="price">{{ fmt(row.addPrice) }}</td>
          <td class="price">{{ fmt(row.removePrice) }}</td>
          <td class="flags">
            <span v-if="row.canAdd" class="flag">ADD</span>
            <span v-if="row.canRemove" class="flag">REMOVE</span>
            <span v-if="row.bypassLimit" class="flag">BYPASS</span>
            <span v-if="!row.canAdd && !row.canRemove && !row.bypassLimit" class="off">—</span>
          </td>
          <td class="mod hide-sm">{{ row.mod }}</td>
        </template>
      </DataTable>
    </div>

    <div id="panel-xenotypes" role="tabpanel" aria-labelledby="tab-xenotypes" :class="['panel', { active: tab === 'xenotypes' }]">
      <div class="controls">
        <input v-model="xq" type="search" placeholder="Search xenotypes… (race or xenotype)" aria-label="Search xenotypes">
        <select v-model="xrace" aria-label="Race">
          <option value="">All races</option>
          <option v-for="r in races" :key="r" :value="r">{{ r }}</option>
        </select>
        <label class="toggle"><input v-model="xEnabled" type="checkbox"> Enabled only</label>
        <FilterTools v-model:starred-only="xStarred" :active="xFilters.active.value" :star-count="xStars.count.value" show-balance @clear="xFilters.clear" />
        <span class="count">{{ fmt(filteredXenos.length) }} xenotype{{ filteredXenos.length === 1 ? "" : "s" }}</span>
      </div>
      <DataTable
        label="Xenotypes"
        csv-name="xenotypes"
        :details-for="detailsOf['xenotypes']"
        :columns="xenoCols"
        :rows="filteredXenos"
        empty="No xenotypes match your search."
        :sort-key="xSort.sortKey.value"
        :sort-dir="xSort.sortDir.value"
        :state="state"
        :error="error"
        :copy-for="chatCommand.xenotypes"
        :stars="xStars"
        @sort="xSort.toggleSort"
        @retry="retry"
      >
        <template #row="{ row }">
          <td><b>{{ row.xenotype }}</b> <ChangeBadge :info="badge('xenotypes', `${row.xenotype} (${row.race})`)" /></td>
          <td class="cat">{{ row.race }}</td>
          <td class="price">{{ fmt(row.price) }}</td>
          <td class="flags">
            <span v-if="row.ok" class="flag">YES</span>
            <span v-else class="off">NO</span>
          </td>
          <td class="mod hide-sm">
            <span v-if="row.modActive" class="flag">YES</span>
            <span v-else class="off">NO</span>
          </td>
        </template>
      </DataTable>
    </div>
  </div>
</template>
