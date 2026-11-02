import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { formatStat, modDownloads, statText, statValues } from "../src/data/stat-values.mjs";
import { saveStatsSnapshot } from "../scripts/collect-mods.mjs";

const snapshot = {
  games: { rimworld: { total: 1200, steam: 900, nexus: 300 } },
  mods: {
    "sun-haven/the-vault": { site: { downloads: 10 }, thunderstore: { downloads: 1000 }, nexus: { downloads: 234, unique: 200 } },
  },
};

test("count cells read the same numbers at build time and in the browser", () => {
  const game = statValues(snapshot, "game", "rimworld");
  assert.equal(statText(game, "total"), "1,200");
  const mod = statValues(snapshot, "mod", "sun-haven/the-vault");
  assert.equal(statText(mod, "total"), "1,244");
  assert.equal(statText(mod, "combined"), "1,234");
  assert.equal(statText(mod, "nexus_full"), "234 (200 unique)");
  assert.equal(statText(mod, "steam"), "—");
  assert.equal(statText(statValues(snapshot, "mod", "sun-haven/missing"), "total"), "—");
  assert.equal(statText(statValues({}, "game", "rimworld"), "total"), "—");
});

test("list rows add site, Thunderstore and Nexus downloads", () => {
  assert.equal(modDownloads(snapshot.mods["sun-haven/the-vault"]), 1244);
  assert.equal(modDownloads(undefined), undefined);
  assert.equal(formatStat(undefined), "—");
});

test("the build saves the live counts and keeps going when they are unreachable", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "stats-"));
  const file = path.join(dir, "stats-snapshot.json");
  const ok = await saveStatsSnapshot(file, "https://example.test/api/stats", async () => new Response(JSON.stringify(snapshot)));
  assert.equal(ok, true);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), snapshot);

  const other = path.join(dir, "missing.json");
  const failed = await saveStatsSnapshot(other, "https://example.test/api/stats", async () => {
    throw new Error("offline");
  });
  assert.equal(failed, false);
  assert.equal(existsSync(other), false);
  const empty = await saveStatsSnapshot(other, "https://example.test/api/stats", async () => new Response("{}"));
  assert.equal(empty, false);
});
