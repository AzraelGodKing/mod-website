import { passwordMatches } from "./auth.ts";

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  CATALOG: R2Bucket;
  ASSETS: Fetcher;
  KATS_UPLOAD_TOKEN?: string;
  UPLOAD_LIMIT?: RateLimit;
}

interface Manifest {
  id: string | null;
  updatedAt: string | null;
  files: Record<string, string>;
  counts: Record<string, number>;
  changes?: unknown;
  geneRates?: unknown;
  previous?: Manifest | null;
}

export const WRITABLE = new Set([
  "items",
  "traits",
  "xenotypes",
  "incidents",
  "weather",
  "commands",
  "genes",
  "backstories",
]);

export const PUBLIC = new Set([
  ...WRITABLE,
  "addon-commands",
  "isekai-classes",
  "isekai-keystones",
  "isekai-stats",
]);

const MAX_BYTES = 8_000_000;
const MAX_COMMIT_BYTES = 1_000_000;
const CURRENT = "meta/current.json";
// Price changes of the last uploads, newest last, for the price history in the details popup.
const HISTORY = "meta/history.json";
const HISTORY_UPLOADS = 40;
const HISTORY_ROWS = 3000;

interface HistoryEntry {
  id: string;
  at: string;
  // list name -> [label, from, to]
  prices: Record<string, [string, number, number][]>;
}
const REVISION_ID = /^\d{8}T\d{6}Z-[a-z0-9]{6}$/;

function log(result: string, name: string) {
  console.log(JSON.stringify({ event: "kats-catalog", result, name }));
}

function text(message: string, status: number): Response {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function newRevisionId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const random = crypto.getRandomValues(new Uint8Array(6));
  const suffix = Array.from(random, (byte) => "abcdefghijklmnopqrstuvwxyz0123456789"[byte % 36]).join("");
  return `${stamp}-${suffix}`;
}

async function readManifest(env: Env): Promise<Manifest | null> {
  const object = await env.CATALOG.get(CURRENT);
  if (!object) return null;
  try {
    return (await object.json()) as Manifest;
  } catch {
    return null;
  }
}

