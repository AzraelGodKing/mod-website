const CAP_NAMES = {
  "storeitems.json": "items",
  "traits.json": "traits",
  "racesettings.json": "xenotypes",
  "incidents.json": "incidents",
  "weather.json": "weather",
  "commandsettings.json": "commands",
  "genes.json": "genes",
  "backstories.json": "backstories",
};

export function classifyPath(filePath) {
  const parts = String(filePath).replace(/\\/g, "/").split("/").filter(Boolean);
  const lower = parts.map((part) => part.toLowerCase());
  const base = lower[lower.length - 1] ?? "";
  if (lower.includes("backups") || lower.includes("ai_commands") || base === "viewers.json") {
    return { action: "skip", label: parts.join("/") };
  }
  const catalogName = CAP_NAMES[base];
  if (!catalogName) return { action: "ignore", label: parts.join("/") };
  return { action: "use", name: catalogName, label: parts.join("/"), depth: parts.length };
}

function text(value) {
  return value == null ? "" : String(value);
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function flag(value) {
  return value ? 1 : 0;
}

function parseJson(raw) {
  const source = String(raw).replace(/^\uFEFF/, "");
  return JSON.parse(source);
}

function normalizeTraitDescription(desc) {
  let textValue = text(desc).replace(/\r/g, "");
  const replacements = [
    ["{PAWN_nameDef}", "This colonist"],
    ["{PAWN_pronoun}", "they"],
    ["{PAWN_possessive}", "their"],
    ["{PAWN_objective}", "them"],
    ["{PAWN_gender}", ""],
  ];
  for (const [from, to] of replacements) textValue = textValue.replaceAll(from, to);
  textValue = textValue
    .replace(/\bthey is\b/g, "they are")
    .replace(/\bthey has\b/g, "they have")
    .replace(/\bthey learns\b/g, "they learn")
    .replace(/\bthey gets\b/g, "they get")
    .replace(/\bthey enjoys\b/g, "they enjoy")
    .replace(/\bthey never minds\b/g, "they never mind")
    .replace(/\bthey doesn't\b/g, "they don't")
    .replace(/\bthey feels\b/g, "they feel")
    .replace(/\bthey rarely insults\b/g, "they rarely insult")
    .replace(/\bthey also never judges\b/g, "they also never judge")
    .replace(/\. they\b/g, ". They");
  return textValue.trim();
}

function rowsFor(name, data) {
  if (name === "items") {
    const items = data.items ?? {};
    return Object.values(items).map((item) => [
      text(item.Category),
      item.CustomName ? text(item.CustomName) : text(item.DefName),
      text(item.DefName),
      num(item.BasePrice),
      item.QuantityLimit == null ? 0 : num(item.QuantityLimit),
      flag(item.IsUsable),
      flag(item.IsEquippable),
      flag(item.IsWearable),
      text(item.Mod),
      flag(item.Enabled),
    ]);
  }
  if (name === "traits") {
    return Object.values(data).map((trait) => [
      text(trait.Name),
      text(trait.DefName),
      num(trait.Degree),
      num(trait.AddPrice),
      num(trait.RemovePrice),
      Boolean(trait.CanAdd),
      Boolean(trait.CanRemove),
      Boolean(trait.BypassLimit),
      text(trait.ModSource),
      Boolean(trait.modactive),
      (trait.Stats ?? []).map((stat) => text(stat)).join("; "),
      normalizeTraitDescription(trait.Description),
    ]);
  }
  if (name === "xenotypes") {
    const rows = [];
    for (const [raceDef, race] of Object.entries(data)) {
      if (!race.XenotypePrices) continue;
      for (const [xenotype, price] of Object.entries(race.XenotypePrices)) {
        rows.push([
          text(race.DisplayName),
          text(raceDef),
          text(xenotype),
          num(price),
          Boolean(race.EnabledXenotypes?.[xenotype]),
          Boolean(race.Enabled),
          Boolean(race.ModActive),
        ]);
      }
    }
    return rows;
  }
  if (name === "incidents") {
    return Object.values(data).map((incident) => [
      text(incident.Label),
      text(incident.DefName),
      text(incident.CategoryName),
      num(incident.BaseCost),
      text(incident.KarmaType),
      num(incident.EventCap),
      Boolean(incident.Enabled),
      text(incident.ModSource),
      Boolean(incident.modactive),
      Boolean(incident.IsRaidIncident),
      Boolean(incident.IsDiseaseIncident),
      Boolean(incident.IsQuestIncident),
      Boolean(incident.IsWeatherIncident),
      Boolean(incident.IsAvailableForCommands),
    ]);
  }
  if (name === "weather") {
    return Object.values(data).map((weather) => [
      text(weather.Label),
      text(weather.DefName),
      num(weather.BaseCost),
      text(weather.KarmaType),
      num(weather.EventCap),
      Boolean(weather.Enabled),
      text(weather.ModSource),
      Boolean(weather.modactive),
    ]);
  }
  if (name === "commands") {
    return Object.entries(data).map(([key, command]) => [
      text(key),
      text(command.Label),
      text(command.CommandDescription),
      text(command.PermissionLevel),
      num(command.Cost),
      num(command.CooldownSeconds),
      Boolean(command.Enabled),
      Boolean(command.SupportsCost),
      text(command.CommandAlias),
    ]);
  }
  if (name === "genes") {
    const items = data.items ?? data;
    return Object.values(items).map((gene) => [
      text(gene.Label),
      text(gene.DefName),
      gene.DisplayCategoryLabel ? text(gene.DisplayCategoryLabel) : text(gene.DisplayCategory),
      text(gene.DisplayCategory),
      num(gene.BiostatCpx),
      num(gene.BiostatMet),
      num(gene.BiostatArc),
      num(gene.MarketValueFactor),
      Boolean(gene.FromTemplate),
      text(gene.ModSource),
      text(gene.Description),
    ]);
  }
  if (name === "backstories") {
    const items = data.items ?? {};
    return Object.values(items).map((story) => [
      text(story.Title),
      text(story.DefName),
      text(story.Slot),
      text(story.TitleShort),
      text(story.SkillGainsJoined),
      (story.WorkDisables ?? []).filter(Boolean).map((part) => text(part)).join(", "),
      (story.SpawnCategories ?? []).filter(Boolean).map((part) => text(part)).join(", "),
      Boolean(story.Shuffleable),
      text(story.ModSource),
      text(story.Description),
    ]);
  }
  throw new Error(`Unknown catalog ${name}`);
}

export function buildCatalog(entries) {
  const chosen = new Map();
  const skipped = [];
  for (const entry of entries) {
    const kind = classifyPath(entry.path);
    if (kind.action === "skip") {
      skipped.push(kind.label);
      continue;
    }
    if (kind.action !== "use") continue;
    const current = chosen.get(kind.name);
    if (!current || kind.depth < current.depth) chosen.set(kind.name, { ...entry, depth: kind.depth });
  }

  const files = {};
  const counts = {};
  for (const [name, entry] of chosen) {
    const rows = rowsFor(name, parseJson(entry.text));
    files[name] = JSON.stringify(rows);
    counts[name] = rows.length;
  }
  return { files, counts, skipped };
}
