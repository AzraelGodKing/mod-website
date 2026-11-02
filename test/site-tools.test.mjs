import assert from "node:assert/strict";
import test from "node:test";
import {
  checkWebhook,
  optionsFor,
  parseEntities,
  parsePlaceholders,
  parseReminders,
  parseSettings,
  renderEntities,
  renderReminders,
  renderSettings,
  renderWebhookFile,
  settingSections,
} from "../src/data/config-builder.mjs";
import { checkLoadOrder, parseModList } from "../src/data/load-order.mjs";
import { parseRimworldLoadRules } from "../scripts/release-notes.mjs";

const spawns = `# Spawn Tuner
#   Density = how many enemies

#DayDensity = default
#NightDensity = default

# Zombies per player at a blood moon (4 to 64)
#BloodMoonCount = 8
`;

test("settings keep their comments and only the chosen lines change", () => {
  const fields = parseSettings(spawns);
  assert.deepEqual(fields.map((field) => field.key), ["DayDensity", "NightDensity", "BloodMoonCount"]);
  assert.deepEqual(fields[2].help, ["Zombies per player at a blood moon (4 to 64)"]);
  const out = renderSettings(spawns, { NightDensity: "4", DayDensity: null }).split("\r\n");
  assert.ok(out.includes("NightDensity = 4"));
  assert.ok(out.includes("#DayDensity = default"));
  assert.ok(out.includes("#BloodMoonCount = 8"));
  assert.ok(out.includes("#   Density = how many enemies"));
});

test("plain key=value files keep their separator", () => {
  const out = renderSettings("PlayAt=horde\nVolume=1.0\n", { Volume: "0.5\nevil=1" });
  assert.equal(out, "PlayAt=horde\r\nVolume=0.5 evil=1\r\n");
});

test("on/off values and listed options become choices", () => {
  assert.deepEqual(optionsFor({}, "Hud", "on"), ["on", "off"]);
  assert.deepEqual(optionsFor({ "*Respawn": ["slow", "fast"] }, "NightRespawn", "default"), ["slow", "fast"]);
  assert.equal(optionsFor({}, "Volume", "1.0"), null);
});

const entities = `# ---- ZOMBIE ANIMALS ----
#animalZombieDog           zombie dog
#animalCoyote              coyote
animalBear                 bear
Replacement=zombieArlene
`;

test("entities are removed, limited to biomes, or swapped", () => {
  assert.deepEqual(parseEntities(entities).map((entry) => [entry.name, entry.group, entry.active]), [
    ["animalZombieDog", "ZOMBIE ANIMALS", false],
    ["animalCoyote", "ZOMBIE ANIMALS", false],
    ["animalBear", "ZOMBIE ANIMALS", true],
  ]);
  const out = renderEntities(entities, {
    animalZombieDog: { action: "swap", target: "animalCoyote" },
    animalCoyote: { action: "biomes", biomes: ["desert", "moon"] },
    animalBear: { action: "keep" },
  }).split("\r\n");
  assert.deepEqual(out.slice(1, 4), ["animalZombieDog -> animalCoyote", "animalCoyote in desert", "#animalBear   bear"]);
  assert.equal(out[4], "Replacement=zombieArlene");
});

