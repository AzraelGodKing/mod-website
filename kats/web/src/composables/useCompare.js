import { computed, ref } from "vue";

const picked = ref([]);
const open = ref(false);
export const COMPARE_MAX = 3;

/** Up to three rows of one catalog, put side by side. Not saved between visits. */
export function useCompare() {
  const idOf = (details) => `${details.catalog}:${details.key || details.title}`;
  function toggle(details) {
    const id = idOf(details);
    if (picked.value.some((entry) => entry.id === id)) {
      picked.value = picked.value.filter((entry) => entry.id !== id);
      return;
    }
    // Rows of different lists have nothing in common to compare, so a new list starts over.
    const same = picked.value.filter((entry) => entry.details.catalog === details.catalog);
    picked.value = [...same.slice(-(COMPARE_MAX - 1)), { id, details }];
  }
  return {
    picked,
    open,
    count: computed(() => picked.value.length),
    has: (details) => picked.value.some((entry) => entry.id === idOf(details)),
    toggle,
    remove: (id) => {
      picked.value = picked.value.filter((entry) => entry.id !== id);
      if (picked.value.length < 2) open.value = false;
    },
    clear: () => {
      picked.value = [];
      open.value = false;
    },
  };
}
