import { ref } from "vue";
import { loadMeta } from "../lib/data";

const state = ref(null);
let started = false;

/**
 * What the last upload added or repriced, by the label the Changes page uses.
 * badge(catalog, label) gives { kind: "new" | "up" | "down", text, title } or null.
 */
export function useChanges() {
  if (!started) {
    started = true;
    loadMeta().then((meta) => {
      const out = {};
      for (const [name, diff] of Object.entries(meta?.changes ?? {})) {
        if (!diff) continue;
        out[name] = {
          added: new Set(diff.added?.list ?? []),
          prices: new Map((diff.prices?.list ?? []).map((entry) => [entry.name, entry])),
        };
      }
      state.value = out;
    });
  }
  function badge(catalog, label) {
    const changes = state.value?.[catalog];
    if (!changes) return null;
    if (changes.added.has(label)) return { kind: "new", text: "NEW", title: "Added in the last update" };
    const price = changes.prices.get(label);
    if (price) {
      const up = price.to > price.from;
      return {
        kind: up ? "up" : "down",
        text: up ? "PRICE ▲" : "PRICE ▼",
        title: `Was ${Number(price.from).toLocaleString()}, now ${Number(price.to).toLocaleString()}`,
      };
    }
    return null;
  }
  return { badge };
}
