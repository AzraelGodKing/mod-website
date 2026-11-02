import assert from "node:assert/strict";
import test from "node:test";
import { compactNumber, downloadTotal, parseBadgePath, renderBadge, textWidth } from "../src/badges/badge.mjs";

test("badge paths name the game, the mod and the kind", () => {
  assert.deepEqual(parseBadgePath("/badge/rimworld/strata.svg"), { game: "rimworld", slug: "strata", kind: "downloads" });
  assert.deepEqual(parseBadgePath("/badge/7-days-to-die/keep-backpacks/version.svg"), {
    game: "7-days-to-die",
    slug: "keep-backpacks",
    kind: "version",
  });
  assert.equal(parseBadgePath("/badge/rimworld/strata"), null);
  assert.equal(parseBadgePath("/badge/rimworld/../x.svg"), null);
  assert.equal(parseBadgePath("/badge/rimworld/strata/other.svg"), null);
});

test("counts are shortened like shields.io", () => {
  assert.equal(compactNumber(0), "0");
  assert.equal(compactNumber(950), "950");
  assert.equal(compactNumber(1000), "1k");
  assert.equal(compactNumber(1234), "1.2k");
  assert.equal(compactNumber(25300), "25k");
  assert.equal(compactNumber(1_250_000), "1.3M");
});

test("downloads add the site, Thunderstore and Nexus, and leave Steam out", () => {
  assert.deepEqual(
    downloadTotal({ site: { downloads: 10 }, thunderstore: { downloads: 100 }, nexus: { downloads: 5 }, steam: { subscriptions: 9999 } }),
    { label: "downloads", value: 115 },
  );
});

test("a Steam-only mod shows subscribers", () => {
  assert.deepEqual(downloadTotal({ site: { downloads: 0 }, steam: { subscriptions: 4200 } }), { label: "subscribers", value: 4200 });
  assert.deepEqual(downloadTotal({ site: { downloads: 0 }, thunderstore: null, nexus: null, steam: null }), {
    label: "downloads",
    value: 0,
  });
  assert.equal(downloadTotal(undefined), null);
});

test("the badge is a sized SVG with escaped text", () => {
  const svg = renderBadge("downloads", "1.2k", "#4c9a52");
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+" height="20"/);
  assert.match(svg, /aria-label="downloads: 1.2k"/);
  const width = Number(svg.match(/width="(\d+)"/)[1]);
  assert.equal(width, textWidth("downloads") + textWidth("1.2k") + 24);
  assert.match(renderBadge("a<b", "&", "#000"), /a&#60;b/);
  assert.doesNotMatch(renderBadge("a<b", "&", "#000"), /<b/);
});
