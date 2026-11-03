import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

let pending = null;

function queue(router, path, key, value) {
  if (!pending) {
    pending = { path, values: {} };
    queueMicrotask(() => {
      const { path: target, values } = pending;
      pending = null;
      const current = router.currentRoute.value;
      if (current.path !== target) return;
      const query = { ...current.query, ...values };
      for (const name of Object.keys(query)) if (query[name] === undefined) delete query[name];
      router.replace({ query });
    });
  }
  pending.values[key] = value;
}

/**
 * A ref that mirrors one query-string value, so searches and filters live in the link.
 * Booleans are stored as 1 / 0 and default values are left out of the URL.
 */
export function useQueryState(key, fallback) {
  const route = useRoute();
  const router = useRouter();
  const path = route.path;
  const isBool = typeof fallback === "boolean";

  const read = () => {
    const raw = route.query[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value == null) return fallback;
    return isBool ? value === "1" : String(value);
  };

  const state = ref(read());

  watch(
    () => route.query[key],
    () => {
      if (route.path !== path) return;
      const value = read();
      if (value !== state.value) state.value = value;
    },
  );

  watch(state, (value) => {
    if (route.path !== path) return;
    const encoded = value === fallback ? undefined : isBool ? (value ? "1" : "0") : value;
    queue(router, path, key, encoded === "" ? undefined : encoded);
  });

  return state;
}
