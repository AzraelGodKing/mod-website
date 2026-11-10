// Data for the stream overlay at live.azraelsmods.com, trimmed to what a card shows.
// Kept free of Worker APIs so test/live.test.mjs can run it in Node.

export const SITE = "https://azraelsmods.com";
export const KATS = "https://kats.azraelsmods.com";
export const POI = "https://poi.azraelsmods.com";

// Kat's RICS lists the overlay can show, and how a row becomes one card line.
export const KATS_LISTS = {
  commands: {
    label: "Chat commands",
    source: "commands",
    // Moderator and broadcaster commands aren't for viewers, so they stay off stream.
    line: (r) =>
      r[6] && !/moderator|broadcaster|streamer/i.test(String(r[3] ?? ""))
        ? { cmd: `!${r[0]}`, text: String(r[2] ?? "").replace(/\/n/g, " "), cost: r[7] && Number(r[4]) > 0 ? Number(r[4]) : null }
        : null,
  },
  "addon-commands": {
    label: "More commands",
    source: "addon-commands",
    line: (r) => (r[1] ? { cmd: String(r[1]), text: String(r[2] ?? ""), cost: null } : null),
  },
  store: {
    label: "Store",
    source: "items",
    line: (r) => (r[9] && Number(r[3]) > 0 ? { cmd: `!buy ${r[1]}`, text: String(r[0] ?? ""), cost: Number(r[3]) } : null),
  },
  events: {
    label: "Events",
    source: "incidents",
    line: (r) => (r[6] && r[8] !== 0 && r[8] !== false && r[13] !== 0 && r[13] !== false ? { cmd: `!event ${r[0]}`, text: String(r[2] ?? ""), cost: Number(r[3]) || null } : null),
  },
  weather: {
    label: "Weather",
    source: "weather",
    line: (r) => (r[5] ? { cmd: `!weather ${r[0]}`, text: "", cost: Number(r[2]) || null } : null),
  },
};

const MAX_LINES = 400;

/** releases.json -> the mods a streamer can pick. */
export function modsFrom(releasesJson) {
  const list = Array.isArray(releasesJson?.releases) ? releasesJson.releases : [];
  return list
    .filter((release) => release && release.key && release.name)
    .map((release) => ({
      key: String(release.key),
      game: String(release.game),
      gameName: String(release.gameName ?? release.game),
      name: String(release.name),
      version: String(release.version ?? ""),
      path: String(release.path ?? `/${release.key}`),
    }))
    .sort((a, b) => a.gameName.localeCompare(b.gameName) || a.name.localeCompare(b.name));
}

/** A Kat's RICS list (rows of arrays) -> card lines. Unknown lists give null. */
export function katsLines(name, rows) {
  const list = KATS_LISTS[name];
  if (!list || !Array.isArray(rows)) return null;
  const lines = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const line = list.line(row);
    if (line && line.cmd) lines.push({ ...line, text: line.text.slice(0, 120) });
    if (lines.length >= MAX_LINES) break;
  }
  return { name, label: list.label, lines };
}

const POSITIONS = new Set(["tl", "tr", "bl", "br"]);
const THEMES = new Set(["dark", "light", "glass"]);
export const CARD_TYPES = new Set(["mods", "milestones", "bloodmoon", "kofi", "message", ...Object.keys(KATS_LISTS)]);

// Download counts worth a cheer: 100, 250, 500, then 1, 2.5 and 5 times each power of ten.
export function milestoneSteps(upTo) {
  const steps = [100, 250, 500];
  for (let base = 1000; steps.at(-1) <= upTo; base *= 10) steps.push(base, base * 2.5, base * 5);
  return steps;
}

/** The last milestone a count passed, the next one, and how far away it is. */
export function milestoneFor(count) {
  const value = Math.max(0, Math.floor(Number(count) || 0));
  const steps = milestoneSteps(value);
  const next = steps.find((step) => step > value);
  const reached = steps.filter((step) => step <= value).at(-1) ?? null;
  return { reached, next, toGo: next - value };
}

/** The milestone a count went past between two readings, or null. */
export function milestoneCrossed(before, after) {
  if (typeof before !== "number" || typeof after !== "number" || after <= before) return null;
  const passed = milestoneSteps(after).filter((step) => step > before && step <= after);
  return passed.at(-1) ?? null;
}

/**
 * /api/stats -> download totals for the mods a card can cheer for.
 * `total` is the function the README badges use, so the overlay and the badge agree.
 */
export function countsFrom(statsJson, total) {
  const counts = {};
  for (const [key, stats] of Object.entries(statsJson?.mods ?? {})) {
    const sum = total(stats);
    if (sum && sum.label === "downloads" && sum.value > 0) counts[key] = sum.value;
  }
  return counts;
}

/**
 * Days until the next blood moon when the horde comes every `every` days (7 unless the
 * server changed it): 0 means tonight. A server with a random range can be off by that range.
 */
export function bloodMoonIn(day, every = 7) {
  const d = Math.floor(Number(day));
  const n = Math.floor(Number(every));
  if (!Number.isFinite(d) || d < 1 || !Number.isFinite(n) || n < 1) return null;
  const left = (n - (d % n)) % n;
  return { day: d, every: n, daysLeft: left, nextDay: d + left };
}

/** Reads the overlay's URL settings, with safe defaults for anything missing or odd. */
export function overlaySettings(searchParams) {
  const get = (key) => searchParams.get(key) ?? "";
  const number = (key, fallback, min, max) => {
    const value = Number(get(key));
    return Number.isFinite(value) && get(key) !== "" ? Math.min(max, Math.max(min, value)) : fallback;
  };
  const show = get("show")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => CARD_TYPES.has(s));
  return {
    mods: get("mods")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[a-z0-9-]+\/[a-z0-9-]+$/.test(s))
      .slice(0, 60),
    show: show.length ? [...new Set(show)] : ["mods"],
    every: number("every", 15, 5, 120),
    pos: POSITIONS.has(get("pos")) ? get("pos") : "br",
    theme: THEMES.has(get("theme")) ? get("theme") : "dark",
    scale: number("scale", 1, 0.6, 2),
    title: get("title").slice(0, 60),
    msg: get("msg").slice(0, 160),
    moon: number("moon", 7, 1, 30),
  };
}
