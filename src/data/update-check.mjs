// 7 Days to Die update checker: reads what is in a player's Mods folder (ModInfo.xml
// files, or a pasted list) and compares Azrael's mods in it with the newest versions.
import { compareVersions } from "../downloads/latest.mjs";

const norm = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The Name, DisplayName and Version of one ModInfo.xml.
 * @param {string} xml
 * @returns {{ name: string, displayName: string, version: string } | null}
 */
export function parseModInfo(xml) {
  const read = (tag) => String(xml ?? "").match(new RegExp(`<${tag}\\s+value="([^"]*)"`, "i"))?.[1]?.trim() ?? "";
  const name = read("Name");
  const displayName = read("DisplayName");
  if (!name && !displayName) return null;
  return { name, displayName, version: read("Version") };
}

/**
 * A pasted list, one mod per line: "AzraelBloodMoonSound 1.4.0", "Blood Moon Sound v1.4",
 * "blood-moon-sound-1.4.0.zip" or just a folder name. Pasted ModInfo.xml text works too.
 * @param {string} text
 * @returns {{ name: string, displayName: string, version: string }[]}
 */
export function parseInstalled(text) {
  const source = String(text ?? "");
  if (/<Name\s+value=/i.test(source) || /<DisplayName\s+value=/i.test(source)) {
    // Several ModInfo.xml files pasted one after another.
    return source
      .split(/(?=<\?xml|<xml>)/i)
      .map(parseModInfo)
      .filter(Boolean);
  }
  return source
    .split(/[\r\n]+/)
    .map((line) => line.trim().replace(/\.zip$/i, ""))
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const match = line.match(/^(.*?)[\s\-_,:|(]*v?(\d+(?:\.\d+){1,3})\)?$/i);
      const name = (match ? match[1] : line).trim();
      return { name, displayName: name, version: match ? match[2] : "" };
    })
    .filter((entry) => entry.name);
}

/**
 * @param {{ name: string, displayName: string, version: string }[]} installed
 * @param {{ slug: string, name: string, folder?: string, version: string }[]} mods  Azrael's 7 Days mods
 * @param {Record<string, string>} [latest]  newest version per slug, when the live list could be read
 */
export function checkUpdates(installed, mods, latest = {}) {
  const byKey = new Map();
  for (const mod of mods) {
    for (const key of [mod.folder, mod.name, mod.slug, `azrael${mod.name}`]) {
      if (key) byKey.set(norm(key), mod);
    }
  }
  const seen = new Set();
  const results = [];
  let others = 0;
  for (const entry of installed) {
    const mod = byKey.get(norm(entry.name)) ?? byKey.get(norm(entry.displayName));
    if (!mod) {
      others += 1;
      continue;
    }
    if (seen.has(mod.slug)) continue;
    seen.add(mod.slug);
    const newest = latest[mod.slug] ?? mod.version;
    const state = !entry.version ? "unknown" : compareVersions(entry.version, newest) < 0 ? "behind" : compareVersions(entry.version, newest) > 0 ? "ahead" : "current";
    results.push({ slug: mod.slug, name: mod.name, have: entry.version, latest: newest, state });
  }
  const order = { behind: 0, unknown: 1, ahead: 2, current: 3 };
  results.sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));
  return { results, others };
}
