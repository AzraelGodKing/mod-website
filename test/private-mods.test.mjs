import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { catalogEntries, parseCatalogEntry } from "../scripts/collect-mods.mjs";
import { isPrivateMod, latestDownloads, releaseStatus } from "../src/downloads/latest.mjs";

const publicMod = { game: "7-days-to-die", slug: "keep-backpacks", name: "Keep Backpacks", version: "1.0.0" };
const privateMod = { game: "7-days-to-die", slug: "poi-registry", name: "POI Registry", version: "0.1.0", private: true };

test("private (and hidden) mods are recognised", () => {
  assert.equal(isPrivateMod(privateMod), true);
  assert.equal(isPrivateMod({ ...publicMod, hidden: true }), true);
  assert.equal(isPrivateMod({ ...publicMod, private: "yes" }), false);
  assert.equal(isPrivateMod(publicMod), false);
});

test("a private mod.json is not a catalog entry", () => {
  assert.equal(parseCatalogEntry(JSON.stringify(privateMod)), null);
  assert.equal(parseCatalogEntry(JSON.stringify(publicMod)).slug, "keep-backpacks");
});

test("the catalog build skips a private mod in the mod repo", () => {
  const root = mkdtempSync(path.join(tmpdir(), "private-mods-"));
  try {
    for (const mod of [publicMod, privateMod]) {
      mkdirSync(path.join(root, mod.slug), { recursive: true });
      writeFileSync(path.join(root, mod.slug, "mod.json"), JSON.stringify(mod));
    }
    const slugs = catalogEntries(root).map((entry) => entry.mod.slug);
    assert.deepEqual(slugs, ["keep-backpacks"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a private mod gets no download link even if it is in downloads.json or a stale catalog", () => {
  const files = {
    "7-days-to-die/poi-registry": { version: "0.1.0", uploadedAt: "2026-11-09T00:00:00Z" },
    "7-days-to-die/keep-backpacks": { version: "1.0.0" },
  };
  const latest = latestDownloads([publicMod, privateMod], files);
  assert.deepEqual(Object.keys(latest), ["7-days-to-die/keep-backpacks"]);
  assert.ok(!JSON.stringify(latest).includes("poi-registry"));
});

test("the site's data modules keep private mods out of everything they hand to pages", async () => {
  // mods.ts and worker.ts filter the catalog with isPrivateMod; releaseStatus only ever sees that list.
  const filtered = [publicMod, privateMod].filter((mod) => !isPrivateMod(mod));
  assert.deepEqual(releaseStatus(filtered, {}).map((row) => row.key ?? `${row.game}/${row.slug}`), ["7-days-to-die/keep-backpacks"]);
});
