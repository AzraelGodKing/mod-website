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

/**
 * The "---- NAME ----" header each setting sits under ("" before the first one), in a
 * readable case: "REMINDERS before the blood moon" becomes "Reminders before the blood moon".
 * @param {string} text
 * @returns {Map<number, string>} line of each setting -> its section
 */
export function settingSections(text) {
  const out = new Map();
  let section = "";
  const settings = new Set(parseSettings(text).map((field) => field.line));
  lines(text).forEach((raw, index) => {
    const header = raw.trim().match(SECTION);
    if (header) section = readableSection(header[1]);
    else if (settings.has(index)) out.set(index, section);
  });
  return out;
}

/** @param {string} title */
function readableSection(title) {
  const words = title.split(/\s+/).map((word) => (/^[^a-z]*[A-Z]{2,}[^a-z]*$/.test(word) ? word.toLowerCase() : word));
  return words.join(" ").replace(/^[a-z]/, (c) => c.toUpperCase());
}

/**
 * The "{name}  what it means" list in a file's header, for the placeholder help.
 * Two can share a line ("{players} names...   {count} how many"); deeper indented lines continue the one above.
 * @param {string} text
 * @returns {{ name: string; text: string }[]}
 */
export function parsePlaceholders(text) {
  const out = [];
  let last = -2;
  // Only the comment block at the top of the file: later comments mention placeholders in passing.
  const header = lines(text);
  const end = header.findIndex((raw) => raw.trim() && !raw.trim().startsWith("#"));
  header.slice(0, end < 0 ? header.length : end).forEach((raw, index) => {
    const line = raw.trimEnd();
    const entry = line.match(/^#\s{2,4}(\{\w+\}|\\n)\s+(\S.*)$/);
    if (entry) {
      for (const part of `${entry[1]} ${entry[2]}`.split(/\s{3,}(?=\{\w+\})/)) {
        const [, name, rest] = part.match(/^(\S+)\s+(.*)$/) ?? [];
        if (name) out.push({ name, text: rest.trim() });
      }
      last = index;
      return;
    }
    const more = line.match(/^#\s{6,}(\S.*)$/);
    if (more && last === index - 1 && out.length) {
      out[out.length - 1].text += ` ${more[1].trim()}`;
      last = index;
    }
  });
  return out;
}

/**
 * Blood Moon Sound reminders: "Reminder = <days before> <hour> | <message>" lines.
 * Commented example lines are left alone.
 * @param {string} text
 * @param {string} key
 * @returns {{ days: string; hour: string; message: string }[]}
 */
export function parseReminders(text, key = "Reminder") {
  return parseSettings(text)
    .filter((field) => field.key === key && !field.commented && !/^none$/i.test(field.value))
    .map((field) => {
      const bar = field.value.indexOf("|");
      const when = (bar >= 0 ? field.value.slice(0, bar) : field.value).trim().split(/\s+/);
      return { days: when[0] ?? "", hour: when[1] ?? "", message: bar >= 0 ? field.value.slice(bar + 1).trim() : "" };
    });
}

/**
 * Writes the reminder list where the file's first reminder was, one line each.
 * No reminders at all writes "Reminder=none" (an empty list would bring back the mod's two standard ones).
 * @param {string} text Usually renderSettings' output.
 * @param {{ days: string | number; hour: string | number; message: string }[]} reminders
 * @param {string} key
 */
export function renderReminders(text, reminders, key = "Reminder") {
  const own = parseSettings(text).filter((field) => field.key === key && !field.commented);
  const clean = (value) => String(value ?? "").replace(/[\r\n]+/g, " ").trim();
  const written = reminders
    .map((reminder) => ({ days: clean(reminder.days), hour: clean(reminder.hour), message: clean(reminder.message) }))
    .filter((reminder) => /^\d+$/.test(reminder.days) && /^\d+$/.test(reminder.hour))
    .map((reminder) => `${key} = ${reminder.days} ${reminder.hour}${reminder.message ? ` | ${reminder.message}` : ""}`);
  const block = written.length ? written : [`${key}=none`];
  const source = lines(text);
  if (!own.length) return [...source, ...block].join("\r\n");
  const drop = new Set(own.map((field) => field.line));
  const out = [];
  source.forEach((raw, index) => {
    if (index === own[0].line) out.push(...block);
    else if (!drop.has(index)) out.push(raw);
  });
  return out.join("\r\n");
}

/**
 * The check the 7 Days mods make before posting: https and an /api/webhooks/ path.
 * The stricter pattern catches a pasted channel link or a cut-off URL before the file is made.
 * @param {string} url
 * @returns {"empty" | "ok" | "bad"}
 */
export function checkWebhook(url) {
  const value = String(url ?? "").trim();
  if (!value) return "empty";
  return /^https:\/\/(?:[a-z0-9-]+\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+\/?(?:\?[\w=&-]*)?$/i.test(value) ? "ok" : "bad";
}

/**
 * A file that is only a webhook URL (Bait's webhook.txt): the shipped comments, minus the
 * "https://discord.com/api/webhooks/..." placeholder, then the URL.
 * @param {string} text
 * @param {string} url
 */
export function renderWebhookFile(text, url) {
  const kept = lines(text).filter((raw) => !/^#\s*https:\/\/\S*\/api\/webhooks\/\.\.\.\s*$/.test(raw.trim()));
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  return [...kept, String(url ?? "").trim(), ""].join("\r\n");
}
