import assert from "node:assert/strict";
import test from "node:test";
import { buildCatalog, classifyPath } from "../kats/portal/catalog.mjs";

test("private export files are not published", () => {
  assert.equal(classifyPath("CAP_ChatInteractive/viewers.json").action, "skip");
  assert.equal(classifyPath("CAP_ChatInteractive/Backups/RICS_Settings_LatestBackup.json").action, "skip");
  assert.equal(classifyPath("CAP_ChatInteractive/AI_Commands/incoming/note.json").action, "skip");
  assert.equal(classifyPath("CAP_ChatInteractive/StoreItems.json").name, "items");
});

test("a CAP export becomes catalog rows and drops viewers", () => {
  const built = buildCatalog([
    {
      path: "CAP_ChatInteractive/StoreItems.json",
      text: JSON.stringify({
        items: {
          wood: {
            DefName: "WoodLog",
            Category: "Resources",
            BasePrice: 1.2,
            QuantityLimit: null,
            IsUsable: false,
            IsEquippable: false,
            IsWearable: false,
            Mod: "Core",
            Enabled: true,
            CustomName: "",
          },
        },
      }),
    },
    {
      path: "CAP_ChatInteractive/viewers.json",
      text: JSON.stringify({ total: 1, viewers: { secret: true } }),
    },
    {
      path: "CAP_ChatInteractive/Backups/RICS_Settings_LatestBackup.json",
      text: JSON.stringify({ TwitchSettings: { token: "nope" } }),
    },
  ]);

  assert.deepEqual(JSON.parse(built.files.items), [
    ["Resources", "WoodLog", "WoodLog", 1.2, 0, 0, 0, 0, "Core", 1],
  ]);
  assert.equal(built.files.viewers, undefined);
  assert.equal(built.skipped.length, 2);
});

test("gene and backstory exports are separate from the CAP rar", () => {
  const built = buildCatalog([
    {
      path: "Genes.json",
      text: JSON.stringify({
        items: {
          gene: {
            Label: "Strong",
            DefName: "Strong",
            DisplayCategory: "Strength",
            DisplayCategoryLabel: "Strength",
            BiostatCpx: 1,
            BiostatMet: -1,
            BiostatArc: 0,
            MarketValueFactor: 1,
            FromTemplate: false,
            ModSource: "Biotech",
            Description: "Stronger.",
          },
        },
      }),
    },
  ]);
  assert.equal(built.counts.genes, 1);
  assert.equal(built.files.items, undefined);
});

test("gene edit rates come from the geneedit command settings", async () => {
  const { geneRatesFrom } = await import("../kats/portal/catalog.mjs");
  assert.deepEqual(
    geneRatesFrom({ geneedit: { CustomData: JSON.stringify({ complexity: "120", metabolism: "250", archite: "1500" }) } }),
    { complexity: 120, metabolism: 250, archite: 1500 },
  );
  assert.equal(geneRatesFrom({ geneedit: { CustomData: "" } }), null);
  assert.equal(geneRatesFrom({ geneedit: { CustomData: "{nope" } }), null);
  const built = buildCatalog([
    {
      path: "CAP_ChatInteractive/CommandSettings.json",
      text: JSON.stringify({
        geneedit: { Label: "geneedit", Enabled: true, CustomData: JSON.stringify({ complexity: "100", metabolism: "250", archite: "1000" }) },
      }),
    },
  ]);
  assert.deepEqual(built.geneRates, { complexity: 100, metabolism: 250, archite: 1000 });
});

test("a new export is compared with the live catalog", async () => {
  const { diffCatalog, hasChanges } = await import("../kats/portal/catalog.mjs");
  const before = [
    ["Animals", "Thrumbo", "Thrumbo", 3000, 1, 0, 0, 0, "Core", 1],
    ["Food", "Beer", "Beer", 12, 0, 1, 0, 0, "Core", 1],
    ["Books", "Textbook", "TextBook", 160, 1, 0, 0, 0, "Core", 0],
  ];
  const after = [
    ["Animals", "Thrumbo", "Thrumbo", 3275, 1, 0, 0, 0, "Core", 1],
    ["Food", "Beer", "Beer", 12, 0, 1, 0, 0, "Core", 0],
    ["Test", "Test thing", "ZZTest", 42, 5, 1, 0, 0, "Test", 1],
  ];
  const diff = diffCatalog("items", before, after);
  assert.equal(diff.before, 3);
  assert.equal(diff.after, 3);
  assert.deepEqual(diff.added.list, ["Test thing"]);
  assert.deepEqual(diff.removed.list, ["Textbook"]);
  assert.deepEqual(diff.prices.list, [{ name: "Thrumbo", from: 3000, to: 3275 }]);
  assert.deepEqual(diff.disabled.list, ["Beer"]);
  assert.equal(hasChanges(diff), true);
  assert.equal(hasChanges(diffCatalog("items", after, after)), false);
  assert.equal(diffCatalog("items", null, after), null);
});
