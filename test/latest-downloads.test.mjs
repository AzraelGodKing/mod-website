import assert from "node:assert/strict";
import test from "node:test";
import { fetchManifestFiles, latestDownloads } from "../src/downloads/latest.mjs";

const strata = { game: "rimworld", slug: "strata", version: "3.11.0", uploadedAt: "2026-10-11T20:36:39.603Z" };

test("a newer release in downloads.json replaces the build's version", () => {
  const latest = latestDownloads([strata], {
    "rimworld/strata": { version: "3.12.0", uploadedAt: "2026-10-29T08:00:00.000Z" },
  });
  assert.deepEqual(latest["rimworld/strata"], {
    version: "3.12.0",
    file: "strata-3.12.0.zip",
    url: "https://downloads.azraelsmods.com/rimworld/strata/3.12.0/strata-3.12.0.zip",
    uploadedAt: "2026-10-29T08:00:00.000Z",
  });
});

test("an older downloads.json entry does not roll the build's version back", () => {
  const latest = latestDownloads([strata], { "rimworld/strata": { version: "3.10.0" } });
  assert.equal(latest["rimworld/strata"].version, "3.11.0");
  assert.equal(latest["rimworld/strata"].uploadedAt, strata.uploadedAt);
});

test("versions compare by number, so 3.10.0 is newer than 3.9.0", () => {
  const latest = latestDownloads([{ ...strata, version: "3.9.0" }], { "rimworld/strata": { version: "3.10.0" } });
  assert.equal(latest["rimworld/strata"].version, "3.10.0");
});

test("without a manifest the build's version is used", () => {
  const latest = latestDownloads([strata], null);
  assert.equal(latest["rimworld/strata"].file, "strata-3.11.0.zip");
});

test("mods with no public zip are left out", () => {
  const latest = latestDownloads([{ game: "rimworld", slug: "azrael", version: "1.0.0" }], {
    "rimworld/azrael": { version: "2.0.0" },
  });
  assert.equal("rimworld/azrael" in latest, false);
});

test("a failed manifest read returns null instead of throwing", async () => {
  const quiet = () => {};
  assert.equal(await fetchManifestFiles(async () => ({ ok: false, status: 503 }), quiet), null);
  assert.equal(await fetchManifestFiles(async () => { throw new Error("offline"); }, quiet), null);
  assert.equal(await fetchManifestFiles(async () => ({ ok: true, json: async () => ({}) }), quiet), null);
});

test("the manifest's files map is returned", async () => {
  const files = { "rimworld/strata": { version: "3.12.0" } };
  const read = await fetchManifestFiles(async () => ({ ok: true, json: async () => ({ files }) }));
  assert.deepEqual(read, files);
});

test("release status compares downloads.json with the build", async () => {
  const { releaseStatus } = await import("../src/downloads/latest.mjs");
  const mods = [
    strata,
    { game: "rimworld", slug: "spark", version: "1.2.0" },
    { game: "rimworld", slug: "old", version: "2.0.0" },
    { game: "rimworld", slug: "fresh", version: "1.0.0" },
    { game: "rimworld", slug: "azrael", version: "1.0.0" },
  ];
  const files = {
    "rimworld/strata": { version: "3.11.0" },
    "rimworld/old": { version: "1.9.0" },
    "rimworld/fresh": { version: "1.1.0", uploadedAt: "2026-10-29T08:00:00.000Z" },
  };
  const states = Object.fromEntries(releaseStatus(mods, files).map((row) => [row.key, row.state]));
  assert.deepEqual(states, {
    "rimworld/strata": "live",
    "rimworld/spark": "build-only",
    "rimworld/old": "behind",
    "rimworld/fresh": "newer",
    "rimworld/azrael": "not-ready",
  });
  assert.equal(releaseStatus([strata], null)[0].state, "unknown");
});
