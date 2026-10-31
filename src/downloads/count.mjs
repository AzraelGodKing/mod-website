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

// Clicks per mod per UTC day, for the admin History tab.
const DAILY_SCHEMA = `CREATE TABLE IF NOT EXISTS site_downloads_daily (
  key TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, day)
)`;

// The store totals (Thunderstore, Nexus, Steam) as they stood at the end of each UTC day.
// The History tab charts the day-to-day gain.
const STORE_SCHEMA = `CREATE TABLE IF NOT EXISTS store_daily (
  key TEXT NOT NULL,
  day TEXT NOT NULL,
  thunderstore INTEGER,
  nexus INTEGER,
  steam INTEGER,
  PRIMARY KEY (key, day)
)`;

/** @type {WeakMap<object, Promise<unknown>>} */
const ready = new WeakMap();

// The tables are created on first use, so a deploy needs no migration step.
function ensureTable(db) {
  let promise = ready.get(db);
  if (!promise) {
    promise = db.batch([db.prepare(SCHEMA), db.prepare(DAILY_SCHEMA), db.prepare(STORE_SCHEMA)]);
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
  await db
    .prepare(
      `INSERT INTO site_downloads_daily (key, day, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key, day) DO UPDATE SET count = count + 1`,
    )
    .bind(key, utcDay(now))
    .run();
}

/** @param {Date} date */
export function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Saves today's store totals for every mod. The hourly refresh calls this, so the
 * row for a day ends up holding that day's last reading.
 *
 * @param {D1Database} db
 * @param {Record<string, any>} mods  the snapshot's mods map
 * @param {Date} [now]
 */
export async function recordStoreDay(db, mods, now = new Date()) {
  await ensureTable(db);
  const day = utcDay(now);
  const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const statements = Object.entries(mods ?? {}).map(([key, stats]) =>
    db
      .prepare(
        `INSERT INTO store_daily (key, day, thunderstore, nexus, steam) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (key, day) DO UPDATE SET
           thunderstore = COALESCE(excluded.thunderstore, thunderstore),
           nexus = COALESCE(excluded.nexus, nexus),
           steam = COALESCE(excluded.steam, steam)`,
      )
      .bind(key, day, num(stats?.thunderstore?.downloads), num(stats?.nexus?.downloads), num(stats?.steam?.subscriptions)),
  );
  if (statements.length) await db.batch(statements);
}

/**
 * Daily site clicks and daily store gains for the last `days` days, per mod.
 * A store gain needs the day before, so the query reads one extra day. A day with
 * no reading for a store has no gain (null), not zero.
 *
 * @param {D1Database} db
 * @param {number} days
 * @param {Date} [now]
 */
export async function downloadHistory(db, days, now = new Date()) {
  await ensureTable(db);
  const span = Math.min(Math.max(Math.trunc(days) || 30, 7), 365);
  const dayList = [];
  for (let back = span - 1; back >= 0; back -= 1) dayList.push(utcDay(new Date(now.getTime() - back * 86400000)));
  const first = dayList[0];
  const before = utcDay(new Date(Date.parse(`${first}T00:00:00Z`) - 86400000));
  const [clicks, stores] = await Promise.all([
    db.prepare("SELECT key, day, count FROM site_downloads_daily WHERE day >= ?1").bind(first).all(),
    db.prepare("SELECT key, day, thunderstore, nexus, steam FROM store_daily WHERE day >= ?1 ORDER BY day").bind(before).all(),
  ]);
  return historySeries(dayList, clicks.results ?? [], stores.results ?? []);
}

/**
 * @param {string[]} dayList
 * @param {{ key: string, day: string, count: number }[]} clickRows
 * @param {{ key: string, day: string, thunderstore: number | null, nexus: number | null, steam: number | null }[]} storeRows
 */
export function historySeries(dayList, clickRows, storeRows) {
  const index = new Map(dayList.map((day, at) => [day, at]));
  /** @type {Record<string, { site: number[], store: (number | null)[] }>} */
  const mods = {};
  const entry = (key) => (mods[key] ??= { site: dayList.map(() => 0), store: dayList.map(() => null) });
  for (const row of clickRows) {
    const at = index.get(String(row.day));
    if (at !== undefined) entry(String(row.key)).site[at] += Number(row.count ?? 0);
  }
  /** @type {Map<string, Record<string, number | null>>} */
  const last = new Map();
  for (const row of storeRows) {
    const key = String(row.key);
    const previous = last.get(key);
    const at = index.get(String(row.day));
    if (previous && at !== undefined) {
      let gain = null;
      for (const store of ["thunderstore", "nexus"]) {
        const now = row[store];
        const then = previous[store];
        if (typeof now === "number" && typeof then === "number") gain = (gain ?? 0) + Math.max(0, now - then);
      }
      entry(key).store[at] = gain;
    }
    last.set(key, { thunderstore: row.thunderstore ?? previous?.thunderstore ?? null, nexus: row.nexus ?? previous?.nexus ?? null });
  }
  return { days: dayList, mods };
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
 * Every (mod, version) row, newest click first, for the admin page.
 *
 * @param {D1Database} db
 * @returns {Promise<{ key: string, version: string, count: number, lastAt: string }[]>}
 */
export async function siteDownloadLog(db) {
  await ensureTable(db);
  const { results } = await db.prepare("SELECT key, version, count, last_at FROM site_downloads ORDER BY last_at DESC").all();
  return (results ?? []).map((row) => ({
    key: String(row.key),
    version: String(row.version),
    count: Number(row.count ?? 0),
    lastAt: String(row.last_at),
  }));
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
