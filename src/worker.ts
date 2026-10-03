import catalogFile from "./data/catalog.json";
import labels from "./data/report-labels.json";
import { games } from "./data/games";
import { handleReport } from "./report/handle.mjs";
import { collectStats, rosterFromCatalog, type Snapshot } from "./stats/collect.mjs";

interface CatalogMod {
  slug: string;
  name: string;
  game: string;
  version: string;
  links: { steam: string | null; thunderstore: string | null; nexus: string | null };
}

// NEXUSMODS_API_KEY is a Worker secret. Without it, Nexus counts stay at the last stored value.
type SiteEnv = Env & { NEXUSMODS_API_KEY?: string };

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

async function refreshStats(env: SiteEnv): Promise<Snapshot> {
  const previous = await env.STATS.get<Snapshot>(STATS_KEY, "json");
  const next = await collectStats(statsRoster, {
    fetch: (input, init) => fetch(input, init),
    nexusKey: env.NEXUSMODS_API_KEY,
    previous,
    log: (message) => console.warn(`[stats] ${message}`),
  });
  await env.STATS.put(STATS_KEY, JSON.stringify(next));
  return next;
}

async function handleStats(request: Request, env: SiteEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const snapshot = (await env.STATS.get<Snapshot>(STATS_KEY, "json")) ?? (await refreshStats(env));
  return new Response(request.method === "HEAD" ? null : JSON.stringify(snapshot), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
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
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(refreshStats(env).then(() => undefined));
  },
} satisfies ExportedHandler<SiteEnv>;
