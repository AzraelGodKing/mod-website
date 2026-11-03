import { onMounted, ref } from "vue";

const cache = new Map();

export function loadJson(name) {
  if (!cache.has(name)) {
    const request = fetch(`/data/${name}.json`).then(async (res) => {
      if (!res.ok) throw new Error(`The ${name} list could not be loaded (${res.status}).`);
      return res.json();
    });
    request.catch(() => cache.delete(name));
    cache.set(name, request);
  }
  return cache.get(name);
}

export function loadMeta() {
  return loadJson("meta").catch(() => null);
}

/** Runs a loader on mount and tracks loading / ready / error for the page. */
export function useLoader(load) {
  const state = ref("loading");
  const error = ref("");
  async function run() {
    state.value = "loading";
    error.value = "";
    try {
      await load();
      state.value = "ready";
    } catch (err) {
      error.value = err instanceof Error ? err.message : "The catalog could not be loaded.";
      state.value = "error";
    }
  }
  onMounted(run);
  return { state, error, retry: run };
}

export function fmt(n) {
  return Number(n).toLocaleString();
}

export function uniqueSorted(rows, pick) {
  return [...new Set(rows.map(pick).filter((value) => value !== "" && value != null))].sort((a, b) =>
    String(a).localeCompare(String(b)),
  );
}

export function relativeTime(iso, now = Date.now()) {
  const time = new Date(iso).getTime();
  if (!iso || Number.isNaN(time)) return "";
  const minutes = Math.round((now - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function longDate(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
