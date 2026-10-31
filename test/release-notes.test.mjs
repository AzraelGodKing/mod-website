import assert from "node:assert/strict";
import test from "node:test";
import {
  normName,
  parseRimworldAbout,
  parseSevendaysReadme,
  parseSunhavenChangelog,
  parseVersionedMarkdown,
  plainText,
  renderInline,
  thunderstoreRequires,
  trimLog,
} from "../scripts/release-notes.mjs";

test("versioned markdown reads bullets under each version heading", () => {
  const log = parseVersionedMarkdown(`# Changelog

Intro paragraph.

## [3.11.7]

Player-facing version 3.11.7.

### Fixed
- **Stairs:** no longer dump inventory.
- Trade works
  across floors.

## Version 3.11.6 - 2026-10-01
- Haulers stay put.
`);
  assert.deepEqual(log, [
    { version: "3.11.7", notes: ["**Stairs:** no longer dump inventory.", "**Fixed:** Trade works across floors."] },
    { version: "3.11.6", date: "2026-10-01", notes: ["Haulers stay put."] },
  ]);
});

test("the 7 Days README gives changelogs, requirements and the game version", () => {
  const readme = parseSevendaysReadme(`# 7 Days to Die mods

Every mod builds against **V3.4** (b6).

| Mod | Type | Install on | Version |
|---|---|---|---|
| [Drone Loot Filter](#drone-loot-filter) | Code (Harmony), needs Drone Automation | Server only | 1.2.0 |
| [Bait UI](#bait-ui) | Code + UI | Players only (optional, needs Bait on the server) | 1.9.0 |

## Remove Any Entity

**Changelog**
- 2.2.0: swap creatures.
- 2.0.0: renamed,
  now a code mod.

After the list.

## Bait UI

**1.9.0:** tabbed roster. **1.8.0:** thrall page.
`);
  assert.equal(readme.gameVersion, "V3.4");
  assert.deepEqual(readme.requires, { dronelootfilter: ["Drone Automation"], baitui: ["Bait"] });
  assert.deepEqual(readme.changelogs.removeanyentity, [
    { version: "2.2.0", notes: ["swap creatures."] },
    { version: "2.0.0", notes: ["renamed, now a code mod."] },
  ]);
  assert.deepEqual(readme.changelogs.baitui, [
    { version: "1.9.0", notes: ["tabbed roster."] },
    { version: "1.8.0", notes: ["thrall page."] },
  ]);
});

test("the Sun Haven changelog splits shared release notes between mods", () => {
  const log = parseSunhavenChangelog(
    `## Unreleased

**Maintenance releases: The Vault 4.3.1, Crop Optimizer 2.3.1**
- **Cleanup:** Unused code removed.
- **Crop Optimizer:** The health log is shorter.

## 2026-10-10

**The Vault (4.2.2 → 4.3.0)** — AZR-242
- **Save format:** CSVAULT3.
`,
    ["The Vault", "Crop Optimizer"],
  );
  assert.deepEqual(log.thevault, [
    { version: "4.3.1", notes: ["**Cleanup:** Unused code removed."] },
    { version: "4.3.0", date: "2026-10-10", notes: ["**Save format:** CSVAULT3."] },
  ]);
  assert.deepEqual(log.cropoptimizer, [{ version: "2.3.1", notes: ["**Cleanup:** Unused code removed.", "The health log is shorter."] }]);
});

test("names match across spellings", () => {
  assert.equal(normName("Sunhaven Todo"), normName("Sun Haven Todo"));
  assert.equal(normName("HavenDevTools"), normName("Haven Dev Tools"));
});

test("a changelog is newest first, one entry per version, and skips unreleased versions", () => {
  const log = trimLog(
    [
      { version: "1.9.0", notes: ["a"] },
      { version: "1.10.1", notes: ["unreleased"] },
      { version: "1.10.0", notes: ["b"] },
      { version: "1.9.0", notes: ["duplicate"] },
      { version: "1.8.0", notes: [] },
    ],
    "1.10.0",
  );
  assert.deepEqual(log.map((entry) => entry.version), ["1.10.0", "1.9.0"]);
  assert.deepEqual(log[1].notes, ["a"]);
});

test("RimWorld About.xml gives game versions and required mods", () => {
  const about = parseRimworldAbout(`<ModMetaData>
  <supportedVersions><li>1.6</li><li>1.7</li></supportedVersions>
  <modDependencies><li><packageId>brrainz.harmony</packageId><displayName>Harmony</displayName></li></modDependencies>
</ModMetaData>`);
  assert.deepEqual(about, { versions: ["1.6", "1.7"], requires: ["Harmony"] });
});

test("Thunderstore dependencies become readable names", () => {
  assert.deepEqual(thunderstoreRequires({ dependencies: ["BepInEx-BepInExPack-5.4.2100", "AzraelGodKing-SharedUtilities-1.0.0"] }), [
    "BepInEx 5.4",
    "Shared Utilities",
  ]);
});

test("inline markdown is escaped before it is formatted", () => {
  assert.equal(
    renderInline("**Fix:** `<b>` no longer <script>alert(1)</script> [docs](https://example.com) [bad](javascript:alert(1))"),
    '<strong>Fix:</strong> <code>&lt;b&gt;</code> no longer &lt;script&gt;alert(1)&lt;/script&gt; <a href="https://example.com" rel="noopener">docs</a> [bad](javascript:alert(1))',
  );
  assert.equal(plainText("**Fix:** `rae` and [docs](https://x.y)"), "Fix: rae and docs");
});
