// What status.azraelsmods.com checks, and how a run turns into the stored state.
// Kept free of Worker APIs so test/status.test.mjs can run it in Node.
import { compareVersions } from "../../src/downloads/latest.mjs";
import { TOOLS, VARIANTS, fetchLatestRelease } from "../../src/downloads/tools.mjs";

export const SERVICES = [
  { id: "site", name: "Main site", group: "Mods", url: "https://azraelsmods.com/", expect: "html" },
  { id: "releases", name: "Mod list", group: "Mods", url: "https://azraelsmods.com/releases.json", expect: "json" },
  { id: "downloads", name: "Download links", group: "Mods", url: "https://azraelsmods.com/api/downloads", expect: "json" },
  { id: "files", name: "Mod files", group: "Mods", kind: "files" },
  { id: "stats", name: "Download counts", group: "Mods", url: "https://azraelsmods.com/api/stats", expect: "json" },
  { id: "tools", name: "Modwright and Survivor's Toolkit", group: "Tools", kind: "tools" },
  { id: "docs", name: "Tool guides", group: "Tools", url: "https://docs.azraelsmods.com/", expect: "html" },
  { id: "kats", name: "Kat's RICS", group: "Other sites", url: "https://kats.azraelsmods.com/data/meta.json", expect: "json" },
  { id: "lantern", name: "Lantern", group: "Other sites", url: "https://lantern.azraelsmods.com/", expect: "html" },
  { id: "live", name: "Stream overlay", group: "Other sites", url: "https://live.azraelsmods.com/", expect: "html" },
  // The private POI page for the game server. Checked and alerted, but left off the public
  // status page (`private`). A stale report only means the game server is off, so it shows
  // as degraded and does not ping Discord (`quiet`); only down and back up do.
  { id: "poi", name: "POI owners", group: "Other sites", kind: "poi", origin: "https://poi.azraelsmods.com", private: true, quiet: true },
];

// A service has to fail this many runs in a row before it shows as down and pings Discord,
// so one dropped request does not page anyone.
export const FAILS_BEFORE_DOWN = 2;
// Runs every 5 minutes, so a day of history.
export const HISTORY_SIZE = 288;
// Mod files are checked a few at a time, round robin, to stay well under the Worker's subrequest limit.
export const FILES_PER_RUN = 6;
export const TIMEOUT_MS = 10_000;
export const SLOW_MS = 4_000;

const CODE = { up: 1, degraded: 2, down: 0 };

export function emptyState() {
  return { checkedAt: null, services: {}, history: [], fileCursor: 0, fileFailures: {}, games: [] };
}

