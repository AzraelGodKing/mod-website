const STEAM_DETAILS = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
const THUNDERSTORE_SUN_HAVEN = "https://thunderstore.io/c/sun-haven/api/v1/package/";
const NEXUS_API = "https://api.nexusmods.com/v1/games";

/**
 * @typedef {{ steam: string | null, thunderstore: string | null, nexus: string | null }} ModLinks
 * @typedef {{ slug: string, game: string, links: ModLinks }} CatalogMod
 * @typedef {{
 *   key: string,
 *   game: string,
 *   steamId: string | null,
 *   thunderstore: { owner: string, name: string } | null,
 *   nexus: { game: string, id: number } | null,
 * }} RosterMod
 * @typedef {{ subscriptions: number }} SteamStats
 * @typedef {{ downloads: number }} ThunderstoreStats
 * @typedef {{ downloads: number, unique: number }} NexusStats
 * @typedef {{ steam: SteamStats | null, thunderstore: ThunderstoreStats | null, nexus: NexusStats | null }} ModStats
 * @typedef {{
 *   steam: number | null,
 *   thunderstore: number | null,
 *   nexus: number | null,
 *   nexus_unique: number | null,
 *   combined: number | null,
 * }} GameStats
 * @typedef {{ lastFetched: string, mods: Record<string, ModStats>, games: Record<string, GameStats> }} Snapshot
 */

/** @param {string | null} url */
export function steamIdFrom(url) {
  if (!url) return null;
  const match = url.match(/[?&]id=(\d+)/);
  return match ? match[1] : null;
}

