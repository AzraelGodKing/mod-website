import { ref } from "vue";

export function compareValues(a, b, dir) {
  if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
  return String(a ?? "").localeCompare(String(b ?? "")) * dir;
}

export function useSort(defaultKey, defaultDir = 1) {
  const sortKey = ref(defaultKey);
  const sortDir = ref(defaultDir);

  function toggleSort(key) {
    if (sortKey.value === key) sortDir.value *= -1;
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
