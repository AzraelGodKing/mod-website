import type { APIRoute } from "astro";
import { games } from "../data/games";
import { mods, uploadedOn } from "../data/mods";

export const GET: APIRoute = ({ site }) => {
  const entries: { path: string; lastmod?: string }[] = [
    { path: "/" },
    ...games.map((game) => ({ path: `/${game.slug}` })),
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