/** @param {string | null} url */
export function thunderstoreFrom(url) {
  if (!url) return null;
  const match = url.match(/\/p\/([^/]+)\/([^/?#]+)/);
  return match ? { owner: match[1], name: match[2] } : null;
}

/** @param {string | null} url */
export function nexusFrom(url) {
  if (!url) return null;
  const match = url.match(/nexusmods\.com\/([^/]+)\/mods\/(\d+)/);
  return match ? { game: match[1], id: Number(match[2]) } : null;
}

/**
 * @param {CatalogMod[]} mods
 * @returns {RosterMod[]}
 */
export function rosterFromCatalog(mods) {
  return mods.map((mod) => ({
    key: `${mod.game}/${mod.slug}`,
    game: mod.game,
    steamId: steamIdFrom(mod.links.steam),
    thunderstore: thunderstoreFrom(mod.links.thunderstore),
    nexus: nexusFrom(mod.links.nexus),
  }));
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {string[]} ids
 * @returns {Promise<Map<string, SteamStats>>}
 */
async function fetchSteam(fetchImpl, ids) {
  const body = new URLSearchParams({ itemcount: String(ids.length) });
  ids.forEach((id, index) => body.set(`publishedfileids[${index}]`, id));
  const res = await fetchImpl(STEAM_DETAILS, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Steam returned ${res.status}`);
  const payload = await res.json();
  const found = new Map();
  for (const item of payload?.response?.publishedfiledetails ?? []) {
    if (item?.result !== 1 || !item.publishedfileid) continue;
    found.set(String(item.publishedfileid), { subscriptions: Number(item.lifetime_subscriptions ?? 0) });
  }
  return found;
}

/**
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<Map<string, ThunderstoreStats>>}
 */
async function fetchThunderstore(fetchImpl) {
  const res = await fetchImpl(THUNDERSTORE_SUN_HAVEN);
  if (!res.ok) throw new Error(`Thunderstore returned ${res.status}`);
  const packages = await res.json();
  if (!Array.isArray(packages)) throw new Error("Thunderstore package list is not an array");
  const found = new Map();
  for (const pkg of packages) {
    if (!pkg?.owner || !pkg?.name) continue;
    let downloads = 0;
    for (const version of pkg.versions ?? []) downloads += Number(version?.downloads ?? 0);
    found.set(`${pkg.owner}/${pkg.name}`, { downloads });
  }
  return found;
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {{ game: string, id: number }} nexus
 * @param {string} apiKey
 * @returns {Promise<NexusStats>}
 */
async function fetchNexus(fetchImpl, nexus, apiKey) {
  const url = `${NEXUS_API}/${encodeURIComponent(nexus.game)}/mods/${nexus.id}.json`;
  const res = await fetchImpl(url, {
    headers: {
      apikey: apiKey,
      accept: "application/json",
      "application-name": "azraelsmods.com",
      "application-version": "1.0.0",
    },
  });
  if (!res.ok) throw new Error(`Nexus returned ${res.status} for ${nexus.game}/${nexus.id}`);
  const payload = await res.json();
  return {
    downloads: Number(payload?.mod_downloads ?? 0),
    unique: Number(payload?.mod_unique_downloads ?? 0),
  };
}

/**
 * @param {(number | null | undefined)[]} values
 * @returns {number | null}
 */
function sum(values) {
  const present = values.filter((value) => typeof value === "number");
  return present.length > 0 ? present.reduce((total, value) => total + value, 0) : null;
}

/**
 * @param {RosterMod[]} roster
 * @param {Record<string, ModStats>} mods
 * @returns {Record<string, GameStats>}
 */
export function gameTotals(roster, mods) {
  /** @type {Record<string, GameStats>} */
  const games = {};
  const gameSlugs = [...new Set(roster.map((mod) => mod.game))];
  for (const game of gameSlugs) {
    const entries = roster.filter((mod) => mod.game === game).map((mod) => mods[mod.key]);
    const thunderstore = sum(entries.map((entry) => entry?.thunderstore?.downloads));
    const nexus = sum(entries.map((entry) => entry?.nexus?.downloads));
    games[game] = {
      steam: sum(entries.map((entry) => entry?.steam?.subscriptions)),
      thunderstore,
      nexus,
      nexus_unique: sum(entries.map((entry) => entry?.nexus?.unique)),
      combined: sum([thunderstore, nexus]),
    };
  }
  return games;
}

/**
 * Fetches every store once. A platform that fails keeps the numbers from `previous`.
 *
 * @param {RosterMod[]} roster
 * @param {{ fetch: typeof fetch, nexusKey?: string, previous?: Snapshot | null, now?: Date, log?: (message: string) => void }} options
 * @returns {Promise<Snapshot>}
 */
export async function collectStats(roster, options) {
  const { fetch: fetchImpl, nexusKey, previous, now = new Date(), log = () => {} } = options;
  const before = previous?.mods ?? {};

  const steamIds = roster.map((mod) => mod.steamId).filter((id) => id !== null);
  const wantsThunderstore = roster.some((mod) => mod.thunderstore);

  const [steamResult, thunderstoreResult] = await Promise.allSettled([
    steamIds.length > 0 ? fetchSteam(fetchImpl, steamIds) : Promise.resolve(new Map()),
    wantsThunderstore ? fetchThunderstore(fetchImpl) : Promise.resolve(new Map()),
  ]);
  if (steamResult.status === "rejected") log(`Steam failed, keeping cached counts: ${steamResult.reason}`);
  if (thunderstoreResult.status === "rejected") {
    log(`Thunderstore failed, keeping cached counts: ${thunderstoreResult.reason}`);
  }
  if (!nexusKey && roster.some((mod) => mod.nexus)) log("NEXUSMODS_API_KEY is not set, keeping cached Nexus counts.");

  const nexusResults = await Promise.allSettled(
    roster.map((mod) => (mod.nexus && nexusKey ? fetchNexus(fetchImpl, mod.nexus, nexusKey) : Promise.resolve(null))),
  );

  /** @type {Record<string, ModStats>} */
  const mods = {};
  roster.forEach((mod, index) => {
    const old = before[mod.key];

    let steam = null;
    if (mod.steamId) {
      const fresh = steamResult.status === "fulfilled" ? steamResult.value.get(mod.steamId) : undefined;
      steam = fresh ?? old?.steam ?? null;
    }

    let thunderstore = null;
    if (mod.thunderstore) {
      const key = `${mod.thunderstore.owner}/${mod.thunderstore.name}`;
      const fresh = thunderstoreResult.status === "fulfilled" ? thunderstoreResult.value.get(key) : undefined;
      thunderstore = fresh ?? old?.thunderstore ?? null;
    }

    let nexus = null;
    if (mod.nexus) {
      const result = nexusResults[index];
      if (result.status === "rejected") log(`Nexus failed for ${mod.key}, keeping cached count: ${result.reason}`);
      const fresh = result.status === "fulfilled" ? result.value : null;
      nexus = fresh ?? old?.nexus ?? null;
    }

    mods[mod.key] = { steam, thunderstore, nexus };
  });

  return { lastFetched: now.toISOString(), mods, games: gameTotals(roster, mods) };
}
