// Data for the stream overlay at live.azraelsmods.com, trimmed to what a card shows.
// Kept free of Worker APIs so test/live.test.mjs can run it in Node.

export const SITE = "https://azraelsmods.com";
export const KATS = "https://kats.azraelsmods.com";

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
export const CARD_TYPES = new Set(["mods", "kofi", "message", ...Object.keys(KATS_LISTS)]);

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
  };
}
