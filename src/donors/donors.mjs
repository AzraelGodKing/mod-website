// Supporters for the /donors page. Ko-fi posts each payment to /api/kofi; other
// services can post to their own route later and store rows with their own
// `provider`. Admin can also add someone by hand (provider "manual"), for
// support from before the webhook existed.
//
// Nothing here stores e-mail or shipping details. A supporter who ticked
// "make private" on Ko-fi is counted on the page but never named.

const SCHEMA = `CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT,
  amount TEXT,
  currency TEXT,
  is_public INTEGER NOT NULL DEFAULT 1,
  is_subscription INTEGER NOT NULL DEFAULT 0,
  tier TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  received_at TEXT NOT NULL
)`;

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

export const PROVIDERS = {
  kofi: { label: "Ko-fi", href: "https://ko-fi.com/azraelgodking" },
  manual: { label: "Added by hand", href: null },
};

const NAME_MAX = 80;
const MESSAGE_MAX = 500;

/** @param {unknown} value @param {number} max */
function clip(value, max) {
  const text = String(value ?? "")
    // Control characters (except newlines) have no place on the page.
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Reads Ko-fi's webhook body: a form post whose `data` field is JSON.
 * Returns null when the body is not a Ko-fi payment.
 * @param {string} rawBody  the urlencoded request body
 */
export function parseKofi(rawBody) {
  const data = new URLSearchParams(rawBody).get("data");
  if (!data) return null;
  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const id = String(payload.kofi_transaction_id || payload.message_id || "").trim();
  if (!id) return null;
  const created = new Date(payload.timestamp);
  return {
    token: String(payload.verification_token ?? ""),
    donation: {
      id: `kofi:${id}`,
      provider: "kofi",
      type: clip(payload.type || "Donation", 40),
      name: clip(payload.from_name, NAME_MAX) || "Someone",
      message: clip(payload.message, MESSAGE_MAX) || null,
      amount: payload.amount == null ? null : clip(payload.amount, 20),
      currency: payload.currency ? clip(payload.currency, 8).toUpperCase() : null,
      isPublic: payload.is_public !== false,
      isSubscription: payload.is_subscription_payment === true,
      tier: payload.tier_name ? clip(payload.tier_name, 60) : null,
      createdAt: Number.isNaN(created.getTime()) ? new Date().toISOString() : created.toISOString(),
    },
  };
}

/** Compares two strings without leaking where they differ. */
export async function tokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  const digest = (value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [left, right] = await Promise.all([digest(provided), digest(expected)]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Saves one payment. Ko-fi retries when it does not get a 200, so a repeat of the
 * same transaction is ignored. Returns true when the row is new.
 * @param {D1Database} db
 */
export async function recordDonation(db, donation, now = new Date()) {
  await ensureTable(db);
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO donations
        (id, provider, type, name, message, amount, currency, is_public, is_subscription, tier, hidden, created_at, received_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?12)`,
    )
    .bind(
      donation.id,
      donation.provider,
      donation.type,
      donation.name,
      donation.message,
      donation.amount,
      donation.currency,
      donation.isPublic ? 1 : 0,
      donation.isSubscription ? 1 : 0,
      donation.tier,
      donation.createdAt,
      now.toISOString(),
    )
    .run();
  return (result?.meta?.changes ?? 1) > 0;
}

/**
 * A supporter added from /admin, for someone who gave before the webhook or elsewhere.
 * @param {{ name?: unknown, message?: unknown, date?: unknown, amount?: unknown, currency?: unknown, isPublic?: unknown }} input
 */
export function manualDonation(input) {
  const name = clip(input?.name, NAME_MAX);
  if (!name) return null;
  const date = input?.date ? new Date(String(input.date)) : new Date();
  return {
    id: `manual:${crypto.randomUUID()}`,
    provider: "manual",
    type: "Donation",
    name,
    message: clip(input?.message, MESSAGE_MAX) || null,
    amount: input?.amount ? clip(input.amount, 20) : null,
    currency: input?.currency ? clip(input.currency, 8).toUpperCase() : null,
    isPublic: input?.isPublic !== false,
    isSubscription: false,
    tier: null,
    createdAt: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
  };
}

/** @param {D1Database} db */
async function allRows(db) {
  await ensureTable(db);
  const { results } = await db.prepare(`SELECT * FROM donations ORDER BY created_at DESC`).all();
  return results ?? [];
}

/**
 * What the public page shows: one entry per named supporter (newest support first),
 * with their latest message. Private and hidden rows only add to `anonymous`.
 * Amounts are never part of this.
 * @param {Array<Record<string, any>>} rows  newest first
 */
export function publicSupporters(rows) {
  /** @type {Map<string, any>} */
  const people = new Map();
  let anonymous = 0;
  for (const row of rows) {
    if (!row.is_public || row.hidden) {
      anonymous += 1;
      continue;
    }
    const key = `${row.provider}:${String(row.name).toLowerCase()}`;
    const person = people.get(key);
    if (!person) {
      people.set(key, {
        name: row.name,
        provider: row.provider,
        message: row.message || null,
        first: row.created_at,
        latest: row.created_at,
        times: 1,
        member: !!row.is_subscription,
        tier: row.tier || null,
      });
      continue;
    }
    person.times += 1;
    person.first = row.created_at;
    if (!person.message && row.message) person.message = row.message;
    if (row.is_subscription) person.member = true;
    if (!person.tier && row.tier) person.tier = row.tier;
  }
  // A private supporter is one person per payment here; that can over-count
  // repeat givers, so the page only says "and N more" rather than a head count.
  return { supporters: [...people.values()], anonymous, total: rows.length };
}

/** @param {D1Database} db */
export async function listPublic(db) {
  return publicSupporters(await allRows(db));
}

/** Every row, private ones and amounts included, for /admin. @param {D1Database} db */
export async function listAll(db) {
  return (await allRows(db)).map((row) => ({
    id: row.id,
    provider: row.provider,
    type: row.type,
    name: row.name,
    message: row.message,
    amount: row.amount,
    currency: row.currency,
    isPublic: !!row.is_public,
    isSubscription: !!row.is_subscription,
    tier: row.tier,
    hidden: !!row.hidden,
    createdAt: row.created_at,
  }));
}

/** Hides a row from the public page (or shows it again). @param {D1Database} db */
export async function setHidden(db, id, hidden) {
  await ensureTable(db);
  const result = await db.prepare(`UPDATE donations SET hidden = ?2 WHERE id = ?1`).bind(id, hidden ? 1 : 0).run();
  return (result?.meta?.changes ?? 0) > 0;
}

/** Only hand-added rows can be deleted; webhook rows are hidden instead. @param {D1Database} db */
export async function deleteManual(db, id) {
  if (!String(id).startsWith("manual:")) return false;
  await ensureTable(db);
  const result = await db.prepare(`DELETE FROM donations WHERE id = ?1`).bind(id).run();
  return (result?.meta?.changes ?? 0) > 0;
}
