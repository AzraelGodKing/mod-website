// status.azraelsmods.com: checks every site and download every 5 minutes (cron),
// keeps a day of history in KV, and pings Discord when something goes down or comes back.
import { emptyState, publicStatus, runChecks } from "./checks.mjs";

interface Env {
  ASSETS: Fetcher;
  STATUS: KVNamespace;
  // Optional Discord webhook for alerts. Set with `wrangler secret put STATUS_WEBHOOK_URL`.
  STATUS_WEBHOOK_URL?: string;
}

const STATE_KEY = "state";

async function readState(env: Env) {
  return (await env.STATUS.get(STATE_KEY, "json")) ?? emptyState();
}

async function notify(env: Env, alerts: string[]) {
  if (!env.STATUS_WEBHOOK_URL || !alerts.length) return;
  try {
    await fetch(env.STATUS_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "Azrael's Mods status",
        content: `${alerts.join("\n")}\n<https://status.azraelsmods.com>`,
        allowed_mentions: { parse: [] },
      }),
    });
  } catch (error) {
    console.warn(`[status] Discord alert failed: ${error}`);
  }
}

export async function check(env: Env, now = new Date()) {
  const previous = await readState(env);
  // GitHub's release API is checked every 30 minutes; the rest every run.
  const tools = now.getUTCMinutes() < 5 || (now.getUTCMinutes() >= 30 && now.getUTCMinutes() < 35);
  const { state, alerts } = await runChecks((input: string, init?: RequestInit) => fetch(input, init), previous, { now, tools });
  await env.STATUS.put(STATE_KEY, JSON.stringify(state));
  await notify(env, alerts);
  console.log(JSON.stringify({ event: "status-check", alerts: alerts.length }));
  return state;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/status" || url.pathname === "/status.json") {
      const body = JSON.stringify(publicStatus(await readState(env)));
      return new Response(request.method === "HEAD" ? null : body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=60",
          "access-control-allow-origin": "*",
        },
      });
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(check(env).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
