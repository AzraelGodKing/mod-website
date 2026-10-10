import assert from "node:assert/strict";
import test from "node:test";
import { attachGuides, guideFromSiteMod } from "../scripts/collect-mods.mjs";

test("a site mod becomes a page guide", () => {
  const guide = guideFromSiteMod({
    id: "homesteader",
    overview: ["Grow it, put it by."],
    badges: ["RimWorld 1.6"],
    featureTabs: [
      {
        id: "pantry",
        label: "Winter pantry",
        features: [{ title: "Drying rack", body: "Needs no research.", tag: "Tribal" }],
      },
    ],
    goodToKnow: ["Safe to add to an existing save."],
    stationFaq: {
      title: "Which station?",
      intro: "Similar names.",
      rows: [{ pair: "Hearth vs stove", answer: "The hearth cooks." }],
    },
    compatibility: {
      compatibleWith: [{ name: "Stormproof", note: "Uses the batteries." }],
      incompatibleWith: [],
      notes: ["Harmony is required."],
    },
  });
  assert.equal(guide.sections[0].features[0].tag, "Tribal");
  assert.equal(guide.faq.rows[0].pair, "Hearth vs stove");
  assert.equal(guide.worksWith[0].name, "Stormproof");
  assert.deepEqual(guide.compatNotes, ["Harmony is required."]);
});

test("guides attach only to the matching RimWorld mod", () => {
  const mods = attachGuides(
    [
      { game: "rimworld", slug: "strata", name: "Strata" },
      { game: "sun-haven", slug: "strata", name: "Not this one" },
    ],
    { "rimworld/strata": { overview: ["Dig down."] } },
  );
  assert.deepEqual(mods[0].guide.overview, ["Dig down."]);
  assert.equal(mods[1].guide, undefined);
});
