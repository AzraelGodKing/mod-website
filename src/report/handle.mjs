const BODY_MAX = 16_384;
const SUMMARY_MIN = 8;
const SUMMARY_MAX = 120;
const DETAILS_MIN = 20;
const DETAILS_MAX = 4_000;
const TOKEN_MAX = 2_048;

const CHECK_FAILED = "The check failed. Submit the form again.";

/**
 * @param {number} status
 * @param {Record<string, string | boolean>} payload
 */
function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** @param {string} value */
export function stripHtml(value) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "");
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {{ ok: true, value: string } | { ok: false, error: "short" | "long" }}
 */
function cleanField(value, min, max) {
  if (typeof value !== "string" || value.length > max * 4) {
    return { ok: false, error: typeof value === "string" ? "long" : "short" };
  }
  const cleaned = stripHtml(value).trim();
  if (cleaned.length < min) return { ok: false, error: "short" };
  if (cleaned.length > max) return { ok: false, error: "long" };
  return { ok: true, value: cleaned };
}

/** @param {Request} request @param {number} max */
async function readLimited(request, max) {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) {
    return null;
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * @param {object} input
 * @param {string} input.teamId
 * @param {string} input.websiteLabelId
 * @param {string} input.game
 * @param {string} input.slug
 * @param {string} input.summary
 * @param {string} input.details
 * @param {{ gameName: string, modName: string, version: string, labelId: string, gameLabelId: string }} input.target
 */
export function buildIssueBody(input) {
  const title = `${input.target.modName}: ${input.summary}`;
  const description = [
    `Game: ${input.target.gameName}`,
    `Mod: ${input.target.modName}`,
    `Version: ${input.target.version}`,
    `Page: /${input.game}/${input.slug}`,
    "",
    input.details,
  ].join("\n");
  return {
    query: `mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { identifier }
      }
    }`,
    variables: {
      input: {
        teamId: input.teamId,
        title,
        description,
        labelIds: [input.target.labelId, input.target.gameLabelId, input.websiteLabelId],
      },
    },
  };
}

/**
 * The mod label comes from the page the report was sent from.
 * `/rimworld/azrael/` becomes `rimworld/azrael`.
 * @param {string | null} referer
 * @param {string} originHost
 */
export function modKeyFromPage(referer, originHost) {
  if (typeof referer !== "string" || referer.length === 0 || referer.length > 2048) return null;
  /** @type {URL} */
  let url;
  try {
    url = new URL(referer);
  } catch {
    return null;
  }
  if (url.hostname !== originHost) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  if (!/^[a-z0-9-]+$/.test(parts[0]) || !/^[a-z0-9-]+$/.test(parts[1])) return null;
  return `${parts[0]}/${parts[1]}`;
}

function hostnameSet(raw) {
  return new Set(
    String(raw ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
  );
}

/**
 * @param {Request} request
 * @param {{ TURNSTILE_SECRET?: string, TURNSTILE_HOSTNAMES?: string, LINEAR_API_KEY?: string, LINEAR_TEAM_ID?: string }} env
 * @param {{ websiteLabelId: string, mods: Record<string, { gameName: string, modName: string, version: string, labelId: string, gameLabelId: string }> }} catalog
 * @param {typeof fetch} [fetchImpl]
 */
export async function handleReport(request, env, catalog, fetchImpl = fetch) {
  if (request.method !== "POST") {
    return json(405, { error: "Use the report form." });
  }

  const hostnames = hostnameSet(env.TURNSTILE_HOSTNAMES);
  const ready =
    Boolean(env.TURNSTILE_SECRET) &&
    Boolean(env.LINEAR_API_KEY) &&
    Boolean(env.LINEAR_TEAM_ID) &&
    hostnames.size > 0;
  if (!ready) {
    return json(503, { error: "The report was not filed. A Linear key still needs to be added on this machine." });
  }

  let originHost = "";
  try {
    originHost = new URL(request.headers.get("origin") ?? "").hostname;
  } catch {
    return json(403, { error: CHECK_FAILED });
  }
  if (!hostnames.has(originHost)) return json(403, { error: CHECK_FAILED });

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return json(400, { error: "Use the report form." });
  }

  const bytes = await readLimited(request, BODY_MAX);
  if (!bytes) return json(413, { error: "That report is too long." });

  /** @type {Record<string, unknown>} */
  let payload;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(400, { error: "Use the report form." });
    }
    payload = parsed;
  } catch {
    return json(400, { error: "Use the report form." });
  }

  const key = modKeyFromPage(request.headers.get("referer"), originHost);
  const target = key ? catalog.mods[key] : undefined;
  if (!key || !target) return json(400, { error: "That mod cannot take reports." });
  if (`${payload.game}/${payload.mod}` !== key) {
    return json(400, { error: "That report does not match this page." });
  }

  const summary = cleanField(payload.summary, SUMMARY_MIN, SUMMARY_MAX);
  if (!summary.ok) {
    return json(400, {
      error:
        summary.error === "long"
          ? "The summary is too long."
          : "Add a short summary (at least 8 characters).",
    });
  }
  const details = cleanField(payload.details, DETAILS_MIN, DETAILS_MAX);
  if (!details.ok) {
    return json(400, {
      error:
        details.error === "long"
          ? "The details are too long."
          : "Add a few more details (at least 20 characters).",
    });
  }

  const token = payload.turnstileToken;
  if (typeof token !== "string" || token.length === 0 || token.length > TOKEN_MAX) {
    return json(403, { error: CHECK_FAILED });
  }

  /** @type {{ success?: boolean, action?: string, hostname?: string }} */
  let verified;
  try {
    const params = new URLSearchParams({
      secret: env.TURNSTILE_SECRET ?? "",
      response: token,
    });
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) params.set("remoteip", ip);
    const response = await fetchImpl(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params,
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error("siteverify");
    verified = await response.json();
  } catch {
    console.error(JSON.stringify({ event: "report", result: "turnstile_unreachable" }));
    return json(403, { error: CHECK_FAILED });
  }

  if (
    verified.success !== true ||
    verified.action !== "report" ||
    verified.hostname !== originHost ||
    !hostnames.has(verified.hostname)
  ) {
    console.log(JSON.stringify({ event: "report", result: "turnstile_rejected" }));
    return json(403, { error: CHECK_FAILED });
  }

  const issue = buildIssueBody({
    teamId: env.LINEAR_TEAM_ID ?? "",
    websiteLabelId: catalog.websiteLabelId,
    game: String(payload.game),
    slug: String(payload.mod),
    summary: summary.value,
    details: details.value,
    target,
  });

  /** @type {{ data?: { issueCreate?: { success?: boolean, issue?: { identifier?: string } } }, errors?: unknown[] }} */
  let created;
  try {
    const response = await fetchImpl("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: env.LINEAR_API_KEY ?? "",
      },
      body: JSON.stringify(issue),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("linear");
    created = await response.json();
  } catch {
    console.error(JSON.stringify({ event: "report", result: "linear_unreachable" }));
    return json(502, { error: "The report could not be filed. Try again." });
  }

  const identifier = created.data?.issueCreate?.issue?.identifier;
  if (created.data?.issueCreate?.success !== true || typeof identifier !== "string") {
    console.error(JSON.stringify({ event: "report", result: "linear_rejected" }));
    return json(502, { error: "The report could not be filed. Try again." });
  }

  console.log(JSON.stringify({ event: "report", result: "filed", issue: identifier }));
  return json(200, { ok: true, issue: identifier });
}