async function writeManifest(env: Env, manifest: Manifest) {
  await env.CATALOG.put(CURRENT, JSON.stringify(manifest), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

async function readHistory(env: Env): Promise<HistoryEntry[]> {
  const object = await env.CATALOG.get(HISTORY);
  if (!object) return [];
  try {
    const list = await object.json();
    return Array.isArray(list) ? (list as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeHistory(env: Env, list: HistoryEntry[]) {
  await env.CATALOG.put(HISTORY, JSON.stringify(list.slice(-HISTORY_UPLOADS)), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

/** Keeps only well-formed [label, from, to] rows of the lists that have prices. */
export function cleanPriceLog(input: unknown): HistoryEntry["prices"] {
  const out: HistoryEntry["prices"] = {};
  if (!input || typeof input !== "object") return out;
  for (const [name, rows] of Object.entries(input as Record<string, unknown>)) {
    if (!WRITABLE.has(name) || !Array.isArray(rows)) continue;
    const kept: [string, number, number][] = [];
    for (const row of rows.slice(0, HISTORY_ROWS)) {
      if (!Array.isArray(row)) continue;
      const [label, from, to] = row;
      if (typeof label === "string" && label.length <= 200 && Number.isFinite(from) && Number.isFinite(to) && from !== to) {
        kept.push([label, Number(from), Number(to)]);
      }
    }
    if (kept.length) out[name] = kept;
  }
  return out;
}

function withoutPrevious(manifest: Manifest | null): Manifest {
  if (!manifest) return { id: null, updatedAt: null, files: {}, counts: {} };
  const { previous: _previous, ...rest } = manifest;
  return rest;
}

export function publicMeta(manifest: Manifest) {
  return {
    updatedAt: manifest.updatedAt,
    counts: manifest.counts,
    changes: manifest.changes ?? null,
    geneRates: manifest.geneRates ?? null,
    previousUpdatedAt: manifest.previous?.updatedAt ?? null,
    canRollBack: Boolean(manifest.previous),
  };
}

async function allowed(request: Request, env: Env): Promise<Response | null> {
  if (!env.KATS_UPLOAD_TOKEN) return text("Upload is not configured.", 503);
  if (env.UPLOAD_LIMIT) {
    const key = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.UPLOAD_LIMIT.limit({ key });
    if (!success) return text("Too many attempts. Wait a minute and try again.", 429);
  }
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!provided || !(await passwordMatches(provided, env.KATS_UPLOAD_TOKEN))) {
    return text("The password was not accepted.", 401);
  }
  return null;
}

async function readLimited(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > max) return null;
  const body = await request.text();
  if (!body || new TextEncoder().encode(body).length > max) return null;
  return body;
}

async function startRevision(): Promise<Response> {
  const id = newRevisionId();
  log("started", id);
  return Response.json({ ok: true, id });
}

async function putFile(request: Request, env: Env, id: string, name: string): Promise<Response> {
  if (!WRITABLE.has(name)) {
    log("rejected", name);
    return text("That catalog file is not accepted.", 404);
  }
  const body = await readLimited(request, MAX_BYTES);
  if (body == null) {
    log("rejected", name);
    return text("The catalog file is empty or too large.", 400);
  }
  let rows: unknown;
  try {
    rows = JSON.parse(body);
  } catch {
    rows = null;
  }
  if (!Array.isArray(rows)) {
    log("rejected", name);
    return text(`${name} is not a catalog list.`, 400);
  }
  await env.CATALOG.put(`rev/${id}/${name}.json`, body, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  log("staged", name);
  return Response.json({ ok: true, name, rows: rows.length });
}

async function commitRevision(request: Request, env: Env, id: string): Promise<Response> {
  const body = await readLimited(request, MAX_COMMIT_BYTES);
  let details: { counts?: Record<string, number>; changes?: unknown; geneRates?: unknown; priceLog?: unknown } = {};
  try {
    details = body ? JSON.parse(body) : {};
  } catch {
    return text("The revision summary could not be read.", 400);
  }
  const names = Object.keys(details.counts ?? {}).filter((name) => WRITABLE.has(name));
  if (names.length === 0) return text("The revision has no catalog files.", 400);
  for (const name of names) {
    const staged = await env.CATALOG.head(`rev/${id}/${name}.json`);
    if (!staged) return text(`${name} was not saved, so nothing was changed.`, 409);
  }

  const current = await readManifest(env);
  const files = { ...(current?.files ?? {}) };
  const counts = { ...(current?.counts ?? {}) };
  for (const name of names) {
    files[name] = id;
    counts[name] = Number(details.counts?.[name]) || 0;
  }
  const manifest: Manifest = {
    id,
    updatedAt: new Date().toISOString(),
    files,
    counts,
    changes: details.changes ?? null,
    geneRates: details.geneRates ?? current?.geneRates ?? null,
    previous: withoutPrevious(current),
  };
  await writeManifest(env, manifest);
  const prices = cleanPriceLog(details.priceLog);
  if (Object.keys(prices).length) {
    // The catalog is already live; a history that fails to save must not fail the upload.
    try {
      await writeHistory(env, [...(await readHistory(env)), { id, at: manifest.updatedAt as string, prices }]);
    } catch (error) {
      console.warn(`[kats] price history not saved: ${error}`);
    }
  }
  log("committed", id);
  return Response.json({ ok: true, ...publicMeta(manifest) });
}

async function rollBack(env: Env): Promise<Response> {
  const current = await readManifest(env);
  if (!current?.previous) return text("There is no earlier revision to go back to.", 409);
  const restored: Manifest = { ...current.previous, previous: null };
  await writeManifest(env, restored);
  // The prices of the upload that was undone never happened.
  const history = await readHistory(env);
  if (history.some((entry) => entry.id === current.id)) await writeHistory(env, history.filter((entry) => entry.id !== current.id));
  log("rolled-back", current.id ?? "none");
  return Response.json({ ok: true, ...publicMeta(restored) });
}

function jsonResponse(body: BodyInit | null, extra: Record<string, string> = {}): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60",
    ...extra,
  });
  return new Response(body, { headers });
}

async function staticJson(request: Request, env: Env): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  if (response.status === 304) return response;
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || type.includes("text/html")) return text("Not found", 404);
  return response;
}

async function readCatalog(request: Request, env: Env, name: string): Promise<Response> {
  if (name === "meta") {
    const manifest = await readManifest(env);
    if (!manifest?.id) return staticJson(request, env);
    return jsonResponse(JSON.stringify(publicMeta(manifest)));
  }
  if (name === "history") {
    // Storage ids stay private: only the date and the prices are public.
    const history = (await readHistory(env)).map(({ at, prices }) => ({ at, prices }));
    return jsonResponse(JSON.stringify(history));
  }
  if (!PUBLIC.has(name)) return text("Not found", 404);
  const manifest = await readManifest(env);
  const revision = manifest?.files?.[name];
  const key = revision ? `rev/${revision}/${name}.json` : `data/${name}.json`;
  const object = await env.CATALOG.get(key);
  if (!object) return staticJson(request, env);
  return jsonResponse(object.body);
}

function catalogName(value: string): string | null {
  const name = value.replace(/\.json$/, "");
  return /^[\w-]+$/.test(name) ? name : null;
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] === "api") {
    if (request.method !== "POST" && request.method !== "PUT") return text("Not found", 404);
    const denied = await allowed(request, env);
    if (denied) {
      log(denied.status === 429 ? "limited" : "denied", url.pathname);
      return denied;
    }
    if (request.method === "POST" && parts.length === 2 && parts[1] === "revisions") return startRevision();
    if (request.method === "POST" && parts.length === 2 && parts[1] === "rollback") return rollBack(env);
    if (parts[1] === "revisions" && REVISION_ID.test(parts[2] ?? "")) {
      if (request.method === "PUT" && parts.length === 4) {
        const name = catalogName(parts[3]);
        if (!name) return text("That catalog file is not accepted.", 404);
        return putFile(request, env, parts[2], name);
      }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "commit") {
        return commitRevision(request, env, parts[2]);
      }
    }
    return text("Not found", 404);
  }

  if (request.method === "GET" && parts[0] === "data" && parts.length === 2 && parts[1].endsWith(".json")) {
    const name = catalogName(parts[1]);
    if (!name) return text("Not found", 404);
    return readCatalog(request, env, name);
  }
  return env.ASSETS.fetch(request);
}

export default {
  fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env>;
