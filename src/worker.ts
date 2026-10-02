import catalogFile from "./data/catalog.json";
import labels from "./data/report-labels.json";
import { games } from "./data/games";
import { handleReport } from "./report/handle.mjs";

interface CatalogMod {
  slug: string;
  name: string;
  game: string;
  version: string;
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

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/report") {
      return handleReport(request, env, catalog);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
