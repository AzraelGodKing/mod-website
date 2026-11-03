<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { copyText } from "../composables/useCopy";

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
  label: { type: String, default: "" },
});

const emit = defineEmits(["sort", "retry"]);

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
    <div class="table-shell">
      <table :aria-label="label || undefined" :aria-busy="state === 'loading' ? 'true' : 'false'">
        <thead>
          <tr>
            <th v-if="stars" class="star-col" scope="col" aria-label="Starred"></th>
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
            <td v-if="stars" class="star-cell">
              <button
                type="button"
                :class="['star-btn', { on: stars.has(row._key) }]"
                :aria-pressed="stars.has(row._key) ? 'true' : 'false'"
                :aria-label="stars.has(row._key) ? 'Unstar' : 'Star'"
                @click="stars.toggle(row._key)"
              >
                {{ stars.has(row._key) ? "★" : "☆" }}
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
  </main>
</template>
