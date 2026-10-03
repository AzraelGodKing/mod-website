import assert from "node:assert/strict";
import test from "node:test";
import {
  collectStats,
  nexusFrom,
  rosterFromCatalog,
  steamIdFrom,
  thunderstoreFrom,
} from "../src/stats/collect.mjs";

const catalog = [
  {
    slug: "strata",
    game: "rimworld",
    links: {
      steam: "https://steamcommunity.com/sharedfiles/filedetails/?id=3762844292",
      thunderstore: null,
      nexus: "https://www.nexusmods.com/rimworld/mods/783",
    },
  },
  {
    slug: "azrael",
    game: "rimworld",
    links: { steam: null, thunderstore: null, nexus: null },
  },
  {
    slug: "the-vault",
    game: "sun-haven",
    links: {
      steam: null,
      thunderstore: "https://thunderstore.io/c/sun-haven/p/AzraelGodKing/TheVault/",
      nexus: "https://www.nexusmods.com/sunhaven/mods/488",
    },
  },
  {
    slug: "speedometer",
    game: "7-days-to-die",
    links: { steam: null, thunderstore: null, nexus: null },
  },
];

const roster = rosterFromCatalog(catalog);

/** @param {{ steam?: number, thunderstore?: number, nexus?: Record<string, number> }} fail */
function fakeStores(fail = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("steampowered.com")) {
      if (fail.steam) return reply(fail.steam, {});
      return reply(200, {
        response: {
          publishedfiledetails: [{ publishedfileid: "3762844292", result: 1, lifetime_subscriptions: 5000 }],
        },
      });
    }
    if (url.includes("thunderstore.io")) {
      if (fail.thunderstore) return reply(fail.thunderstore, {});
      return reply(200, [
        { owner: "AzraelGodKing", name: "TheVault", versions: [{ downloads: 1000 }, { downloads: 300 }] },
        { owner: "Someone", name: "Other", versions: [{ downloads: 9 }] },
      ]);
    }
    if (url.includes("api.nexusmods.com")) {
      for (const [path, status] of Object.entries(fail.nexus ?? {})) {
        if (url.includes(path)) return reply(status, {});
      }
      if (url.includes("/rimworld/mods/783.json")) return reply(200, { mod_downloads: 800, mod_unique_downloads: 600 });
      if (url.includes("/sunhaven/mods/488.json")) return reply(200, { mod_downloads: 400, mod_unique_downloads: 350 });
    }
    return reply(404, {});
  };
  return { fetchImpl, calls };
}

test("store links become ids", () => {
  assert.equal(steamIdFrom("https://steamcommunity.com/sharedfiles/filedetails/?id=3762844292"), "3762844292");
  assert.deepEqual(thunderstoreFrom("https://thunderstore.io/c/sun-haven/p/AzraelGodKing/TheVault/"), {
    owner: "AzraelGodKing",
    name: "TheVault",
  });
  assert.deepEqual(nexusFrom("https://www.nexusmods.com/sunhaven/mods/488"), { game: "sunhaven", id: 488 });
  assert.equal(nexusFrom(null), null);
  assert.equal(roster.find((mod) => mod.key === "rimworld/azrael").steamId, null);
});

test("collects each store and totals each game", async () => {
  const { fetchImpl, calls } = fakeStores();
  const snapshot = await collectStats(roster, { fetch: fetchImpl, nexusKey: "key", now: new Date(0) });

  assert.deepEqual(snapshot.mods["rimworld/strata"], {
    steam: { subscriptions: 5000 },
    thunderstore: null,
    nexus: { downloads: 800, unique: 600 },
  });
  assert.deepEqual(snapshot.mods["rimworld/azrael"], { steam: null, thunderstore: null, nexus: null });
  assert.deepEqual(snapshot.mods["sun-haven/the-vault"].thunderstore, { downloads: 1300 });

  assert.deepEqual(snapshot.games.rimworld, {
    steam: 5000,
    thunderstore: null,
    nexus: 800,
    nexus_unique: 600,
    combined: 800,
  });
  assert.equal(snapshot.games["sun-haven"].combined, 1700);
  assert.equal(snapshot.games["7-days-to-die"].nexus, null);
  assert.equal(snapshot.lastFetched, "1970-01-01T00:00:00.000Z");

  const nexusCall = calls.find((call) => call.url.includes("api.nexusmods.com"));
  assert.equal(nexusCall.init.headers.apikey, "key");
  assert.equal(calls.filter((call) => call.url.includes("steampowered.com")).length, 1);
});

test("a failed store keeps the previous counts", async () => {
  const first = await collectStats(roster, { fetch: fakeStores().fetchImpl, nexusKey: "key" });
  const logs = [];
  const { fetchImpl } = fakeStores({ steam: 503, thunderstore: 500, nexus: { "/sunhaven/mods/488.json": 429 } });
  const second = await collectStats(roster, {
    fetch: fetchImpl,
    nexusKey: "key",
    previous: first,
    log: (message) => logs.push(message),
  });

  assert.deepEqual(second.mods["rimworld/strata"].steam, { subscriptions: 5000 });
  assert.deepEqual(second.mods["sun-haven/the-vault"].thunderstore, { downloads: 1300 });
  assert.deepEqual(second.mods["sun-haven/the-vault"].nexus, { downloads: 400, unique: 350 });
  assert.deepEqual(second.mods["rimworld/strata"].nexus, { downloads: 800, unique: 600 });
  assert.equal(logs.length, 3);
});

test("without a Nexus key, Nexus is not called and cached counts stay", async () => {
  const first = await collectStats(roster, { fetch: fakeStores().fetchImpl, nexusKey: "key" });
  const { fetchImpl, calls } = fakeStores();
  const second = await collectStats(roster, { fetch: fetchImpl, previous: first });

  assert.equal(calls.some((call) => call.url.includes("api.nexusmods.com")), false);
  assert.deepEqual(second.mods["rimworld/strata"].nexus, { downloads: 800, unique: 600 });
  assert.equal(second.games["sun-haven"].nexus, 400);
});