async function timed(fetchImpl, url, init = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      headers: { "user-agent": "status.azraelsmods.com", "cache-control": "no-cache", ...(init.headers ?? {}) },
    });
    return { response, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/** One plain URL check: { ok, ms, detail, body? }. */
export async function checkUrl(fetchImpl, service) {
  try {
    const { response, ms } = await timed(fetchImpl, service.url);
    if (!response.ok) return { ok: false, ms, detail: `HTTP ${response.status}` };
    if (service.expect === "json") {
      try {
        return { ok: true, ms, body: await response.json(), slow: ms > SLOW_MS };
      } catch {
        return { ok: false, ms, detail: "Answered, but not with valid JSON" };
      }
    }
    await response.body?.cancel?.();
    return { ok: true, ms, slow: ms > SLOW_MS };
  } catch (error) {
    return { ok: false, ms: null, detail: error?.name === "AbortError" ? "No answer in 10 s" : "Could not connect" };
  }
}

/**
 * The POI page answers (a 401 or the password form counts, when it is locked) and its
 * health endpoint says whether the game server has reported in the last 30 minutes.
 */
export async function checkPoi(fetchImpl, service) {
  try {
    const { response: page, ms } = await timed(fetchImpl, `${service.origin}/`);
    await page.body?.cancel?.();
    if (!page.ok && page.status !== 401) return { ok: false, ms, detail: `HTTP ${page.status}` };
    const { response } = await timed(fetchImpl, `${service.origin}/api/poi/health`);
    if (!response.ok) return { ok: false, ms, detail: `Health check answered HTTP ${response.status}` };
    const health = await response.json().catch(() => null);
    if (!health || typeof health.stale !== "boolean") return { ok: false, ms, detail: "Health check did not answer with JSON" };
    if (health.stale) {
      const detail = health.minutesSinceReport === null || health.minutesSinceReport === undefined
        ? "The game server has not reported yet"
        : `The game server has not reported for ${health.minutesSinceReport} minutes`;
      return { ok: true, degraded: true, ms, detail };
    }
    return { ok: true, ms, slow: ms > SLOW_MS };
  } catch (error) {
    return { ok: false, ms: null, detail: error?.name === "AbortError" ? "No answer in 10 s" : "Could not connect" };
  }
}

/** Every tool's latest GitHub release has all three files. */
export async function checkTools(fetchImpl) {
  const started = Date.now();
  const missing = [];
  let unknown = 0;
  for (const tool of TOOLS) {
    const release = await fetchLatestRelease(tool, (input, init) => fetchImpl(input, init));
    if (!release) {
      unknown += 1;
      continue;
    }
    for (const variant of Object.keys(VARIANTS)) {
      if (!release.files[variant]) missing.push(`${tool.name} ${VARIANTS[variant].label.toLowerCase()}`);
    }
  }
  const ms = Date.now() - started;
  if (unknown === TOOLS.length) return { ok: false, ms, detail: "GitHub releases could not be read" };
  if (missing.length) return { ok: true, degraded: true, ms, detail: `Missing from the latest release: ${missing.join(", ")}` };
  return { ok: true, ms };
}

/**
 * HEADs the next few mod files from /api/downloads. A file that fails stays listed
 * until a later run reaches it again and it answers.
 */
export async function checkFiles(fetchImpl, downloads, state) {
  if (!downloads || typeof downloads !== "object") return { ok: false, ms: null, detail: "No download list to check" };
  const keys = Object.keys(downloads).sort();
  if (!keys.length) return { ok: false, ms: null, detail: "The download list is empty" };
  const failures = Object.fromEntries(Object.entries(state.fileFailures ?? {}).filter(([key]) => keys.includes(key)));
  const started = Date.now();
  let cursor = (state.fileCursor ?? 0) % keys.length;
  for (let i = 0; i < Math.min(FILES_PER_RUN, keys.length); i += 1) {
    const key = keys[cursor];
    cursor = (cursor + 1) % keys.length;
    const url = downloads[key]?.url;
    let ok = false;
    let reason = "No file link";
    if (url) {
      try {
        const { response } = await timed(fetchImpl, url, { method: "HEAD", redirect: "follow" });
        ok = response.ok;
        reason = `HTTP ${response.status}`;
      } catch {
        reason = "Could not connect";
      }
    }
    if (ok) delete failures[key];
    else failures[key] = { since: failures[key]?.since ?? new Date().toISOString(), reason, version: downloads[key]?.version ?? null };
  }
  state.fileCursor = cursor;
  state.fileFailures = failures;
  const broken = Object.keys(failures);
  const ms = Date.now() - started;
  if (broken.length) {
    return { ok: true, degraded: true, ms, detail: `${broken.length} of ${keys.length} files not answering: ${broken.join(", ")}` };
  }
  return { ok: true, ms, detail: `${keys.length} files, ${FILES_PER_RUN} checked each run` };
}

/** Per game: its newest game version and how many mods say they support it. */
export function gameSupport(releases) {
  const byGame = new Map();
  for (const release of Array.isArray(releases) ? releases : []) {
    const entry = byGame.get(release.game) ?? { game: release.game, gameName: release.gameName, mods: [] };
    entry.mods.push(release);
    byGame.set(release.game, entry);
  }
  return [...byGame.values()].map(({ game, gameName, mods }) => {
    const versions = mods.flatMap((mod) => mod.gameVersions ?? []);
    const newest = versions.length ? versions.reduce((a, b) => (compareVersions(b, a) > 0 ? b : a)) : null;
    const supporting = newest ? mods.filter((mod) => (mod.gameVersions ?? []).includes(newest)) : [];
    return {
      game,
      gameName,
      newest,
      total: mods.length,
      supporting: supporting.length,
      behind: newest ? mods.filter((mod) => !supporting.includes(mod)).map((mod) => ({ name: mod.name, path: mod.path, versions: mod.gameVersions ?? [] })) : [],
    };
  });
}

/**
 * Folds one check into the stored service entry. Returns a Discord line when the
 * service has just gone down, degraded or come back.
 */
export function applyResult(previous, service, result, now = new Date()) {
  const fails = result.ok ? 0 : (previous?.fails ?? 0) + 1;
  const status = !result.ok && fails >= FAILS_BEFORE_DOWN ? "down" : result.degraded ? "degraded" : !result.ok ? previous?.status ?? "up" : "up";
  const changed = previous && previous.status !== status;
  const since = changed || !previous ? now.toISOString() : previous.since;
  const entry = {
    name: service.name,
    group: service.group,
    status,
    fails,
    since,
    ms: result.ms ?? null,
    slow: !!result.slow,
    detail: result.detail ?? (result.ok ? null : previous?.detail ?? null),
    checkedAt: now.toISOString(),
  };
  let alert = null;
  // A quiet service only pings when it goes down or comes back from down.
  const loud = !service.quiet || status === "down" || previous?.status === "down";
  if (changed && loud) {
    if (status === "up") {
      const minutes = Math.max(1, Math.round((now - new Date(previous.since)) / 60_000));
      alert = `🟢 **${service.name}** is back up (was ${previous.status} for ${minutes} min).`;
    } else if (status === "down") {
      alert = `🔴 **${service.name}** is down: ${entry.detail ?? "no answer"}.`;
    } else {
      alert = `🟠 **${service.name}** has a problem: ${entry.detail ?? "partly working"}.`;
    }
  }
  return { entry, alert };
}

/** Runs every check and returns { state, alerts }. `tools` is false on most runs. */
export async function runChecks(fetchImpl, previousState, { now = new Date(), tools = true } = {}) {
  const state = { ...emptyState(), ...(previousState ?? {}) };
  const services = { ...state.services };
  const alerts = [];
  const bodies = {};

  const results = await Promise.all(
    SERVICES.filter((service) => service.url).map(async (service) => [service, await checkUrl(fetchImpl, service)]),
  );
  for (const [service, result] of results) {
    bodies[service.id] = result.body;
    const { entry, alert } = applyResult(services[service.id], service, result, now);
    services[service.id] = entry;
    if (alert) alerts.push(alert);
  }

  const poiService = SERVICES.find((service) => service.id === "poi");
  if (poiService) {
    const { entry, alert } = applyResult(services.poi, poiService, await checkPoi(fetchImpl, poiService), now);
    services.poi = entry;
    if (alert) alerts.push(alert);
  }

  const filesService = SERVICES.find((service) => service.id === "files");
  const files = applyResult(services.files, filesService, await checkFiles(fetchImpl, bodies.downloads, state), now);
  services.files = files.entry;
  if (files.alert) alerts.push(files.alert);

  const toolsService = SERVICES.find((service) => service.id === "tools");
  if (tools || !services.tools) {
    const { entry, alert } = applyResult(services.tools, toolsService, await checkTools(fetchImpl), now);
    services.tools = entry;
    if (alert) alerts.push(alert);
  }

  if (bodies.releases?.releases) state.games = gameSupport(bodies.releases.releases);

  const sample = { t: now.toISOString(), s: {} };
  for (const service of SERVICES) {
    if (services[service.id]) sample.s[service.id] = CODE[services[service.id].status];
  }
  state.history = [...state.history, sample].slice(-HISTORY_SIZE);
  state.services = services;
  state.checkedAt = now.toISOString();
  return { state, alerts };
}

/** Share of samples in the history where a service was up (degraded counts as up). */
export function uptime(history, id) {
  const samples = history.map((sample) => sample.s?.[id]).filter((code) => code !== undefined);
  if (!samples.length) return null;
  return samples.filter((code) => code !== CODE.down).length / samples.length;
}

/** The public JSON the page reads. */
export function publicStatus(state) {
  const services = SERVICES.filter((service) => !service.private).map((service) => {
    const entry = state.services?.[service.id];
    return {
      id: service.id,
      name: service.name,
      group: service.group,
      url: service.url ? new URL(service.url).origin : null,
      status: entry?.status ?? "unknown",
      since: entry?.since ?? null,
      ms: entry?.ms ?? null,
      slow: entry?.slow ?? false,
      detail: entry?.detail ?? null,
      uptime: uptime(state.history ?? [], service.id),
      // One value per hour, newest last: 1 up, 2 degraded, 0 down, null no data.
      hours: hourly(state.history ?? [], service.id),
    };
  });
  const statuses = services.map((service) => service.status);
  const overall = statuses.includes("down") ? "down" : statuses.includes("degraded") ? "degraded" : statuses.every((s) => s === "unknown") ? "unknown" : "up";
  return { checkedAt: state.checkedAt ?? null, overall, services, games: state.games ?? [] };
}

function hourly(history, id) {
  // Counted back from the newest sample, so the last bar is always the latest hour.
  const hours = [];
  for (let end = history.length; end > 0 && hours.length < 24; end -= 12) {
    const codes = history.slice(Math.max(0, end - 12), end).map((sample) => sample.s?.[id]).filter((code) => code !== undefined);
    hours.unshift(!codes.length ? null : codes.includes(CODE.down) ? 0 : codes.includes(CODE.degraded) ? 2 : 1);
  }
  while (hours.length < 24) hours.unshift(null);
  return hours;
}
