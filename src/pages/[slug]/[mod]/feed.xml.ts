import type { APIRoute } from "astro";
import { isNotReady, mods, type ModEntry } from "../../../data/mods";
import { modRssFeed } from "../../../data/releases";

export function getStaticPaths() {
  return mods.filter((mod) => !isNotReady(mod)).map((mod) => ({ params: { slug: mod.game, mod: mod.slug }, props: { mod } }));
}

export const GET: APIRoute = ({ site, props }) =>
  new Response(modRssFeed(site as URL, (props as { mod: ModEntry }).mod), {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
