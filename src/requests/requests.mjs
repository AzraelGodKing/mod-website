// The /requests board: visitors suggest a mod or a feature and vote on what others
// suggested. A new request stays off the page until it is approved in /admin, so spam
// never shows. Votes are one per visitor per request; the visitor is a salted hash of
// their address, so no IP is stored.
import { cleanField, hostnameSet, readLimited, turnstileCheck } from "../report/handle.mjs";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS mod_requests (
    id TEXT PRIMARY KEY,
    game TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    votes INTEGER NOT NULL DEFAULT 0,
    voter TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mod_request_votes (
    request_id TEXT NOT NULL,
    voter TEXT NOT NULL,
    PRIMARY KEY (request_id, voter)
  )`,
];

// pending: waiting for approval, admin only. declined: answered, kept off the page.
export const STATUSES = ["pending", "open", "planned", "done", "declined"];
export const PUBLIC_STATUSES = ["open", "planned", "done"];
export const STATUS_LABELS = { pending: "Waiting", open: "Open", planned: "Planned", done: "Done", declined: "Declined" };

const TITLE_MIN = 8;
const TITLE_MAX = 100;
const DETAILS_MAX = 1000;
const NOTE_MAX = 300;
const BODY_MAX = 8192;
// One visitor can have this many requests waiting for approval at a time.
const PENDING_PER_VISITOR = 3;

/** @type {WeakMap<object, Promise<unknown>>} */
const ready = new WeakMap();

function ensureTables(db) {
  let promise = ready.get(db);
  if (!promise) {
    promise = db.batch(SCHEMA.map((sql) => db.prepare(sql)));
    promise.catch(() => ready.delete(db));
    ready.set(db, promise);
  }
  return promise;
}

function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/**
 * A stable id for one visitor that cannot be turned back into their address.
 * @param {Request} request
 * @param {string} salt
 */
export async function voterId(request, salt) {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}`));
  return [...new Uint8Array(bytes)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newId() {
  return [...crypto.getRandomValues(new Uint8Array(6))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicRow(row) {
  return {
    id: String(row.id),
    game: String(row.game),
    title: String(row.title),
    details: String(row.details ?? ""),
    status: String(row.status),
    note: row.note ? String(row.note) : null,
    votes: Number(row.votes ?? 0),
    createdAt: String(row.created_at),
  };
}

/** Approved requests, most votes first. @param {D1Database} db */
export async function listPublic(db) {
  await ensureTables(db);
  const marks = PUBLIC_STATUSES.map((_status, at) => `?${at + 1}`).join(", ");
  const { results } = await db
    .prepare(`SELECT id, game, title, details, status, note, votes, created_at FROM mod_requests WHERE status IN (${marks}) ORDER BY votes DESC, created_at DESC LIMIT 300`)
    .bind(...PUBLIC_STATUSES)
    .all();
  return (results ?? []).map(publicRow);
}

/** Every request, waiting ones first, for the admin page. @param {D1Database} db */
export async function listAll(db) {
  await ensureTables(db);
  const { results } = await db
    .prepare("SELECT id, game, title, details, status, note, votes, created_at FROM mod_requests ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 500")
    .all();
  return (results ?? []).map(publicRow);
}

/**
 * @param {D1Database} db
 * @param {{ game: string, title: string, details: string, voter: string }} input
 * @returns {Promise<{ id: string } | { error: "busy" }>}
 */
export async function createRequest(db, input, now = new Date()) {
  await ensureTables(db);
  const waiting = await db.prepare("SELECT COUNT(*) AS n FROM mod_requests WHERE voter = ?1 AND status = 'pending'").bind(input.voter).first();
  if (Number(waiting?.n ?? 0) >= PENDING_PER_VISITOR) return { error: "busy" };
  const id = newId();
  await db
    .prepare("INSERT INTO mod_requests (id, game, title, details, status, votes, voter, created_at) VALUES (?1, ?2, ?3, ?4, 'pending', 1, ?5, ?6)")
    .bind(id, input.game, input.title, input.details, input.voter, now.toISOString())
    .run();
  // The person who asked counts as its first vote.
  await db.prepare("INSERT OR IGNORE INTO mod_request_votes (request_id, voter) VALUES (?1, ?2)").bind(id, input.voter).run();
  return { id };
}

/**
 * Adds one vote, or takes it back when `on` is false. Returns the new count, or null
 * when the request is not on the public page.
 * @param {D1Database} db
 */
export async function setVote(db, id, voter, on) {
  await ensureTables(db);
  const row = await db.prepare("SELECT status FROM mod_requests WHERE id = ?1").bind(id).first();
  if (!row || !PUBLIC_STATUSES.includes(String(row.status))) return null;
  if (on) await db.prepare("INSERT OR IGNORE INTO mod_request_votes (request_id, voter) VALUES (?1, ?2)").bind(id, voter).run();
  else await db.prepare("DELETE FROM mod_request_votes WHERE request_id = ?1 AND voter = ?2").bind(id, voter).run();
  // Counted from the votes table, so a repeat click can never drift the total.
  await db.prepare("UPDATE mod_requests SET votes = (SELECT COUNT(*) FROM mod_request_votes WHERE request_id = ?1) WHERE id = ?1").bind(id).run();
  const after = await db.prepare("SELECT votes FROM mod_requests WHERE id = ?1").bind(id).first();
  return Number(after?.votes ?? 0);
}

/** The requests this visitor voted for. @param {D1Database} db */
export async function votedBy(db, voter) {
  await ensureTables(db);
  const { results } = await db.prepare("SELECT request_id FROM mod_request_votes WHERE voter = ?1").bind(voter).all();
  return (results ?? []).map((row) => String(row.request_id));
}

/** Admin: set a request's status and the public note under it. @param {D1Database} db */
export async function updateRequest(db, id, change) {
  await ensureTables(db);
  if (!STATUSES.includes(change.status)) return false;
  const note = String(change.note ?? "").trim().slice(0, NOTE_MAX) || null;
  const result = await db.prepare("UPDATE mod_requests SET status = ?2, note = ?3 WHERE id = ?1").bind(id, change.status, note).run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Admin: remove a request and its votes. @param {D1Database} db */
export async function deleteRequest(db, id) {
  await ensureTables(db);
  const result = await db.prepare("DELETE FROM mod_requests WHERE id = ?1").bind(id).run();
  await db.prepare("DELETE FROM mod_request_votes WHERE request_id = ?1").bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * GET /api/requests lists the board (and which ones this visitor voted for).
 * POST /api/requests adds one, behind the same Turnstile check as the report form.
 * POST /api/requests/vote adds or removes this visitor's vote.
 *
 * @param {Request} request
 * @param {{ DOWNLOADS_DB?: D1Database, TURNSTILE_SECRET?: string, TURNSTILE_HOSTNAMES?: string, ADMIN_TOKEN?: string }} env
 * @param {string} pathname
 * @param {string[]} gameSlugs
 * @param {typeof fetch} [fetchImpl]
 */
export async function handleRequests(request, env, pathname, gameSlugs, fetchImpl = fetch) {
  const db = env.DOWNLOADS_DB;
  if (!db) return json(503, { error: "The request board is not set up yet." });
  // Any secret works as the salt; it only has to stay the same and stay private.
  const voter = await voterId(request, env.TURNSTILE_SECRET ?? env.ADMIN_TOKEN ?? "azraels-mods");

  if (pathname === "/api/requests" && (request.method === "GET" || request.method === "HEAD")) {
    const [requests, voted] = await Promise.all([listPublic(db), votedBy(db, voter)]);
    return json(200, { requests, voted });
  }
  if (request.method !== "POST") return json(405, { error: "Use the request page." });

  const hostnames = hostnameSet(env.TURNSTILE_HOSTNAMES);
  let originHost = "";
  try {
    originHost = new URL(request.headers.get("origin") ?? "").hostname;
  } catch {
    return json(403, { error: "Use the request page." });
  }
  if (!hostnames.has(originHost)) return json(403, { error: "Use the request page." });

  const bytes = await readLimited(request, BODY_MAX);
  if (!bytes) return json(413, { error: "That is too long." });
  /** @type {Record<string, unknown>} */
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("shape");
  } catch {
    return json(400, { error: "Use the request page." });
  }

  if (pathname === "/api/requests/vote") {
    const id = String(payload.id ?? "");
    if (!/^[0-9a-f]{12}$/.test(id)) return json(400, { error: "That request no longer exists." });
    const votes = await setVote(db, id, voter, payload.on !== false);
    return votes === null ? json(404, { error: "That request no longer exists." }) : json(200, { ok: true, votes, voted: payload.on !== false });
  }
  if (pathname !== "/api/requests") return json(404, { error: "Not found." });

  if (!env.TURNSTILE_SECRET) return json(503, { error: "The request board is not set up yet." });
  const game = String(payload.game ?? "");
  if (game !== "other" && !gameSlugs.includes(game)) return json(400, { error: "Pick a game." });
  const title = cleanField(payload.title, TITLE_MIN, TITLE_MAX);
  if (!title.ok) return json(400, { error: title.error === "long" ? "The title is too long." : "Add a short title (at least 8 characters)." });
  const details = cleanField(payload.details ?? "", 0, DETAILS_MAX);
  if (!details.ok) return json(400, { error: "The details are too long." });
  const token = payload.turnstileToken;
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return json(403, { error: "The check failed. Submit the form again." });
  const check = await turnstileCheck(request, env, token, "request", originHost, hostnames, fetchImpl);
  if (check !== "ok") {
    console.log(JSON.stringify({ event: "request", result: `turnstile_${check}` }));
    return json(403, { error: "The check failed. Submit the form again." });
  }
  const made = await createRequest(db, { game, title: title.value, details: details.value, voter });
  if ("error" in made) return json(429, { error: "You already have a few requests waiting. They show up once they are approved." });
  console.log(JSON.stringify({ event: "request", result: "saved", game }));
  return json(200, { ok: true, id: made.id });
}
