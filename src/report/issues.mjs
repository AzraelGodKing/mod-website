import { stripHtml } from "./handle.mjs";

// Only issues moved out of Backlog are shown. A new report lands in Backlog, so
// nothing a player sends is public until it has been looked at and moved to
// Todo or In Progress.
export const SHOWN_STATES = ["unstarted", "started"];
export const ISSUES_TTL_SECONDS = 600;
const MAX_ISSUES = 10;

/**
 * @param {string} teamId
 * @param {string} labelId
 */
export function buildIssuesQuery(teamId, labelId) {
  return {
    query: `query KnownIssues($filter: IssueFilter!) {
      issues(filter: $filter, first: ${MAX_ISSUES}, orderBy: updatedAt) {
        nodes { identifier title createdAt updatedAt state { name type } }
      }
    }`,
    variables: {
      filter: {
        team: { id: { eq: teamId } },
        labels: { id: { eq: labelId } },
        state: { type: { in: SHOWN_STATES } },
      },
    },
  };
}

/**
 * Report titles start with "<Mod name>: ", which the page already says.
 * @param {unknown} payload
 * @param {string} modName
 * @returns {{ id: string; title: string; status: string; started: boolean; updatedAt: string }[]}
 */
export function publicIssues(payload, modName) {
  const nodes = /** @type {any} */ (payload)?.data?.issues?.nodes;
  if (!Array.isArray(nodes)) return [];
  const prefix = `${modName}: `;
  return nodes
    .filter((node) => node && typeof node.title === "string" && SHOWN_STATES.includes(node.state?.type))
    .map((node) => {
      const raw = node.title.startsWith(prefix) ? node.title.slice(prefix.length) : node.title;
      return {
        id: String(node.identifier ?? ""),
        title: stripHtml(raw).trim().slice(0, 140),
        status: String(node.state?.name ?? ""),
        started: node.state?.type === "started",
        updatedAt: String(node.updatedAt ?? node.createdAt ?? ""),
      };
    })
    .filter((issue) => issue.title);
}

/**
 * GET /api/issues?mod=<game>/<slug>
 * @param {Request} request
 * @param {{ LINEAR_READ_KEY?: string; LINEAR_API_KEY?: string; LINEAR_TEAM_ID?: string }} env
 * @param {Record<string, { modName: string; labelId?: string }>} mods
 * @param {{ fetch?: typeof fetch; cache?: Cache | null; log?: (message: string) => void }} [deps]
 */
export async function handleIssues(request, env, mods, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const log = deps.log ?? console.warn;
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
  }
  const url = new URL(request.url);
  const key = url.searchParams.get("mod") ?? "";
  const target = mods[key];
  if (!target) return issuesJson(404, { issues: [] }, false);
  const apiKey = env.LINEAR_READ_KEY || env.LINEAR_API_KEY;
  // A mod with no label of its own would list every issue in its game, so it shows none.
  if (!apiKey || !env.LINEAR_TEAM_ID || !target.labelId) return issuesJson(200, { issues: [] }, true);

  const cacheKey = new Request(`https://issues.cache/${encodeURIComponent(key)}`);
  const cache = deps.cache === undefined ? (typeof caches === "undefined" ? null : caches.default) : deps.cache;
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return hit;

  let issues = [];
  try {
    const response = await fetchImpl("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: apiKey },
      body: JSON.stringify(buildIssuesQuery(env.LINEAR_TEAM_ID, target.labelId)),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.errors) {
      log(`[issues] Linear answered ${response.status} for ${key}: ${JSON.stringify(payload?.errors ?? null).slice(0, 300)}`);
      // Not cached, so a fixed key shows up on the next request.
      return issuesJson(200, { issues: [] }, false);
    }
    issues = publicIssues(payload, target.modName);
  } catch (error) {
    log(`[issues] Linear request failed for ${key}: ${error}`);
    return issuesJson(200, { issues: [] }, false);
  }
  const result = issuesJson(200, { issues }, true);
  await cache?.put(cacheKey, result.clone()).catch(() => undefined);
  return result;
}

/** @param {number} status @param {unknown} payload @param {boolean} cacheable */
function issuesJson(status, payload, cacheable) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheable ? `public, max-age=${ISSUES_TTL_SECONDS}` : "no-store",
    },
  });
}
