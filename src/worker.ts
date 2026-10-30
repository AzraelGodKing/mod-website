import catalogFile from "./data/catalog.json";
import labels from "./data/report-labels.json";
import { games } from "./data/games";
import { handleReport } from "./report/handle.mjs";
import { adminAuthorized } from "./admin/auth";
import { collectStats, rosterFromCatalog, type Snapshot } from "./stats/collect.mjs";
import { NOT_READY, fetchManifestFiles, latestDownloads } from "./downloads/latest.mjs";
import { isBot, recordDownload, siteCounts, withSiteCounts } from "./downloads/count.mjs";

interface CatalogMod {
  slug: string;
  name: string;
  game: string;
  version: string;
  uploadedAt?: string;
  links: { steam: string | null; thunderstore: string | null; nexus: string | null };
}

// NEXUSMODS_API_KEY is a Worker secret. Without it, Nexus counts stay at the last stored value.
// ADMIN_TOKEN is the password for /admin. Without it, the admin API answers 503.
// DOWNLOADS_DB counts clicks on our own Download buttons. Without it, downloads still redirect.
type SiteEnv = Env & { NEXUSMODS_API_KEY?: string; ADMIN_TOKEN?: string; DOWNLOADS_DB?: D1Database };

type RefreshSource = "scheduled" | "manual" | "first-request";

interface StoredSnapshot extends Snapshot {
  source: RefreshSource;
  lastScheduled: string | null;
  warnings: string[];
}

interface ReportMod {
  gameName: string;
  modName: string;
  version: string;
  labelId?: string;
  gameLabelId: string;
}

const catalogMods = (catalogFile as { mods: CatalogMod[] }).mods;

function reportCatalog() {
  const mods: Record<string, ReportMod> = {};
  for (const mod of catalogMods) {
    const key = `${mod.game}/${mod.slug}`;
    // A new mod can reach the catalog before its Linear label is added here.
    // Its reports keep the game and website labels instead of failing the Worker.
    const labelId: string | undefined = labels.mods[key as keyof typeof labels.mods];
    if (!labelId) console.warn(`No report label for ${key}; reports use the game label.`);
    const game = games.find((entry) => entry.slug === mod.game);
    const gameLabelId = labels.games[mod.game as keyof typeof labels.games];
    if (!game || !gameLabelId) throw new Error(`Missing game for ${key}`);
    mods[key] = {
      gameName: game.name,
      modName: mod.name,
      version: mod.version,
      ...(labelId ? { labelId } : {}),
      gameLabelId,
    };
  }
  return { websiteLabelId: labels.websiteLabelId, mods };
}

const catalog = reportCatalog();
const statsRoster = rosterFromCatalog(catalogMods);
const STATS_KEY = "snapshot";

// A manual refresh keeps lastScheduled, so the hourly cron timeline is unchanged.
async function refreshStats(env: SiteEnv, source: RefreshSource): Promise<StoredSnapshot> {
  const previous = await env.STATS.get<StoredSnapshot>(STATS_KEY, "json");
  const warnings: string[] = [];
  const next = await collectStats(statsRoster, {
    fetch: (input, init) => fetch(input, init),
    nexusKey: env.NEXUSMODS_API_KEY,
    previous,
    log: (message) => {
      warnings.push(message);
      console.warn(`[stats] ${message}`);
    },
  });
  const stored: StoredSnapshot = {
    ...next,
    source,
    lastScheduled: source === "scheduled" ? next.lastFetched : (previous?.lastScheduled ?? null),
    warnings,
  };
  await env.STATS.put(STATS_KEY, JSON.stringify(stored));
  console.log(JSON.stringify({ event: "stats", result: "refreshed", source, warnings: warnings.length }));
  return stored;
}

async function readStats(env: SiteEnv): Promise<StoredSnapshot> {
  return (await env.STATS.get<StoredSnapshot>(STATS_KEY, "json")) ?? (await refreshStats(env, "first-request"));
}

// Site counts are read live from D1; the store counts come from the hourly snapshot.
async function readSiteCounts(env: SiteEnv): Promise<Record<string, number> | null> {
  if (!env.DOWNLOADS_DB) return null;
  try {
    return await siteCounts(env.DOWNLOADS_DB);
  } catch (error) {
    console.warn(`[downloads] site counts could not be read: ${error}`);
    return null;
  }
}

async function statsWithSite(env: SiteEnv, snapshot: StoredSnapshot): Promise<StoredSnapshot> {
  return withSiteCounts(snapshot, statsRoster, await readSiteCounts(env));
}

async function handleStats(request: Request, env: SiteEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const { lastFetched, mods, games: gameStats } = await statsWithSite(env, await readStats(env));
  const body = JSON.stringify({ lastFetched, mods, games: gameStats });
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

// downloads.json is read on each request (edge-cached for five minutes), so a mod
// release reaches the download buttons without rebuilding the site.
async function currentDownloads() {
  return latestDownloads(catalogMods, await fetchManifestFiles((input, init) => fetch(input, init)));
}

async function handleDownloads(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const body = JSON.stringify(await currentDownloads());
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

async function handleDownloadRedirect(request: Request, env: SiteEnv, ctx: ExecutionContext, pathname: string): Promise<Response> {
  const key = pathname.replace(/^\/download\//, "").replace(/\/+$/, "");
  if (NOT_READY.has(key)) return Response.redirect(new URL("/not-ready", request.url).href, 302);
  const latest = (await currentDownloads())[key];
  if (!latest) return new Response("Not found", { status: 404 });
  const db = env.DOWNLOADS_DB;
  if (db && request.method === "GET" && !isBot(request.headers.get("user-agent"))) {
    // The redirect does not wait for the write.
    ctx.waitUntil(recordDownload(db, key, latest.version).catch((error) => console.warn(`[downloads] count failed for ${key}: ${error}`)));
  }
  // no-store: a cached redirect would skip the Worker and the click would not be counted.
  return new Response(null, {
    status: 302,
    headers: { location: latest.url, "cache-control": "no-store" },
  });
}

function adminJson(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function handleAdmin(request: Request, env: SiteEnv, pathname: string): Promise<Response> {
  const action = pathname === "/api/admin/stats" ? "read" : pathname === "/api/admin/refresh" ? "refresh" : null;
  if (!action) return adminJson(404, { error: "Not found." });
  const method = action === "read" ? "GET" : "POST";
  if (request.method !== method) return adminJson(405, { error: `Use ${method}.` });
  if (!env.ADMIN_TOKEN) {
    console.log(JSON.stringify({ event: "admin", result: "unconfigured", action }));
    return adminJson(503, { error: "The admin page is not configured." });
  }
  if (!(await adminAuthorized(request, env.ADMIN_TOKEN))) {
    console.log(JSON.stringify({ event: "admin", result: "denied", action }));
    return adminJson(401, { error: "The password was not accepted." });
  }
  const snapshot = action === "refresh" ? await refreshStats(env, "manual") : await readStats(env);
  return adminJson(200, await statsWithSite(env, snapshot));
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/report") {
      return handleReport(request, env, catalog);
    }
    if (url.pathname === "/api/stats") {
      return handleStats(request, env);
    }
    if (url.pathname === "/api/downloads") {
      return handleDownloads(request);
    }
    if (url.pathname.startsWith("/download/")) {
      return handleDownloadRedirect(request, env, ctx, url.pathname);
    }
    if (url.pathname.startsWith("/api/admin/")) {
      return handleAdmin(request, env, url.pathname);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(refreshStats(env, "scheduled").then(() => undefined));
  },
} satisfies ExportedHandler<SiteEnv>;
