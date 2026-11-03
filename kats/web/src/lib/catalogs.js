// Turns the compact catalog rows (arrays) into named fields. Shared by every page and the global search.

export const rowsOf = {
  items: (r) => ({
    category: r[0],
    name: r[1],
    defName: r[2],
    price: r[3],
    qty: r[4],
    usable: !!r[5],
    equippable: !!r[6],
    wearable: !!r[7],
    mod: r[8],
    enabled: !!r[9],
  }),
  traits: (r) => ({
    name: r[0],
    defName: r[1],
    degree: r[2],
    addPrice: r[3],
    removePrice: r[4],
    canAdd: !!r[5],
    canRemove: !!r[6],
    bypassLimit: !!r[7],
    mod: r[8],
    modActive: !!r[9],
    effects: r[10] || "",
    description: r[11] || "",
  }),
  xenotypes: (r) => ({
    race: r[0],
    raceDef: r[1],
    xenotype: r[2],
    price: r[3],
    xenotypeEnabled: !!r[4],
    raceEnabled: !!r[5],
    modActive: !!r[6],
  }),
  incidents: (r) => ({
    label: r[0],
    defName: r[1],
    category: r[2],
    cost: r[3],
    karma: r[4],
    cap: r[5],
    enabled: !!r[6],
    mod: r[7],
    modActive: !!r[8],
    isRaid: !!r[9],
    isDisease: !!r[10],
    isQuest: !!r[11],
    isWeatherIncident: !!r[12],
    availableForCommands: !!r[13],
  }),
  weather: (r) => ({
    label: r[0],
    defName: r[1],
    cost: r[2],
    karma: r[3],
    cap: r[4],
    enabled: !!r[5],
    mod: r[6],
    modActive: !!r[7],
  }),
  commands: (r) => ({
    key: r[0],
    label: r[1],
    description: r[2],
    permission: r[3],
    cost: r[4],
    cooldown: r[5],
    enabled: !!r[6],
    supportsCost: !!r[7],
    alias: r[8] || "",
  }),
  "addon-commands": (r) => ({ key: r[0], usage: r[1], description: r[2], integration: r[3] }),
  genes: (r) => ({
    label: r[0],
    defName: r[1],
    category: r[2] || "Unknown",
    categoryKey: r[3] || "",
    biostatCpx: r[4] || 0,
    biostatMet: r[5] || 0,
    biostatArc: r[6] || 0,
    marketFactor: r[7] ?? 1,
    fromTemplate: !!r[8],
    mod: r[9],
    description: r[10] || "",
  }),
  backstories: (r) => ({
    title: r[0],
    defName: r[1],
    slot: r[2],
    titleShort: r[3],
    skills: r[4] || "",
    workDisables: r[5] || "",
    categories: r[6] || "",
    shuffleable: !!r[7],
    mod: r[8],
    description: r[9] || "",
  }),
  "isekai-stats": (r) => ({ abbr: r[0], name: r[1], description: r[2] }),
  "isekai-classes": (r) => ({
    label: r[0],
    classKey: r[1],
    description: r[2],
    gimmick: r[3],
    gimmickDescription: r[4],
    nodes: r[5],
    keystones: r[6],
  }),
  "isekai-keystones": (r) => ({
    classLabel: r[0],
    label: r[1],
    nodeId: r[2],
    description: r[3],
    cost: r[4],
    bonuses: r[5],
  }),
};

/** The chat command a viewer would type for a row, or "" when there is no single command. */
export const chatCommand = {
  items: (row) => (row.enabled ? `!buy ${row.name}` : ""),
  traits: (row) => (row.canAdd ? `!addtrait ${row.name}` : `!trait ${row.name}`),
  xenotypes: (row) => `!xenotypes ${row.race}`,
  incidents: (row) => (row.enabled ? `!event ${row.label}` : ""),
  weather: (row) => (row.enabled ? `!weather ${row.label}` : ""),
  commands: (row) => (row.enabled ? `!${row.key}` : ""),
  "addon-commands": (row) => row.usage,
};

export const DEFAULT_GENE_RATES = { complexity: 100, metabolism: 250, archite: 1000 };

