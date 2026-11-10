import assert from "node:assert/strict";
import test from "node:test";
import { katsLines, modsFrom, overlaySettings } from "../live/src/feed.mjs";
import { handleApi } from "../live/src/index.ts";

test("viewer commands leave out moderator ones and disabled ones", () => {
  const rows = [
    ["givecoins", "give coins", "Give coins", "moderator", 0, 0, true, false, ""],
    ["buy", "buy", "Buy an item", "everyone", 0, 0, true, false, ""],
    ["off", "off", "Disabled", "everyone", 0, 0, false, false, ""],
  ];
  const result = katsLines("commands", rows);
  assert.deepEqual(result.lines.map((line) => line.cmd), ["!buy"]);
});

test("store lines carry the price", () => {
  const result = katsLines("store", [["Drugs", "Beer", "Beer", 12, 4000, 1, 1, 0, "Core", 1], ["Books", "Novel", "Novel", 160, 1, 0, 0, 0, "Core", 0]]);
  assert.deepEqual(result.lines, [{ cmd: "!buy Beer", text: "Drugs", cost: 12 }]);
});

test("unknown lists are refused", () => {
  assert.equal(katsLines("secrets", []), null);
});

test("mods come out sorted by game then name", () => {
  const mods = modsFrom({ releases: [{ key: "rimworld/z", game: "rimworld", gameName: "RimWorld", name: "Zed", version: "1" }, { key: "7-days-to-die/a", game: "7-days-to-die", gameName: "7 Days to Die", name: "A", version: "2" }] });
  assert.deepEqual(mods.map((mod) => mod.key), ["7-days-to-die/a", "rimworld/z"]);
});

test("overlay settings fall back to safe values", () => {
  const settings = overlaySettings(new URLSearchParams("mods=rimworld/a,../evil&show=mods,nope,kofi&every=1&pos=xx&scale=9"));
  assert.deepEqual(settings.mods, ["rimworld/a"]);
  assert.deepEqual(settings.show, ["mods", "kofi"]);
  assert.equal(settings.every, 5);
  assert.equal(settings.pos, "br");
  assert.equal(settings.scale, 2);
});

test("the API proxies only known Kat's RICS lists", async () => {
  const seen = [];
  const fetchJson = async (url) => {
    seen.push(url);
    return [["Drugs", "Beer", "Beer", 12, 4000, 1, 1, 0, "Core", 1]];
  };
  const ok = await handleApi(new URL("https://live.test/api/kats/store"), fetchJson);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).lines.length, 1);
  assert.deepEqual(seen, ["https://kats.azraelsmods.com/data/items.json"]);
  const missing = await handleApi(new URL("https://live.test/api/kats/meta"), fetchJson);
  assert.equal(missing.status, 404);
});

test("download milestones: steps, what is next, and what was just passed", async () => {
  const { bloodMoonIn, countsFrom, milestoneCrossed, milestoneFor, milestoneSteps } = await import("../live/src/feed.mjs");
  assert.deepEqual(milestoneSteps(5000), [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000]);
  assert.deepEqual(milestoneFor(0), { reached: null, next: 100, toGo: 100 });
  assert.deepEqual(milestoneFor(963), { reached: 500, next: 1000, toGo: 37 });
  assert.deepEqual(milestoneFor(1000), { reached: 1000, next: 2500, toGo: 1500 });
  assert.deepEqual(milestoneFor(120000), { reached: 100000, next: 250000, toGo: 130000 });
  assert.equal(milestoneCrossed(990, 1003), 1000);
  assert.equal(milestoneCrossed(90, 600), 500);
  assert.equal(milestoneCrossed(1003, 1010), null);
  assert.equal(milestoneCrossed(1010, 1003), null);
  assert.equal(milestoneCrossed(undefined, 1003), null);

  const total = (stats) => ({ label: stats.steamOnly ? "subscribers" : "downloads", value: stats.n });
  assert.deepEqual(countsFrom({ mods: { "a/b": { n: 12 }, "a/c": { n: 0 }, "a/d": { n: 9, steamOnly: true } } }, total), { "a/b": 12 });

  assert.deepEqual(bloodMoonIn(19), { day: 19, every: 7, daysLeft: 2, nextDay: 21 });
  assert.equal(bloodMoonIn(21).daysLeft, 0);
  assert.equal(bloodMoonIn(22).daysLeft, 6);
  assert.deepEqual(bloodMoonIn(5, 3), { day: 5, every: 3, daysLeft: 1, nextDay: 6 });
  assert.equal(bloodMoonIn(0), null);
  assert.equal(bloodMoonIn("x"), null);
});

test("the API gives download counts and the server's day", async () => {
  const fetchJson = async (url) => {
    if (url.endsWith("/api/stats")) return { mods: { "rimworld/strata": { site: { downloads: 40 }, nexus: { downloads: 960 } } } };
    if (url.endsWith("/api/poi/day")) return { day: 19, fresh: true, receivedAt: "2026-11-10T00:00:00Z" };
    throw new Error("unexpected");
  };
  const counts = await handleApi(new URL("https://live.test/api/counts"), fetchJson);
  assert.deepEqual(await counts.json(), { counts: { "rimworld/strata": 1000 } });
  const moon = await handleApi(new URL("https://live.test/api/bloodmoon"), fetchJson);
  assert.deepEqual(await moon.json(), { day: 19, fresh: true });
  const down = await handleApi(new URL("https://live.test/api/bloodmoon"), async () => { throw new Error("down"); });
  assert.equal(down.status, 502);
});
