import { ref, watch } from "vue";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const shared = new Map();

/** A ref saved in this browser only. Refs with the same key are shared across pages. */
export function useLocal(key, fallback) {
  if (!shared.has(key)) {
    const state = ref(read(key, fallback));
    watch(state, (value) => write(key, value), { deep: true });
    shared.set(key, state);
  }
  return shared.get(key);
}
