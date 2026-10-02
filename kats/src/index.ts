import { passwordMatches } from "./auth";

interface Env {
  CATALOG: R2Bucket;
  ASSETS: Fetcher;
  KATS_UPLOAD_TOKEN?: string;
}

const WRITABLE = new Set([
  "items",
  "traits",
  "xenotypes",
  "incidents",
  "weather",
  "commands",
  "genes",
  "backstories",
]);

const PUBLIC = new Set([
  ...WRITABLE,
  "addon-commands",
  "isekai-classes",
  "isekai-keystones",
  "isekai-stats",
]);

const MAX_BYTES = 8_000_000;

function catalogName(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const name = pathname.slice(prefix.length).replace(/\.json$/, "");
  if (!/^[\w-]+$/.test(name)) return null;
  return name;
}

function log(result: string, name: string) {
  console.log(JSON.stringify({ event: "kats-catalog", result, name }));
}

async function authorized(request: Request, env: Env): Promise<boolean> {
  const expected = env.KATS_UPLOAD_TOKEN ?? "";
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!provided) return false;
  return passwordMatches(provided, expected);
}

async function putCatalog(request: Request, env: Env, name: string): Promise<Response> {
  if (!WRITABLE.has(name)) {
    log("rejected", name);
    return new Response("That catalog file is not accepted.", { status: 404 });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length <= 0 || length > MAX_BYTES) {
    log("rejected", name);
    return new Response("The catalog file is empty or too large.", { status: 400 });
  }
  if (!env.KATS_UPLOAD_TOKEN) {
    log("unconfigured", name);
    return new Response("Upload is not configured.", { status: 503 });
  }
  if (!(await authorized(request, env))) {
    log("denied", name);
    return new Response("The password was not accepted.", { status: 401 });
  }
  await env.CATALOG.put(`data/${name}.json`, request.body, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  log("saved", name);
  return Response.json({ ok: true, name });
}

async function readCatalog(request: Request, env: Env, name: string): Promise<Response> {
  if (!PUBLIC.has(name)) return env.ASSETS.fetch(request);
  const object = await env.CATALOG.get(`data/${name}.json`);
  if (!object) return env.ASSETS.fetch(request);
  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "public, max-age=60");
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "PUT" && url.pathname.startsWith("/api/catalog/")) {
      const name = catalogName(url.pathname, "/api/catalog/");
      if (!name) return new Response("That catalog file is not accepted.", { status: 404 });
      return putCatalog(request, env, name);
    }
    if (request.method === "GET" && url.pathname.startsWith("/data/") && url.pathname.endsWith(".json")) {
      const name = catalogName(url.pathname, "/data/");
      if (!name) return new Response("Not found", { status: 404 });
      return readCatalog(request, env, name);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
