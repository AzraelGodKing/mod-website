import type { APIRoute } from "astro";
import { releases } from "../data/releases";

// Read by scripts/announce-releases.mjs on the deploy agent, before and after a deploy.
export const GET: APIRoute = () =>
  new Response(`${JSON.stringify({ releases: releases() }, null, 2)}\n`, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
