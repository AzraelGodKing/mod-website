import { computed } from "vue";

/** Counts the filters that differ from their defaults and resets them all at once. */
export function useFilters(pairs) {
  const active = computed(() => pairs.filter(([state, fallback]) => state.value !== fallback).length);
  function clear() {
    for (const [state, fallback] of pairs) state.value = fallback;
  }
  return { active, clear };
}
