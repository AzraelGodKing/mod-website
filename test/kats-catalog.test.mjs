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
