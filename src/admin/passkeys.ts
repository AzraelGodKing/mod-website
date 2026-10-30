// Passkey (WebAuthn) sign-in for /admin, plus the session cookie both sign-in methods use.
// Everything lives in D1 next to the download counts; the tables are created on first use.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS admin_passkeys (
    id TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS admin_challenges (
    challenge TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    method TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
];

const RP_NAME = "Azrael's Mods admin";
// One admin, so every passkey belongs to the same WebAuthn user.
const USER_ID = new TextEncoder().encode("azraels-mods-admin");
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SESSION_COOKIE = "__Host-admin_session";

type ChallengeKind = "register" | "login";
export type SignInMethod = "password" | "passkey";

const ready = new WeakMap<D1Database, Promise<unknown>>();

function ensureTables(db: D1Database): Promise<unknown> {
  let promise = ready.get(db);
  if (!promise) {
    promise = db.batch(SCHEMA.map((sql) => db.prepare(sql)));
    promise.catch(() => ready.delete(db));
    ready.set(db, promise);
  }
  return promise;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256Hex(value: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// azraelsmods.com and www.azraelsmods.com share one RP ID, so a passkey works on both.
export function relyingParty(url: URL): { rpID: string; origin: string } {
  return { rpID: url.hostname.replace(/^www\./, ""), origin: url.origin };
}

async function storeChallenge(db: D1Database, challenge: string, kind: ChallengeKind, now: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM admin_challenges WHERE expires_at < ?1").bind(now),
    db.prepare("INSERT INTO admin_challenges (challenge, kind, expires_at) VALUES (?1, ?2, ?3)").bind(challenge, kind, now + CHALLENGE_TTL_MS),
  ]);
}

// A challenge works once: it is deleted whether or not the response then verifies.
async function consumeChallenge(db: D1Database, challenge: string, kind: ChallengeKind, now: number): Promise<boolean> {
  const row = await db
    .prepare("DELETE FROM admin_challenges WHERE challenge = ?1 AND kind = ?2 RETURNING expires_at")
    .bind(challenge, kind)
    .first<{ expires_at: number }>();
  return !!row && row.expires_at >= now;
}

export interface PasskeySummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listPasskeys(db: D1Database): Promise<PasskeySummary[]> {
  await ensureTables(db);
  const { results } = await db
    .prepare("SELECT id, name, created_at, last_used_at FROM admin_passkeys ORDER BY created_at")
    .all<{ id: string; name: string; created_at: string; last_used_at: string | null }>();
  return results.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at }));
}

export async function deletePasskey(db: D1Database, id: string): Promise<boolean> {
  await ensureTables(db);
  const result = await db.prepare("DELETE FROM admin_passkeys WHERE id = ?1").bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function registrationOptions(db: D1Database, url: URL, now = Date.now()) {
  await ensureTables(db);
  const { rpID } = relyingParty(url);
  const { results } = await db.prepare("SELECT id, transports FROM admin_passkeys").all<{ id: string; transports: string | null }>();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: USER_ID,
    userName: "admin",
    userDisplayName: "Azrael's Mods admin",
    attestationType: "none",
    // Discoverable, so sign-in needs no username: the password manager lists the passkey for this site.
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    excludeCredentials: results.map((row) => ({ id: row.id, transports: row.transports ? JSON.parse(row.transports) : undefined })),
  });
  await storeChallenge(db, options.challenge, "register", now);
  return options;
}

export async function registerPasskey(
  db: D1Database,
  url: URL,
  response: RegistrationResponseJSON,
  name: string,
  now = Date.now(),
): Promise<PasskeySummary | null> {
  await ensureTables(db);
  const { rpID, origin } = relyingParty(url);
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: (challenge) => consumeChallenge(db, challenge, "register", now),
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
  if (!verification.verified) return null;
  const { credential } = verification.registrationInfo;
  const createdAt = new Date(now).toISOString();
  const label = name.trim().slice(0, 60) || "Passkey";
  await db
    .prepare(
      "INSERT INTO admin_passkeys (id, public_key, counter, transports, name, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(
      credential.id,
      base64url(credential.publicKey),
      credential.counter,
      credential.transports ? JSON.stringify(credential.transports) : null,
      label,
      createdAt,
    )
    .run();
  return { id: credential.id, name: label, createdAt, lastUsedAt: null };
}

export async function authenticationOptions(db: D1Database, url: URL, now = Date.now()) {
  await ensureTables(db);
  const { rpID } = relyingParty(url);
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  await storeChallenge(db, options.challenge, "login", now);
  return options;
}

export async function verifyPasskey(db: D1Database, url: URL, response: AuthenticationResponseJSON, now = Date.now()): Promise<boolean> {
  await ensureTables(db);
  const row = await db
    .prepare("SELECT id, public_key, counter, transports FROM admin_passkeys WHERE id = ?1")
    .bind(response.id)
    .first<{ id: string; public_key: string; counter: number; transports: string | null }>();
  if (!row) return false;
  const { rpID, origin } = relyingParty(url);
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: (challenge) => consumeChallenge(db, challenge, "login", now),
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: row.id,
      publicKey: fromBase64url(row.public_key),
      counter: row.counter,
      transports: row.transports ? JSON.parse(row.transports) : undefined,
    },
  });
  if (!verification.verified) return false;
  await db
    .prepare("UPDATE admin_passkeys SET counter = ?1, last_used_at = ?2 WHERE id = ?3")
    .bind(verification.authenticationInfo.newCounter, new Date(now).toISOString(), row.id)
    .run();
  return true;
}

// The cookie holds a random token; D1 stores only its hash.
export async function createSession(db: D1Database, method: SignInMethod, now = Date.now()): Promise<string> {
  await ensureTables(db);
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  await db.batch([
    db.prepare("DELETE FROM admin_sessions WHERE expires_at < ?1").bind(now),
    db
      .prepare("INSERT INTO admin_sessions (token_hash, method, expires_at) VALUES (?1, ?2, ?3)")
      .bind(await sha256Hex(token), method, now + SESSION_TTL_MS),
  ]);
  return token;
}

export function sessionToken(request: Request): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return value.join("=") || null;
  }
  return null;
}

export async function sessionValid(db: D1Database, token: string, now = Date.now()): Promise<boolean> {
  await ensureTables(db);
  const row = await db
    .prepare("SELECT expires_at FROM admin_sessions WHERE token_hash = ?1")
    .bind(await sha256Hex(token))
    .first<{ expires_at: number }>();
  return !!row && row.expires_at >= now;
}

export async function endSession(db: D1Database, token: string): Promise<void> {
  await ensureTables(db);
  await db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?1").bind(await sha256Hex(token)).run();
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