test("a swap to an unknown creature leaves it spawning", () => {
  const out = renderEntities(entities, { animalZombieDog: { action: "swap", target: "zombieNope" } });
  assert.match(out, /^#animalZombieDog   zombie dog$/m);
});

const about = `<ModMetaData><packageId>AzraelGodKing.Strata</packageId>
<incompatibleWith><li>telardo.MultiFloors</li></incompatibleWith>
<modDependencies><li><packageId>brrainz.harmony</packageId><displayName>Harmony</displayName></li></modDependencies>
<loadAfter><li>brrainz.harmony</li><!-- <li>commented.out</li> --><li>AzraelGodKing.Homesteader</li></loadAfter>
<loadBefore><li>some.later</li></loadBefore></ModMetaData>`;

test("About.xml load rules are read with lowercased ids", () => {
  assert.deepEqual(parseRimworldLoadRules(about), {
    packageId: "azraelgodking.strata",
    dependencies: [{ id: "brrainz.harmony", name: "Harmony" }],
    incompatible: ["telardo.multifloors"],
    loadAfter: ["brrainz.harmony", "azraelgodking.homesteader"],
    loadBefore: ["some.later"],
  });
});

test("a mod list is read from ModsConfig.xml or from lines", () => {
  assert.deepEqual(parseModList("<ModsConfigData><activeMods><li>Brrainz.Harmony</li><li>a.b_steam</li></activeMods><knownExpansions><li>x.y</li></knownExpansions></ModsConfigData>"), ["brrainz.harmony", "a.b"]);
  assert.deepEqual(parseModList("brrainz.harmony\n\n# note\nAzraelGodKing.Strata\n"), ["brrainz.harmony", "azraelgodking.strata"]);
});

test("the checker flags missing needs, clashes and load order", () => {
  const mods = [{ name: "Strata", slug: "strata", rules: parseRimworldLoadRules(about) }];
  const [result] = checkLoadOrder(["some.later", "azraelgodking.strata", "telardo.multifloors", "azraelgodking.homesteader"], mods);
  assert.deepEqual(result.problems.map((problem) => problem.level), ["error", "error", "warn", "warn"]);
  assert.match(result.problems[0].text, /Needs Harmony/);
  const [fine] = checkLoadOrder(["brrainz.harmony", "azraelgodking.homesteader", "azraelgodking.strata"], mods);
  assert.deepEqual(fine.problems, []);
  assert.deepEqual(checkLoadOrder(["brrainz.harmony"], mods), []);
});

const discord = `# In every message you can use:
#   {day}      the blood moon's day number
#   {timeleft} time left in game time, like "6 hours":
#              until the horde starts
#   {players}  names of who's online       {count}  how many are online
#   \\n         a new line

Webhook=

# ---- REMINDERS before the blood moon ----------------
#   Reminder = 3 8  | example, left alone

Reminder = 1 12 | Tomorrow · Day {day}
Reminder = 0 18 | Tonight

# ---- /BM IN GAME CHAT ----
ChatCommand=on
`;

test("discord.txt reminders are read, rewritten in place, and none writes Reminder=none", () => {
  assert.deepEqual(parseReminders(discord), [
    { days: "1", hour: "12", message: "Tomorrow · Day {day}" },
    { days: "0", hour: "18", message: "Tonight" },
  ]);
  const out = renderReminders(discord, [
    { days: 3, hour: 8, message: "Soon\\nreally" },
    { days: "x", hour: 1, message: "dropped" },
    { days: 0, hour: 21, message: "" },
  ]).split("\r\n");
  const at = out.indexOf("Reminder = 3 8 | Soon\\nreally");
  assert.ok(at > 0);
  assert.equal(out[at + 1], "Reminder = 0 21");
  assert.equal(out.filter((line) => line.startsWith("Reminder")).length, 2);
  assert.ok(out.includes("#   Reminder = 3 8  | example, left alone"));
  const none = renderReminders(discord, []).split("\r\n");
  assert.deepEqual(none.filter((line) => /^Reminder/.test(line)), ["Reminder=none"]);
  assert.deepEqual(parseReminders(none.join("\n")), []);
});

test("discord.txt webhook, sections and placeholders", () => {
  const out = renderSettings(discord, { Webhook: " https://discord.com/api/webhooks/123/abc-DEF " });
  assert.ok(out.split("\r\n").includes("Webhook=https://discord.com/api/webhooks/123/abc-DEF"));
  const sections = settingSections(discord);
  const chat = parseSettings(discord).find((field) => field.key === "ChatCommand");
  assert.equal(sections.get(chat.line), "/bm in game chat");
  const reminder = parseSettings(discord).find((field) => field.key === "Reminder");
  assert.equal(sections.get(reminder.line), "Reminders before the blood moon");
  assert.deepEqual(
    parsePlaceholders(discord).map((entry) => entry.name),
    ["{day}", "{timeleft}", "{players}", "{count}", "\\n"],
  );
  assert.match(parsePlaceholders(discord)[1].text, /until the horde starts$/);
});

test("webhook URLs are checked like the mods check them", () => {
  assert.equal(checkWebhook(""), "empty");
  assert.equal(checkWebhook("https://discord.com/api/webhooks/1234567890/aBc_d-E"), "ok");
  assert.equal(checkWebhook("https://canary.discord.com/api/webhooks/1/x?thread_id=5"), "ok");
  assert.equal(checkWebhook("https://discord.com/channels/1/2"), "bad");
  assert.equal(checkWebhook("http://discord.com/api/webhooks/1/x"), "bad");
  assert.equal(checkWebhook("https://discord.com/api/webhooks/1"), "bad");
});

test("Bait's webhook.txt keeps its comments and ends with the URL", () => {
  const shipped = "# Copy this file to webhook.txt\n# Bait posts rare tames.\n# https://discord.com/api/webhooks/...\n";
  assert.equal(
    renderWebhookFile(shipped, "https://discord.com/api/webhooks/1/x"),
    "# Copy this file to webhook.txt\r\n# Bait posts rare tames.\r\nhttps://discord.com/api/webhooks/1/x\r\n",
  );
});
