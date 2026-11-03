import { computed } from "vue";
import { useQueryState } from "./useQueryState.js";

export function compareValues(a, b, dir) {
  if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
  return String(a ?? "").localeCompare(String(b ?? "")) * dir;
}

/**
 * Column sorting kept in the link (?sort=price&dir=desc). Pages with two tables
 * pass a prefix for the second one so each keeps its own order.
 */
export function useSort(defaultKey, defaultDir = 1, prefix = "") {
  const sortKey = useQueryState(`${prefix}sort`, defaultKey);
  const dirState = useQueryState(`${prefix}dir`, defaultDir === 1 ? "asc" : "desc");
  const sortDir = computed({
    get: () => (dirState.value === "desc" ? -1 : 1),
    set: (value) => {
      dirState.value = value === -1 ? "desc" : "asc";
    },
  });

  function toggleSort(key) {
    if (sortKey.value === key) sortDir.value = sortDir.value * -1;
    else {
      sortKey.value = key;
      sortDir.value = 1;
    }
  }

  function sorted(list, valueFn) {
    const copy = [...list];
    copy.sort((a, b) => compareValues(valueFn(a), valueFn(b), sortDir.value));
    return copy;
  }

  return { sortKey, sortDir, toggleSort, sorted };
}
