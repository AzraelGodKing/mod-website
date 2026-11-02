// Turns the /api/stats snapshot into the numbers the count lists show. Used at build
// time (so pages ship with real numbers) and in the browser (to refresh them).

/** @param {unknown} value */
export function formatStat(value) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "—";
}

/**
 * @param {any} snapshot  the /api/stats response
 * @param {"game" | "mod"} scope
 * @param {string} key  a game slug, or "game/mod"
 */
export function statValues(snapshot, scope, key) {
  if (scope === "game") return snapshot?.games?.[key] ?? null;
  const mod = snapshot?.mods?.[key];
  if (!mod) return null;
  const thunderstore = mod.thunderstore?.downloads ?? null;
  const nexus = mod.nexus?.downloads ?? null;
  const site = mod.site?.downloads ?? null;
  const parts = [site, thunderstore, nexus].filter((value) => value !== null);
  return {
    site,
    total: parts.length > 0 ? parts.reduce((sum, value) => sum + value, 0) : null,
    steam: mod.steam?.subscriptions ?? null,
    thunderstore,
    nexus,
    nexus_unique: mod.nexus?.unique ?? null,
    combined: thunderstore === null && nexus === null ? null : (thunderstore ?? 0) + (nexus ?? 0),
  };
}

/**
 * The text for one count cell, or "—" when the number is not known.
 *
 * @param {Record<string, number | null> | null} values
 * @param {string} field
 */
export function statText(values, field) {
  if (!values) return "—";
  if (field === "nexus_full") {
    return typeof values.nexus === "number" ? `${formatStat(values.nexus)} (${formatStat(values.nexus_unique)} unique)` : "—";
  }
  return formatStat(values[field]);
}

/**
 * A mod's download total for the list rows: this site's clicks plus Thunderstore and Nexus.
 *
 * @param {any} stats  one entry of snapshot.mods
 */
export function modDownloads(stats) {
  const parts = [stats?.site?.downloads, stats?.thunderstore?.downloads, stats?.nexus?.downloads].filter((value) => typeof value === "number");
  return parts.length > 0 ? parts.reduce((sum, value) => sum + value, 0) : undefined;
}
