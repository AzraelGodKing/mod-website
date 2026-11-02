// RimWorld mod list checker: reads a ModsConfig.xml (or one package id per line)
// and checks Azrael's mods in it against their About.xml rules.

const KNOWN_NAMES = {
  "brrainz.harmony": "Harmony",
  "ludeon.rimworld": "Core",
  "ludeon.rimworld.royalty": "Royalty",
  "ludeon.rimworld.ideology": "Ideology",
  "ludeon.rimworld.biotech": "Biotech",
  "ludeon.rimworld.anomaly": "Anomaly",
  "ludeon.rimworld.odyssey": "Odyssey",
};

/**
 * Package ids in load order, lowercased, without repeats.
 * @param {string} text ModsConfig.xml, or ids one per line
 */
export function parseModList(text) {
  const source = String(text ?? "");
  const active = source.match(/<activeMods>([\s\S]*?)<\/activeMods>/)?.[1];
  const raw = active !== undefined || /<li>/.test(source)
    ? [...(active ?? source).matchAll(/<li>\s*([^<\s]+)\s*<\/li>/g)].map((match) => match[1])
    : source.split(/[\r\n,]+/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  // A Steam copy shows as "id_steam" in ModsConfig.xml; RimWorld treats it as the same mod.
  const ids = raw.map((id) => id.toLowerCase().replace(/_steam$/, ""));
  return [...new Set(ids)];
}

/**
 * @typedef {{ packageId: string; dependencies: { id: string; name: string }[]; incompatible: string[]; loadAfter: string[]; loadBefore: string[] }} LoadRules
 * @param {string[]} ids Package ids in load order.
 * @param {{ name: string; slug: string; rules: LoadRules }[]} mods Azrael's mods.
 * @returns {{ mod: string; slug: string; problems: { level: "error" | "warn"; text: string }[] }[]}
 */
export function checkLoadOrder(ids, mods) {
  const at = new Map(ids.map((id, index) => [id, index]));
  const names = { ...KNOWN_NAMES };
  for (const mod of mods) {
    names[mod.rules.packageId] = mod.name;
    for (const dep of mod.rules.dependencies) names[dep.id] ??= dep.name;
  }
  const label = (id) => names[id] ?? id;
  const results = [];
  for (const mod of mods) {
    const self = at.get(mod.rules.packageId);
    if (self === undefined) continue;
    const problems = [];
    for (const dep of mod.rules.dependencies) {
      const index = at.get(dep.id);
      if (index === undefined) problems.push({ level: "error", text: `Needs ${dep.name || dep.id}, which is not in the list.` });
      else if (index > self) problems.push({ level: "error", text: `${label(dep.id)} has to load above ${mod.name}.` });
    }
    for (const id of mod.rules.incompatible) {
      if (at.has(id)) problems.push({ level: "error", text: `Does not work with ${label(id)}. Turn one of them off.` });
    }
    for (const id of mod.rules.loadAfter) {
      if (mod.rules.dependencies.some((dep) => dep.id === id)) continue;
      const index = at.get(id);
      if (index !== undefined && index > self) problems.push({ level: "warn", text: `Move ${mod.name} below ${label(id)}.` });
    }
    for (const id of mod.rules.loadBefore) {
      const index = at.get(id);
      if (index !== undefined && index < self) problems.push({ level: "warn", text: `Move ${mod.name} above ${label(id)}.` });
    }
    results.push({ mod: mod.name, slug: mod.slug, problems });
  }
  return results;
}
