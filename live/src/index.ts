// live.azraelsmods.com: an OBS browser-source overlay that cycles through the mods on
// stream and Kat's RICS chat commands. The Worker only proxies the two public data
// sources so the overlay page can read them from its own origin.
import { KATS, KATS_LISTS, POI, SITE, countsFrom, katsLines, modsFrom } from "./feed.mjs";
import { downloadTotal } from "../../src/badges/badge.mjs";

interface Env {
  ASSETS: Fetcher;
}

const TTL = 600;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? `public, max-age=${TTL}` : "no-store",
    },
  });
}

async function upstream(url: string) {
  // The in-game day moves faster than the lists do.
  const ttl = url.endsWith("/api/poi/day") ? 60 : url.endsWith("/api/stats") ? 300 : TTL;
  const response = await fetch(url, { cf: { cacheTtl: ttl, cacheEverything: true }, headers: { "user-agent": "live.azraelsmods.com" } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

export async function handleApi(url: URL, fetchJson = upstream): Promise<Response | null> {
  if (url.pathname === "/api/mods") {
    try {
      return json({ mods: modsFrom(await fetchJson(`${SITE}/releases.json`)) });
    } catch {
      return json({ error: "The mod list could not be read" }, 502);
    }
  }
  if (url.pathname === "/api/counts") {
    try {
      return json({ counts: countsFrom(await fetchJson(`${SITE}/api/stats`), downloadTotal) });
    } catch {
      return json({ error: "The download counts could not be read" }, 502);
    }
  }
  if (url.pathname === "/api/bloodmoon") {
    try {
      const { day, fresh } = (await fetchJson(`${POI}/api/poi/day`)) as { day?: number | null; fresh?: boolean };
      // Short cache: the day changes about once an hour of play.
      return new Response(JSON.stringify({ day: Number.isInteger(day) ? day : null, fresh: fresh === true }), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" },
      });
    } catch {
      return json({ error: "The game server's day could not be read" }, 502);
    }
  }
  const match = url.pathname.match(/^\/api\/kats\/([a-z-]+)$/);
  if (match) {
    const list = KATS_LISTS[match[1] as keyof typeof KATS_LISTS];
    if (!list) return json({ error: "Unknown list" }, 404);
    try {
      return json(katsLines(match[1], await fetchJson(`${KATS}/data/${list.source}.json`)));
    } catch {
      return json({ error: "Kat's RICS could not be read" }, 502);
    }
  }
  return null;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return (await handleApi(url)) ?? json({ error: "Not found" }, 404);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
