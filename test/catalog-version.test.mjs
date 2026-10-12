import assert from "node:assert/strict";
import test from "node:test";
import { catalogFingerprint } from "../scripts/collect-mods.mjs";

test("the same catalog gives the same fingerprint", () => {
  const text = `${JSON.stringify({ mods: [{ game: "rimworld", slug: "strata", version: "3.8.3" }] }, null, 2)}\n`;
  assert.equal(catalogFingerprint(text), catalogFingerprint(String(text)));
  assert.match(catalogFingerprint(text), /^[0-9a-f]{64}$/);
});

test("a version change gives a new fingerprint", () => {
  const before = JSON.stringify({ mods: [{ game: "sun-haven", slug: "the-vault", version: "4.2.0" }] });
  const after = JSON.stringify({ mods: [{ game: "sun-haven", slug: "the-vault", version: "4.3.1" }] });
  assert.notEqual(catalogFingerprint(before), catalogFingerprint(after));
});
