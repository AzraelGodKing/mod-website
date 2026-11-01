// Turns a 7 Days mod's shipped config file into form fields, and writes the file
// back from the form. Every comment and blank line is kept, so the downloaded
// file reads like the one in the zip with only the chosen values changed.

const SETTING = /^(#?)\s*([A-Za-z][\w.]*)(\s*=\s*)(.*)$/;
const ENTITY = /^#?((?:zombie|animal)[A-Za-z0-9_]+)\b(.*)$/;
const SECTION = /^#\s*-{3,}\s*(.+?)\s*-{3,}\s*$/;

/** @param {string} text */
const lines = (text) => String(text).replace(/\r\n/g, "\n").split("\n");

/**
 * key = value lines. A commented line is a setting left at its default.
 * The comment block straight above a setting (up to a blank line) is its help.
 * @param {string} text
 * @returns {{ key: string; value: string; commented: boolean; help: string[]; line: number; sep: string }[]}
 */
export function parseSettings(text) {
  const out = [];
  let help = [];
  lines(text).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) {
      help = [];
      return;
    }
    const match = line.match(SETTING);
    // "# Hour (0-23) for the warning, e.g. 21 = one hour..." is prose, not a setting: settings have no spaces before "=".
    if (match && !/\s/.test(match[2]) && (match[1] === "" || /^#[A-Za-z]/.test(line))) {
      out.push({ key: match[2], value: match[4].trim(), commented: match[1] === "#", help, line: index, sep: match[3] });
      help = [];
      return;
    }
    if (line.startsWith("#")) help = [...help, line.replace(/^#\s?/, "")];
  });
  return out;
}

/**
 * @param {string} text The shipped file.
 * @param {Record<string, string | null>} values A new value per key; null comments the line out.
 */
export function renderSettings(text, values) {
  const fields = new Map(parseSettings(text).map((field) => [field.line, field]));
  const out = lines(text).map((raw, index) => {
    const field = fields.get(index);
    if (!field || !(field.key in values)) return raw;
    const value = values[field.key];
    const clean = value === null ? field.value : String(value).replace(/[\r\n]+/g, " ").trim();
    return `${value === null ? "#" : ""}${field.key}${field.sep}${clean}`;
  });
  return out.join("\r\n");
}

/**
 * Remove Any Entity's list: one creature per line, grouped under "---- NAME ----" headers.
 * @param {string} text
 * @returns {{ name: string; note: string; group: string; line: number; active: boolean }[]}
 */
export function parseEntities(text) {
  const out = [];
  let group = "";
  lines(text).forEach((raw, index) => {
    const line = raw.trim();
    const section = line.match(SECTION);
    if (section) {
      group = section[1];
      return;
    }
    const match = line.match(ENTITY);
    if (!match) return;
    // Only plain lines are listed; "x in desert" or "x -> y" lines in the shipped file stay as they are.
    if (/^\s*(in\s|->)/.test(match[2])) return;
    out.push({ name: match[1], note: match[2].trim(), group, line: index, active: !line.startsWith("#") });
  });
  return out;
}

export const BIOMES = ["pine_forest", "burnt_forest", "desert", "snow", "wasteland"];

/**
 * @typedef {{ action: "keep" } | { action: "remove" } | { action: "biomes"; biomes: string[] } | { action: "swap"; target: string }} EntityChoice
 * @param {string} text
 * @param {Record<string, EntityChoice>} choices Creatures not listed keep their line.
 */
export function renderEntities(text, choices) {
  const entries = new Map(parseEntities(text).map((entry) => [entry.line, entry]));
  const known = new Set([...entries.values()].map((entry) => entry.name));
  const out = lines(text).map((raw, index) => {
    const entry = entries.get(index);
    const choice = entry && choices[entry.name];
    if (!choice) return raw;
    const note = entry.note ? `   ${entry.note}` : "";
    if (choice.action === "remove") return `${entry.name}${note}`;
    if (choice.action === "biomes") {
      const biomes = (choice.biomes ?? []).filter((biome) => BIOMES.includes(biome));
      return biomes.length ? `${entry.name} in ${biomes.join(", ")}` : `#${entry.name}${note}`;
    }
    if (choice.action === "swap" && known.has(choice.target) && choice.target !== entry.name) return `${entry.name} -> ${choice.target}`;
    return `#${entry.name}${note}`;
  });
  return out.join("\r\n");
}

/**
 * Allowed values for a setting, from the mod's config entry. "*Respawn" matches any key ending in Respawn.
 * @param {Record<string, string[]>} options
 * @param {string} key
 * @param {string} value
 */
export function optionsFor(options, key, value) {
  const exact = options?.[key];
  if (exact) return exact;
  const suffix = Object.keys(options ?? {}).find((pattern) => pattern.startsWith("*") && key.endsWith(pattern.slice(1)));
  if (suffix) return options[suffix];
  if (/^(on|off)$/i.test(value)) return ["on", "off"];
  return null;
}
