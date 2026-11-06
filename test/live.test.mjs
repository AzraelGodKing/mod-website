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
