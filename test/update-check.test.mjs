import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUpdates, parseInstalled, parseModInfo } from "../src/data/update-check.mjs";

const MODS = [
  { slug: "blood-moon-sound", name: "Blood Moon Sound", folder: "AzraelBloodMoonSound", version: "1.5.0" },
  { slug: "keep-backpacks", name: "Keep Backpacks", folder: "AzraelKeepBackpacks", version: "1.3.0" },
  { slug: "zombie-and-animal-bait", name: "Zombie and Animal Bait", folder: "AzraelBait", version: "1.13.0" },
];

test("ModInfo.xml gives the folder name, display name and version", () => {
  const xml = `﻿<?xml version="1.0" encoding="UTF-8" ?>\n<xml>\n\t<Name value="AzraelBloodMoonSound" />\n\t<DisplayName value="Blood Moon Sound" />\n\t<Version value="1.4.0" />\n</xml>`;
  assert.deepEqual(parseModInfo(xml), { name: "AzraelBloodMoonSound", displayName: "Blood Moon Sound", version: "1.4.0" });
  assert.equal(parseModInfo("<xml></xml>"), null);
});

test("a pasted list reads names with and without versions", () => {
  assert.deepEqual(
    parseInstalled("AzraelBloodMoonSound 1.4.0\n# a comment\nKeep Backpacks v1.3\nkeep-backpacks-1.2.0.zip\nSomeOtherMod\n\nBait (1.12.1)").map((entry) => [entry.name, entry.version]),
    [["AzraelBloodMoonSound", "1.4.0"], ["Keep Backpacks", "1.3"], ["keep-backpacks", "1.2.0"], ["SomeOtherMod", ""], ["Bait", "1.12.1"]],
  );
  const pasted = `<xml><Name value="AzraelBait" /><Version value="1.12.1" /></xml>\n<xml><Name value="Other" /><Version value="2.0" /></xml>`;
  assert.deepEqual(parseInstalled(pasted).map((entry) => entry.name), ["AzraelBait", "Other"]);
});

test("mods are matched by folder, name or slug and sorted with updates first", () => {
  const installed = parseInstalled("Keep Backpacks 1.3.0\nAzraelBloodMoonSound 1.4.0\nAzraelBait\nAnother Mod 3.0\nkeep-backpacks-1.0.0");
  const { results, others } = checkUpdates(installed, MODS, { "blood-moon-sound": "1.6.0" });
  assert.equal(others, 1);
  assert.deepEqual(
    results.map((result) => [result.slug, result.state, result.have, result.latest]),
    [
      ["blood-moon-sound", "behind", "1.4.0", "1.6.0"],
      ["zombie-and-animal-bait", "unknown", "", "1.13.0"],
      ["keep-backpacks", "current", "1.3.0", "1.3.0"],
    ],
  );
  assert.equal(checkUpdates(parseInstalled("Keep Backpacks 9.0"), MODS).results[0].state, "ahead");
});
