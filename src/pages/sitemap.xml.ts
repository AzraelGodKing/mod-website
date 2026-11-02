import type { APIRoute } from "astro";
import { games } from "../data/games";
import { mods, uploadedOn } from "../data/mods";

export const GET: APIRoute = ({ site }) => {
  // A catalog page changes when one of its mods does, so it takes its newest upload date.
  const day = (list: typeof mods) =>
    list
      .map((mod) => uploadedOn(mod)?.iso.slice(0, 10))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
  const entries: { path: string; lastmod?: string }[] = [
    { path: "/", lastmod: day(mods) },
    ...games.map((game) => ({ path: `/${game.slug}`, lastmod: day(mods.filter((mod) => mod.game === game.slug)) })),
    { path: "/rimworld/check" },
    ...mods.map((mod) => ({ path: `/${mod.game}/${mod.slug}`, lastmod: uploadedOn(mod)?.iso.slice(0, 10) })),
  ];
  const urls = entries
    .map(({ path, lastmod }) => {
      const loc = new URL(path, site).href;
      return `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
    })
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
