// Changelogs, game versions and required mods, read from the mod repos at build
// time. Each repo writes its notes differently, so each has its own reader:
//
// - mod.json `changelog` (any game): [{ version, date?, notes: string[] }]
// - CHANGELOG.md / changelog.md next to mod.json (any game)
// - RimWorld: site/src/data/changelogs/<slug>.md, and About/About.xml for versions and dependencies
// - Sun Haven: the root CHANGELOG.md, docs/versions.json, and thunderstore/manifest.json
// - 7 Days to Die: the **Changelog** list under each mod's README section, and the README's "builds against" line
//
// Notes are kept as short Markdown strings. renderInline() turns one into safe HTML.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { compareVersions } from "../src/downloads/latest.mjs";

// How many versions a mod page lists.
export const CHANGELOG_LIMIT = 8;

const VERSION = /\d+(?:\.\d+)+/;

export function normName(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .replace(/^(sunhaven|azrael)/, "");
}

function readText(file) {
  return existsSync(file) ? readFileSync(file, "utf8").replace(/^﻿/, "") : null;
}

/**
 * Bullet lists under version headings: "## [1.2.0]", "## Version 1.2.0", "## 1.2.0 - 2026-10-01".
 * "### Fixed" style subheadings become a prefix on their bullets. Paragraphs are skipped.
 *
 * @param {string} text
 * @returns {{ version: string, date?: string, notes: string[] }[]}
 */
export function parseVersionedMarkdown(text) {
  const entries = [];
  let current = null;
  let group = "";
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const heading = raw.match(/^##\s+(.*)$/);
    if (heading) {
      const version = heading[1].match(VERSION);
      current = version ? { version: version[0], notes: [] } : null;
      const date = heading[1].match(/\d{4}-\d{2}-\d{2}/);
      if (current && date) current.date = date[0];
      if (current) entries.push(current);
      group = "";
      continue;
    }
    if (!current) continue;
    const sub = raw.match(/^###+\s+(.*)$/);
    if (sub) {
      group = sub[1].trim();
      continue;
    }
    const bullet = raw.match(/^\s{0,1}[-*]\s+(.*)$/);
    if (bullet) {
      const note = bullet[1].trim();
      current.notes.push(group && !note.startsWith("**") ? `**${group}:** ${note}` : note);
      continue;
    }
    // A wrapped bullet continues on an indented line.
    if (/^\s{2,}\S/.test(raw) && current.notes.length > 0) {
      current.notes[current.notes.length - 1] += ` ${raw.trim()}`;
    }
  }
  return entries.filter((entry) => entry.notes.length > 0);
}

/**
 * The 7d2d_mods README: one "## <Mod name>" section per mod with a **Changelog** list of
 * "- 1.2.0: what changed" lines, a table whose "Install on" or "Type" cell can say
 * "needs <mod>", and a "builds against **V3.4**" line for the game version.
 *
 * @param {string} text
 */
export function parseSevendaysReadme(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const gameVersion = String(text ?? "").match(/builds against \*\*(V?[\d.]+)\*\*/i)?.[1] ?? null;
  /** @type {Record<string, { version: string, notes: string[] }[]>} */
  const changelogs = {};
  /** @type {Record<string, string[]>} */
  const requires = {};

  for (const line of lines) {
    const row = line.match(/^\|\s*\[([^\]]+)\]\([^)]*\)\s*\|(.*)\|\s*$/);
    if (!row) continue;
    const needs = [...row[2].matchAll(/needs ([A-Z][\w' ]+?)(?= on the server|\)|,|\||$)/g)].map((match) => match[1].trim());
    if (needs.length) requires[normName(row[1])] = needs;
  }

  let section = null;
  let inLog = false;
  let entry = null;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      section = normName(heading[1]);
      inLog = false;
      entry = null;
      continue;
    }
    if (!section) continue;
    if (/^\*\*Changelog\*\*/i.test(line.trim())) {
      inLog = true;
      changelogs[section] = [];
      continue;
    }
    if (!inLog) continue;
    const item = line.match(/^[-*]\s+(\d+(?:\.\d+)+):\s*(.*)$/);
    if (item) {
      entry = { version: item[1], notes: [item[2].trim()] };
      changelogs[section].push(entry);
    } else if (/^\s{2,}\S/.test(line) && entry) {
      entry.notes[entry.notes.length - 1] += ` ${line.trim()}`;
    } else if (line.trim() !== "") {
      inLog = false;
    }
  }
  // Sections without a **Changelog** list can still note releases inline:
  // "- **1.12.1:** fix ..." or "**1.9.0:** ... **1.8.0:** ..." in one paragraph.
  section = null;
  /** @type {Record<string, { version: string, notes: string[] }[]>} */
  const inline = {};
  for (const line of lines) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      section = normName(heading[1]);
      continue;
    }
    if (!section || changelogs[section]) continue;
    const text = line.replace(/^\s*[-*]\s+/, "");
    const parts = text.split(/\*\*(\d+(?:\.\d+)+):\*\*/);
    if (parts.length < 3 || parts[0].trim() !== "") continue;
    for (let at = 1; at + 1 < parts.length; at += 2) {
      const note = parts[at + 1].trim();
      if (note) (inline[section] ??= []).push({ version: parts[at], notes: [note] });
    }
  }
  for (const [key, entries] of Object.entries(inline)) changelogs[key] = entries;
  return { gameVersion, changelogs, requires };
}

