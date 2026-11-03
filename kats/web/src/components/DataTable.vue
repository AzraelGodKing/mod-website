<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { copyText } from "../composables/useCopy";
import { useLocal } from "../composables/useLocal.js";
import { toCsv } from "../lib/catalogs";
import DetailDialog from "./DetailDialog.vue";

const PAGE = 150;

const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  empty: { type: String, default: "No results." },
  sortKey: { type: [String, Number], default: null },
  sortDir: { type: Number, default: 1 },
  state: { type: String, default: "ready" },
  error: { type: String, default: "" },
  copyFor: { type: Function, default: null },
  stars: { type: Object, default: null },
  detailsFor: { type: Function, default: null },
  csvName: { type: String, default: "" },
  label: { type: String, default: "" },
});

const emit = defineEmits(["sort", "retry"]);

const compact = useLocal("katsrics-compact", false);
const details = ref(null);
const lead = computed(() => Boolean(props.stars || props.detailsFor));

function openDetails(row) {
  details.value = props.detailsFor(row);
}

function downloadCsv() {
  const blob = new Blob([toCsv(props.columns, props.rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${props.csvName || "katsrics"}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const limit = ref(PAGE);
const visible = computed(() => props.rows.slice(0, limit.value));
const remaining = computed(() => Math.max(0, props.rows.length - limit.value));

watch(
  () => props.rows,
  () => {
    limit.value = PAGE;
  },
);

function showMore() {
  limit.value += PAGE;
}

const sentinel = ref(null);
let observer;
watch(sentinel, (el) => {
  observer?.disconnect();
  if (!el || typeof IntersectionObserver === "undefined") return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) showMore();
    },
    { rootMargin: "600px 0px" },
  );
  observer.observe(el);
});
onBeforeUnmount(() => observer?.disconnect());

function ariaSort(col) {
  if (props.sortKey !== col.key) return "none";
  return props.sortDir === 1 ? "ascending" : "descending";
}

function commandOf(row) {
  return props.copyFor ? props.copyFor(row) : "";
}

function onRowClick(row, event) {
  const command = commandOf(row);
  if (!command) return;
  if (event.target.closest("a, button, input, select")) return;
  const selection = window.getSelection?.();
  if (selection && String(selection).trim()) return;
  copyText(command);
}
</script>

<template>
  <main>
    <div v-if="state === 'ready'" class="table-tools">
      <label class="toggle"><input v-model="compact" type="checkbox"> Compact rows</label>
      <button v-if="csvName && rows.length" type="button" class="link-btn" @click="downloadCsv">
        Download CSV ({{ rows.length.toLocaleString() }} rows)
      </button>
    </div>
    <div :class="['table-shell', { compact }]">
      <table :aria-label="label || undefined" :aria-busy="state === 'loading' ? 'true' : 'false'">
        <thead>
          <tr>
            <th v-if="lead" class="star-col" scope="col" aria-label="Star and details"></th>
            <th
              v-for="col in columns"
              :key="col.key"
              :class="col.thClass"
              :style="col.align === 'right' ? { textAlign: 'right' } : null"
              :aria-sort="ariaSort(col)"
              scope="col"
            >
              <button type="button" class="sort-btn" @click="emit('sort', col.key)">
                {{ col.label }}
                <span class="arrow" aria-hidden="true">{{ sortKey === col.key ? (sortDir === 1 ? "▲" : "▼") : "" }}</span>
              </button>
            </th>
            <th v-if="copyFor" class="copy-col" scope="col" aria-label="Copy command"></th>
          </tr>
        </thead>
        <tbody v-if="state === 'ready'">
          <tr
            v-for="(row, i) in visible"
            :key="row._key ?? i"
            :class="{ disabled: row._disabled, copyable: !!commandOf(row) }"
            :title="commandOf(row) ? `Click to copy ${commandOf(row)}` : undefined"
            @click="onRowClick(row, $event)"
          >
            <td v-if="lead" class="star-cell">
              <button
                v-if="stars"
                type="button"
                :class="['star-btn', { on: stars.has(row._key) }]"
                :aria-pressed="stars.has(row._key) ? 'true' : 'false'"
                :aria-label="stars.has(row._key) ? 'Unstar' : 'Star'"
                @click="stars.toggle(row._key)"
              >
                {{ stars.has(row._key) ? "★" : "☆" }}
              </button>
              <button
                v-if="detailsFor"
                type="button"
                class="info-btn"
                :aria-label="`Details for ${detailsFor(row).title}`"
                @click="openDetails(row)"
              >
                ⓘ
              </button>
            </td>
            <slot name="row" :row="row" />
            <td v-if="copyFor" class="copy-cell">
              <button
                v-if="commandOf(row)"
                type="button"
                class="copy-btn"
                :aria-label="`Copy ${commandOf(row)}`"
                @click="copyText(commandOf(row))"
              >
                Copy
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="state === 'loading'" class="empty" role="status">Loading catalog…</div>
      <div v-else-if="state === 'error'" class="empty error" role="alert">
        <p>{{ error || "The catalog could not be loaded." }}</p>
        <button type="button" class="retry-btn" @click="emit('retry')">Try again</button>
      </div>
      <div v-else-if="!rows.length" class="empty">{{ empty }}</div>
      <div v-else-if="remaining" ref="sentinel" class="more">
        <button type="button" class="retry-btn" @click="showMore">
          Show more ({{ remaining.toLocaleString() }} left)
        </button>
      </div>
    </div>
    <DetailDialog :details="details" @close="details = null" />
  </main>
</template>
