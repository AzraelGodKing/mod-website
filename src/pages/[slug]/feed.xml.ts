import type { APIRoute } from "astro";
import { games } from "../../data/games";
import { rssFeed } from "../../data/releases";

export function getStaticPaths() {
  return games.map((game) => ({ params: { slug: game.slug }, props: { name: game.name } }));
}

export const GET: APIRoute = ({ site, params, props }) =>
  new Response(
    rssFeed(site as URL, {
      title: `Azrael's Mods: ${props.name} releases`,
      description: `New versions of Azrael's ${props.name} mods.`,
      path: `/${params.slug}/feed.xml`,
      game: params.slug,
    }),
    { headers: { "content-type": "application/rss+xml; charset=utf-8" } },
  );
