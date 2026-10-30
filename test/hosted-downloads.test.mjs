import assert from "node:assert/strict";
import test from "node:test";
import { applyHostedVersions, compareVersions, confirmNewerUploads, parseCatalogEntry } from "../scripts/collect-mods.mjs";

function bucketWith(...urls) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: urls.includes(url) };
  };
  return { calls, fetchImpl };
}

test("a hosted zip replaces the catalog version", () => {
  const mods = applyHostedVersions(
    [{ game: "7-days-to-die", slug: "blood-moon-sound", version: "1.0.1" }],
    { "7-days-to-die/blood-moon-sound": { version: "1.1.0" } },
  );
  assert.equal(mods[0].version, "1.1.0");
});

test("a mod with no hosted zip keeps its catalog version", () => {
  const mods = applyHostedVersions([{ game: "rimworld", slug: "azrael", version: "1.2.0" }], {});
  assert.equal(mods[0].version, "1.2.0");
});

test("an already current hosted zip keeps its version and adds the upload date", () => {
  const mod = { game: "rimworld", slug: "strata", version: "3.8.0" };
  const mods = applyHostedVersions([mod], {
    "rimworld/strata": { version: "3.8.0", uploadedAt: "2026-10-11T20:36:39.603Z" },
  });
  assert.equal(mods[0].version, "3.8.0");
  assert.equal(mods[0].uploadedAt, "2026-10-11T20:36:39.603Z");
  assert.equal(mod.uploadedAt, undefined);
});

test("a hosted zip with no upload date adds none", () => {
  const mods = applyHostedVersions([{ game: "rimworld", slug: "strata", version: "3.8.0" }], {
    "rimworld/strata": { version: "3.8.0" },
  });
  assert.equal("uploadedAt" in mods[0], false);
});

test("a newer zip found in the bucket takes its date from Last-Modified", async () => {
  const fetchImpl = async () => ({
    ok: true,
    headers: new Headers({ "last-modified": "Sun, 11 Oct 2026 16:54:20 GMT" }),
  });
  const files = await confirmNewerUploads(
    [{ game: "sun-haven", slug: "the-vault", version: "4.3.1" }],
    { "sun-haven/the-vault": { version: "4.2.0", uploadedAt: "2026-10-04T19:46:02.048Z" } },
    fetchImpl,
  );
  assert.equal(files["sun-haven/the-vault"].uploadedAt, "2026-10-11T16:54:20.000Z");
});

test("a newer zip with no Last-Modified drops the older zip's date", async () => {
  const fetchImpl = async () => ({ ok: true });
  const files = await confirmNewerUploads(
    [{ game: "sun-haven", slug: "the-vault", version: "4.3.1" }],
    { "sun-haven/the-vault": { version: "4.2.0", uploadedAt: "2026-10-04T19:46:02.048Z" } },
    fetchImpl,
  );
  assert.equal(files["sun-haven/the-vault"].uploadedAt, undefined);
});

test("versions compare by number, not text", () => {
  assert.equal(compareVersions("2.1.10", "2.1.9"), 1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.1.1", "1.2.0"), -1);
});

test("a newer zip in the bucket is used when downloads.json lost its entry", async () => {
  const { fetchImpl } = bucketWith(
    "https://downloads.azraelsmods.com/sun-haven/the-vault/4.3.1/the-vault-4.3.1.zip",
  );
  const files = await confirmNewerUploads(
    [{ game: "sun-haven", slug: "the-vault", version: "4.3.1" }],
    { "sun-haven/the-vault": { version: "4.2.0", file: "the-vault-4.2.0.zip" } },
    fetchImpl,
  );
  assert.equal(files["sun-haven/the-vault"].version, "4.3.1");
  assert.equal(files["sun-haven/the-vault"].file, "the-vault-4.3.1.zip");
});

test("an unreleased version bump keeps the recorded zip", async () => {
  const { fetchImpl } = bucketWith();
  const recorded = { "7-days-to-die/craft-from-chests": { version: "1.1.2" } };
  const files = await confirmNewerUploads(
    [{ game: "7-days-to-die", slug: "craft-from-chests", version: "1.2.0" }],
    recorded,
    fetchImpl,
  );
  assert.equal(files["7-days-to-die/craft-from-chests"].version, "1.1.2");
});

test("the bucket is not asked about a version that is not newer", async () => {
  const { calls, fetchImpl } = bucketWith();
  await confirmNewerUploads(
    [
      { game: "rimworld", slug: "strata", version: "3.8.3" },
      { game: "sun-haven", slug: "smut", version: "3.1.1" },
    ],
    { "rimworld/strata": { version: "3.8.3" }, "sun-haven/smut": { version: "3.1.3" } },
    fetchImpl,
  );
  assert.deepEqual(calls, []);
});

test("a failed bucket check keeps the recorded zip", async () => {
  const fetchImpl = async () => {
    throw new Error("offline");
  };
  const files = await confirmNewerUploads(
    [{ game: "rimworld", slug: "nemesis", version: "1.5.0" }],
    { "rimworld/nemesis": { version: "1.4.0" } },
    fetchImpl,
  );
  assert.equal(files["rimworld/nemesis"].version, "1.4.0");
});

test("a mod.json saved with a byte order mark still loads", () => {
  const mod = parseCatalogEntry('\uFEFF{"game":"7-days-to-die","slug":"gyro-safe","version":"1.0.0"}');
  assert.equal(mod.slug, "gyro-safe");
});

test("a mod.json that is not a catalog entry is skipped", () => {
  assert.equal(parseCatalogEntry('<?xml version="1.0"?><xml><Name value="AzraelBait"/></xml>'), null);
  assert.equal(parseCatalogEntry('{"name":"no slug"}'), null);
});
