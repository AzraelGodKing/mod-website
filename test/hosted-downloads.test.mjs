import assert from "node:assert/strict";
import test from "node:test";
import { applyHostedVersions } from "../scripts/collect-mods.mjs";

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

test("an already current hosted zip stays as it is", () => {
  const mod = { game: "rimworld", slug: "strata", version: "3.8.0" };
  const mods = applyHostedVersions([mod], { "rimworld/strata": { version: "3.8.0" } });
  assert.equal(mods[0], mod);
});
