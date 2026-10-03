import catalogFile from "./data/catalog.json";
import labels from "./data/report-labels.json";
import { games } from "./data/games";
import { handleReport } from "./report/handle.mjs";
import { adminAuthorized } from "./admin/auth";
import { collectStats, rosterFromCatalog, type Snapshot } from "./stats/collect.mjs";

interface CatalogMod {
  slug: string;
  name: string;
  game: string;
  version: string;
  links: { steam: string | null; thunderstore: string | null; nexus: string | null };
}

// NEXUSMODS_API_KEY is a Worker secret. Without it, Nexus counts stay at the last stored value.
// ADMIN_TOKEN is the password for /admin. Without it, the admin API answers 503.
type SiteEnv = Env & { NEXUSMODS_API_KEY?: string; ADMIN_TOKEN?: string };

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
  labelId: string;
  gameLabelId: string;
}

const catalogMods = (catalogFile as { mods: CatalogMod[] }).mods;

function reportCatalog() {
  const mods: Record<string, ReportMod> = {};
  for (const mod of catalogMods) {
    const key = `${mod.game}/${mod.slug}`;
    const labelId = labels.mods[key as keyof typeof labels.mods];
    if (!labelId) throw new Error(`Missing report label for ${key}`);
    const game = games.find((entry) => entry.slug === mod.game);
    const gameLabelId = labels.games[mod.game as keyof typeof labels.games];
    if (!game || !gameLabelId) throw new Error(`Missing game for ${key}`);
    mods[key] = {
      gameName: game.name,
      modName: mod.name,
      version: mod.version,
      labelId,
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

async function handleStats(request: Request, env: SiteEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const { lastFetched, mods, games: gameStats } = await readStats(env);
  const body = JSON.stringify({ lastFetched, mods, games: gameStats });
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
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
  return adminJson(200, snapshot);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/report") {
      return handleReport(request, env, catalog);
    }
    if (url.pathname === "/api/stats") {
      return handleStats(request, env);
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
