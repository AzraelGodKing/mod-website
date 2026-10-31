import type { APIRoute } from "astro";
import { rssFeed } from "../data/releases";

export const GET: APIRoute = ({ site }) =>
  new Response(
    rssFeed(site as URL, {
      title: "Azrael's Mods: new releases",
      description: "New versions of Azrael's RimWorld, Sun Haven, and 7 Days to Die mods.",
      path: "/feed.xml",
    }),
    { headers: { "content-type": "application/rss+xml; charset=utf-8" } },
  );