export function geneCost(gene, rates = DEFAULT_GENE_RATES) {
  return (
    Math.abs(gene.biostatCpx) * rates.complexity +
    Math.abs(gene.biostatMet) * rates.metabolism +
    Math.abs(gene.biostatArc) * rates.archite
  );
}

/** Where each catalog lives on the site, and how to link to a search for one entry. */
export const CATALOG_PAGES = {
  items: { title: "Store", link: (q) => ({ path: "/", query: { q, purchasable: "0" } }) },
  traits: { title: "Traits", link: (q) => ({ path: "/traits", query: { q } }) },
  xenotypes: { title: "Xenotypes", link: (q) => ({ path: "/traits", query: { tab: "xenotypes", xq: q, enabled: "0" } }) },
  incidents: { title: "Events", link: (q) => ({ path: "/events", query: { q, enabled: "0" } }) },
  weather: { title: "Weather", link: (q) => ({ path: "/events", query: { tab: "weather", wq: q, wenabled: "0" } }) },
  commands: { title: "Commands", link: (q) => ({ path: "/commands", query: { q: q.replace(/^!/, ""), enabled: "0" } }) },
  "addon-commands": { title: "Addon commands", link: (q) => ({ path: "/commands", query: { tab: "addon", aq: q } }) },
  genes: { title: "Genes", link: (q) => ({ path: "/genes", query: { q } }) },
  backstories: { title: "Backstories", link: (q) => ({ path: "/backstories", query: { q, shuffleable: "0" } }) },
  "isekai-classes": { title: "Isekai classes", link: (q) => ({ path: "/isekai", query: { tab: "classes", cq: q } }) },
  "isekai-keystones": { title: "Isekai constellations", link: (q) => ({ path: "/isekai", query: { tab: "keystones", kq: q } }) },
};

/** What the global search matches and shows for each catalog. */
export const SEARCH_FIELDS = {
  items: { label: (r) => r.name, detail: (r) => `${r.category} · ${r.price.toLocaleString()} coins`, text: (r) => [r.name, r.defName] },
  traits: { label: (r) => r.name, detail: (r) => `add ${r.addPrice.toLocaleString()} · remove ${r.removePrice.toLocaleString()}`, text: (r) => [r.name, r.defName, r.effects] },
  xenotypes: { label: (r) => r.xenotype, detail: (r) => `${r.race} · ${r.price.toLocaleString()} coins`, text: (r) => [r.xenotype, r.race] },
  incidents: { label: (r) => r.label, detail: (r) => `${r.category} · ${r.cost.toLocaleString()} coins`, text: (r) => [r.label, r.defName] },
  weather: { label: (r) => r.label, detail: (r) => `${r.cost.toLocaleString()} coins`, text: (r) => [r.label, r.defName] },
  commands: { label: (r) => `!${r.key}`, detail: (r) => r.description, text: (r) => [r.key, r.label, r.alias, r.description] },
  "addon-commands": { label: (r) => r.usage, detail: (r) => r.description, text: (r) => [r.usage, r.description] },
  genes: { label: (r) => r.label, detail: (r) => r.category, text: (r) => [r.label, r.defName] },
  backstories: { label: (r) => r.title, detail: (r) => r.slot, text: (r) => [r.title, r.titleShort, r.defName] },
  "isekai-classes": { label: (r) => r.label, detail: (r) => r.gimmick, text: (r) => [r.label, r.gimmick] },
  "isekai-keystones": { label: (r) => r.label, detail: (r) => r.classLabel, text: (r) => [r.label, r.nodeId] },
};

export function searchCatalog(name, rows, term, limit = 8) {
  const fields = SEARCH_FIELDS[name];
  const needle = term.trim().toLowerCase();
  if (!fields || needle.length < 2) return { total: 0, hits: [] };
  const scored = [];
  for (const row of rows) {
    const label = String(fields.label(row) ?? "");
    const lower = label.toLowerCase();
    let score = -1;
    if (lower === needle) score = 0;
    else if (lower.startsWith(needle)) score = 1;
    else if (lower.includes(needle)) score = 2;
    else if (fields.text(row).some((part) => String(part ?? "").toLowerCase().includes(needle))) score = 3;
    if (score >= 0) scored.push({ score, label, detail: fields.detail(row), row });
  }
  scored.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
  return { total: scored.length, hits: scored.slice(0, limit) };
}