// "**The Vault (4.2.2 → 4.3.0)** — AZR-242" or "**Maintenance releases: The Vault 4.3.1, Crop Optimizer 2.3.1**".
function releaseHeader(line, mods) {
  const bold = line.match(/^\*\*(.+?)\*\*/);
  if (!bold) return null;
  const inner = bold[1];
  const single = inner.match(/^(.+?)\s*\((?:[\d.]+\s*(?:→|->)\s*)?(\d+(?:\.\d+)+)\)$/);
  if (single) {
    const key = normName(single[1]);
    return mods.has(key) ? [{ key, version: single[2] }] : null;
  }
  const listed = [...inner.matchAll(/([A-Z][\w' ]+?)\s+(\d+(?:\.\d+)+)/g)]
    .map((match) => ({ key: normName(match[1].replace(/^.*:\s*/, "")), version: match[2] }))
    .filter((entry) => mods.has(entry.key));
  return listed.length ? listed : null;
}

/**
 * The SunhavenMod root CHANGELOG.md, grouped under "## <date>" headings. A bold header names
 * the mods and versions; the bullets under it are the notes. A bullet labelled with another
 * mod's name ("- **Crop Optimizer:** ...") is only kept for that mod.
 *
 * @param {string} text
 * @param {string[]} names  every Sun Haven mod name (and aliases)
 * @returns {Record<string, { version: string, date?: string, notes: string[] }[]>}
 */
export function parseSunhavenChangelog(text, names) {
  const mods = new Set(names.map(normName));
  /** @type {Record<string, { version: string, date?: string, notes: string[] }[]>} */
  const found = {};
  let date;
  let targets = null;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const day = line.match(/^##\s+(.*)$/);
    if (day) {
      date = day[1].match(/\d{4}-\d{2}-\d{2}/)?.[0];
      targets = null;
      continue;
    }
    if (line.startsWith("**")) {
      const header = releaseHeader(line, mods);
      targets = header
        ? header.map(({ key, version }) => {
            const list = (found[key] ??= []);
            let entry = list.find((existing) => existing.version === version);
            if (!entry) {
              entry = { version, ...(date ? { date } : {}), notes: [] };
              list.push(entry);
            }
            return { key, entry };
          })
        : null;
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (!bullet || !targets) continue;
    const note = bullet[1].trim();
    const label = note.match(/^\*\*(.+?):\*\*/)?.[1];
    const labelKey = label ? normName(label) : null;
    for (const { key, entry } of targets) {
      if (labelKey && mods.has(labelKey) && labelKey !== key) continue;
      entry.notes.push(labelKey === key ? note.replace(/^\*\*.+?:\*\*\s*/, "") : note);
    }
  }
  for (const key of Object.keys(found)) found[key] = found[key].filter((entry) => entry.notes.length > 0);
  return found;
}

/** RimWorld About.xml: supported game versions and required mods. */
export function parseRimworldAbout(xml) {
  const text = String(xml ?? "");
  const block = (tag) => text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "";
  const versions = [...block("supportedVersions").matchAll(/<li>\s*([\d.]+)\s*<\/li>/g)].map((match) => match[1]);
  const requires = [...block("modDependencies").matchAll(/<displayName>([^<]+)<\/displayName>/g)].map((match) => match[1].trim());
  return { versions, requires };
}

/** Thunderstore manifest dependencies, "Owner-Name-1.2.3", as display names. BepInEx is the loader every mod needs. */
export function thunderstoreRequires(manifest) {
  return (manifest?.dependencies ?? [])
    .map((dep) => {
      const parts = String(dep).split("-");
      if (parts.length < 3) return null;
      const name = parts.slice(1, -1).join("-");
      if (/^BepInExPack/i.test(name)) return `BepInEx ${parts.at(-1).split(".").slice(0, 2).join(".")}`;
      return name.replace(/([a-z])([A-Z])/g, "$1 $2");
    })
    .filter(Boolean);
}

// Newest first, one entry per version, nothing newer than the version the site serves
// (a changelog can already hold notes for an unreleased version).
export function trimLog(entries, current) {
  if (!entries?.length) return undefined;
  const seen = new Set();
  const list = entries
    .filter((entry) => entry?.version && Array.isArray(entry.notes) && entry.notes.length > 0)
    .filter((entry) => !current || compareVersions(entry.version, current) <= 0)
    .filter((entry) => (seen.has(entry.version) ? false : seen.add(entry.version)))
    .sort((a, b) => compareVersions(b.version, a.version));
  if (list.length === 0) return undefined;
  return list
    .slice(0, CHANGELOG_LIMIT)
    .map((entry) => ({ version: String(entry.version), ...(entry.date ? { date: String(entry.date) } : {}), notes: entry.notes.map(String) }));
}

/**
 * Reads everything one repo offers and returns a function that fills in
 * `changelog`, `gameVersions` and `requires` for a mod from that repo.
 *
 * @param {string} root  the repo checkout
 * @param {string} game
 */
export function releaseNotesReader(root, game) {
  const readme = game === "7-days-to-die" ? parseSevendaysReadme(readText(path.join(root, "README.md"))) : null;
  let sunhaven = null;
  let sunhavenVersions = null;
  if (game === "sun-haven") {
    const versions = JSON.parse(readText(path.join(root, "docs", "versions.json")) ?? "{}");
    sunhavenVersions = Object.values(versions);
    sunhaven = (names) => parseSunhavenChangelog(readText(path.join(root, "CHANGELOG.md")), names);
  }

  return (mods) => {
    const sunhavenLogs = sunhaven
      ? sunhaven(mods.flatMap((entry) => [entry.mod.name, path.basename(entry.dir), ...(sunhavenVersions ?? []).map((v) => v.name)]))
      : {};
    return mods.map(({ mod, dir }) => {
      const keys = [normName(mod.name), normName(path.basename(dir)), normName(mod.slug)];
      // Every source is read and merged; an earlier source wins for a version both list.
      const sources = [mod.changelog ?? [], parseVersionedMarkdown(readText(path.join(dir, "CHANGELOG.md")) ?? readText(path.join(dir, "changelog.md")))];
      let gameVersions = Array.isArray(mod.gameVersions) ? mod.gameVersions.map(String) : undefined;
      let requires = Array.isArray(mod.requires) ? mod.requires.map(String) : undefined;

      if (game === "rimworld") {
        sources.push(parseVersionedMarkdown(readText(path.join(root, "site", "src", "data", "changelogs", `${mod.slug}.md`))));
        const about = parseRimworldAbout(readText(path.join(dir, "About", "About.xml")));
        gameVersions ??= about.versions.length ? about.versions : undefined;
        requires ??= about.requires.length ? about.requires : undefined;
      }
      if (game === "sun-haven") {
        const key = keys.find((candidate) => sunhavenLogs[candidate]?.length);
        sources.push(key ? sunhavenLogs[key] : []);
        const current = sunhavenVersions?.find((entry) => keys.includes(normName(entry.name)) || entry.thunderstoreName === path.basename(dir));
        if (current?.changelog && current.version) sources.push([{ version: current.version, notes: [current.changelog] }]);
        const manifest = readText(path.join(dir, "thunderstore", "manifest.json"));
        const deps = manifest ? thunderstoreRequires(JSON.parse(manifest)) : [];
        requires ??= deps.length ? deps : undefined;
      }
      if (readme) {
        const key = keys.find((candidate) => readme.changelogs[candidate]?.length);
        sources.push(key ? readme.changelogs[key] : []);
        const needs = keys.map((candidate) => readme.requires[candidate]).find(Boolean);
        requires ??= needs;
        gameVersions ??= readme.gameVersion ? [readme.gameVersion] : undefined;
      }

      const changelog = trimLog(sources.flat(), mod.version);
      return {
        ...mod,
        ...(changelog ? { changelog } : {}),
        ...(gameVersions?.length ? { gameVersions } : {}),
        ...(requires?.length ? { requires } : {}),
      };
    });
  };
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * One line of Markdown to HTML: **bold**, *italic*, `code` and [links](https://...).
 * Everything is escaped first, so a note cannot inject markup. Only http(s) links survive.
 */
export function renderInline(text) {
  const codes = [];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  html = html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)]}</code>`);
}

/** Markdown reduced to plain text, for the RSS feed and Discord. */
export function plainText(text) {
  return String(text)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
