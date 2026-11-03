import { computed } from "vue";
import { useLocal } from "./useLocal.js";

/** Starred rows for one catalog, saved in this browser. */
export function useStars(catalog) {
  const list = useLocal(`katsrics-stars-${catalog}`, []);
  const set = computed(() => new Set(list.value));
  return {
    count: computed(() => list.value.length),
    has: (key) => set.value.has(key),
    toggle(key) {
      list.value = set.value.has(key) ? list.value.filter((k) => k !== key) : [...list.value, key];
    },
  };
}
