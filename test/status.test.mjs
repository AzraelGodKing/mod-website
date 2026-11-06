import assert from "node:assert/strict";
import test from "node:test";
import { FAILS_BEFORE_DOWN, SERVICES, applyResult, checkFiles, gameSupport, publicStatus, runChecks } from "../status/src/checks.mjs";

const releasesBody = {
  releases: [
    { key: "rimworld/a", game: "rimworld", gameName: "RimWorld", name: "A", path: "/rimworld/a", gameVersions: ["1.5", "1.6"] },
    { key: "rimworld/b", game: "rimworld", gameName: "RimWorld", name: "B", path: "/rimworld/b", gameVersions: ["1.5"] },
    { key: "sun-haven/c", game: "sun-haven", gameName: "Sun Haven", name: "C", path: "/sun-haven/c", gameVersions: [] },
  ],
};

function fakeFetch({ broken = new Set(), down = new Set() } = {}) {
  return async (url, init = {}) => {
    const href = String(url);
    if ([...down].some((host) => href.includes(host))) throw new TypeError("connect failed");
    if (href.endsWith("/releases.json")) return Response.json(releasesBody);
    if (href.endsWith("/api/downloads")) {
      return Response.json({ "rimworld/a": { version: "1", url: "https://files.test/a.zip" }, "rimworld/b": { version: "1", url: "https://files.test/b.zip" } });
    }
    if (href.startsWith("https://files.test/")) {
      assert.equal(init.method, "HEAD");
      return new Response(null, { status: broken.has(href) ? 404 : 200 });
    }
    if (href.includes("api.github.com")) {
      return Response.json({
        tag_name: "v1.0.0",
        assets: [
          { name: "X-1.0.0-Setup.exe", browser_download_url: "https://g/s", size: 1 },
          { name: "X-1.0.0-win-x64.exe", browser_download_url: "https://g/e", size: 1 },
          { name: "X-1.0.0-win-x64-framework-dependent.zip", browser_download_url: "https://g/z", size: 1 },
        ],
      });
    }
    if (href.includes("/api/stats") || href.includes("meta.json")) return Response.json({ ok: true });
    return new Response("<html></html>", { headers: { "content-type": "text/html" } });
  };
}

test("everything up gives an all-clear and no alerts", async () => {
  const { state, alerts } = await runChecks(fakeFetch(), null, { now: new Date("2026-11-06T12:00:00Z") });
  assert.deepEqual(alerts, []);
  const status = publicStatus(state);
  assert.equal(status.overall, "up");
  assert.equal(status.services.length, SERVICES.length);
  assert.ok(status.services.every((service) => service.status === "up"));
  assert.equal(status.services[0].hours.length, 24);
});

test("a service only goes down, and alerts, after repeated failures, then alerts again when back", async () => {
  let state = null;
  const alerts = [];
  for (let i = 0; i < FAILS_BEFORE_DOWN; i += 1) {
    const run = await runChecks(fakeFetch({ down: new Set(["lantern."]) }), state, { now: new Date(Date.UTC(2026, 10, 6, 12, 5 * i)), tools: false });
    state = run.state;
    alerts.push(...run.alerts);
    if (i < FAILS_BEFORE_DOWN - 1) assert.equal(state.services.lantern.status, "up");
  }
  assert.equal(state.services.lantern.status, "down");
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /Lantern\*\* is down/);
  const back = await runChecks(fakeFetch(), state, { now: new Date("2026-11-06T13:00:00Z"), tools: false });
  assert.equal(back.state.services.lantern.status, "up");
  assert.match(back.alerts[0], /Lantern\*\* is back up/);
});

test("broken mod files show as degraded and name the mod", async () => {
  const state = { fileCursor: 0, fileFailures: {} };
  const result = await checkFiles(fakeFetch({ broken: new Set(["https://files.test/b.zip"]) }), {
    "rimworld/a": { url: "https://files.test/a.zip" },
    "rimworld/b": { url: "https://files.test/b.zip" },
  }, state);
  assert.equal(result.degraded, true);
  assert.match(result.detail, /rimworld\/b/);
  assert.deepEqual(Object.keys(state.fileFailures), ["rimworld/b"]);
});

test("game support counts mods on the newest version", () => {
  const [rimworld, sunHaven] = gameSupport(releasesBody.releases);
  assert.equal(rimworld.newest, "1.6");
  assert.equal(rimworld.supporting, 1);
  assert.deepEqual(rimworld.behind.map((mod) => mod.name), ["B"]);
  assert.equal(sunHaven.newest, null);
});

test("degraded state alerts once", () => {
  const service = { name: "Mod files" };
  const first = applyResult({ status: "up", since: "2026-11-06T00:00:00Z", fails: 0 }, service, { ok: true, degraded: true, detail: "1 broken" });
  assert.equal(first.entry.status, "degraded");
  assert.match(first.alert, /has a problem/);
  const again = applyResult(first.entry, service, { ok: true, degraded: true, detail: "1 broken" });
  assert.equal(again.alert, null);
});
