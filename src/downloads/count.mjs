// Counts clicks on our own Download buttons. Every button goes through
// /download/<game>/<mod>, so the Worker records the click before redirecting.

const SCHEMA = `CREATE TABLE IF NOT EXISTS site_downloads (
  key TEXT NOT NULL,
  version TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  last_at TEXT NOT NULL,
  PRIMARY KEY (key, version)
)`;

// Link previews and crawlers follow download links too; they are not downloads.
const BOTS = /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|skype|headless|lighthouse/i;

/** @param {string | null} userAgent */
export function isBot(userAgent) {
  return !userAgent || BOTS.test(userAgent);
}

/** @type {WeakMap<object, Promise<unknown>>} */
const ready = new WeakMap();

// The table is created on first use, so a deploy needs no migration step.
function ensureTable(db) {
  let promise = ready.get(db);
  if (!promise) {
    promise = db.prepare(SCHEMA).run();
    promise.catch(() => ready.delete(db));
    ready.set(db, promise);
  }
  return promise;
}

/**
 * @param {D1Database} db
 * @param {string} key  "<game>/<mod>"
 * @param {string} version
 * @param {Date} [now]
 */
export async function recordDownload(db, key, version, now = new Date()) {
  await ensureTable(db);
  await db
    .prepare(
      `INSERT INTO site_downloads (key, version, count, last_at) VALUES (?1, ?2, 1, ?3)
       ON CONFLICT (key, version) DO UPDATE SET count = count + 1, last_at = excluded.last_at`,
    )
    .bind(key, version, now.toISOString())
    .run();
}

/**
 * Total clicks per mod, all versions together.
 *
 * @param {D1Database} db
 * @returns {Promise<Record<string, number>>}
 */
export async function siteCounts(db) {
  await ensureTable(db);
  const { results } = await db.prepare("SELECT key, SUM(count) AS total FROM site_downloads GROUP BY key").all();
  /** @type {Record<string, number>} */
  const counts = {};
  for (const row of results ?? []) counts[String(row.key)] = Number(row.total ?? 0);
  return counts;
}

/**
 * Adds the site counts to a store snapshot. `site` is this site's clicks and
 * `total` is site + Thunderstore + Nexus downloads. Steam is left out of the
 * total because it counts subscribers, not downloads.
 *
 * @template {{ mods: Record<string, any>, games: Record<string, any> }} T
 * @param {T} snapshot
 * @param {{ key: string, game: string }[]} roster
 * @param {Record<string, number> | null} counts  null when the site counter could not be read
 * @returns {T}
 */
export function withSiteCounts(snapshot, roster, counts) {
  const mods = { ...snapshot.mods };
  const games = { ...snapshot.games };
  for (const mod of roster) {
    const stats = mods[mod.key] ?? { steam: null, thunderstore: null, nexus: null };
    const site = counts ? { downloads: counts[mod.key] ?? 0 } : null;
    mods[mod.key] = { ...stats, site };
  }
  for (const game of new Set(roster.map((mod) => mod.game))) {
    const entries = roster.filter((mod) => mod.game === game).map((mod) => mods[mod.key]);
    const site = counts ? entries.reduce((total, entry) => total + (entry.site?.downloads ?? 0), 0) : null;
    const parts = [site, games[game]?.thunderstore ?? null, games[game]?.nexus ?? null].filter((value) => typeof value === "number");
    games[game] = {
      ...games[game],
      site,
      total: parts.length > 0 ? parts.reduce((total, value) => total + value, 0) : null,
    };
  }
  return { ...snapshot, mods, games };
}
