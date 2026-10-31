import { test } from "node:test";
import assert from "node:assert/strict";
import { isBot, recordDownload, siteCounts, withSiteCounts } from "../src/downloads/count.mjs";

// Just enough of D1 for the three statements count.mjs runs.
function fakeD1() {
  const rows = new Map();
  const statements = [];
  const db = {
    rows,
    statements,
    async batch(list) {
      return Promise.all(list.map((statement) => statement.run()));
    },
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) {
          args = values;
          return statement;
        },
        async run() {
          statements.push(sql);
          if (sql.startsWith("INSERT INTO site_downloads (")) {
            const [key, version, at] = args;
            const id = `${key}@${version}`;
            const row = rows.get(id) ?? { key, version, count: 0 };
            rows.set(id, { ...row, count: row.count + 1, last_at: at });
          }
          return { success: true };
        },
        async all() {
          statements.push(sql);
          const totals = new Map();
          for (const row of rows.values()) totals.set(row.key, (totals.get(row.key) ?? 0) + row.count);
          return { results: [...totals].map(([key, total]) => ({ key, total })) };
        },
      };
      return statement;
    },
  };
  return db;
}

test("clicks are counted per mod and version, and summed per mod", async () => {
  const db = fakeD1();
  await recordDownload(db, "sun-haven/the-vault", "4.3.1");
  await recordDownload(db, "sun-haven/the-vault", "4.3.1");
  await recordDownload(db, "sun-haven/the-vault", "4.3.2");
  await recordDownload(db, "7-days-to-die/spawn-tuner", "1.1.0");
  assert.equal(db.rows.get("sun-haven/the-vault@4.3.1").count, 2);
  assert.deepEqual(await siteCounts(db), { "sun-haven/the-vault": 3, "7-days-to-die/spawn-tuner": 1 });
  // The three tables are created once per database, not on every click.
  assert.equal(db.statements.filter((sql) => sql.startsWith("CREATE TABLE")).length, 3);
});

test("link previews and crawlers are not downloads", () => {
  assert.equal(isBot("Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"), true);
  assert.equal(isBot("Googlebot/2.1 (+http://www.google.com/bot.html)"), true);
  assert.equal(isBot("facebookexternalhit/1.1"), true);
  assert.equal(isBot(null), true);
  assert.equal(isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"), false);
});

test("site counts join the store snapshot", () => {
  const roster = [
    { key: "sun-haven/the-vault", game: "sun-haven" },
    { key: "sun-haven/smut", game: "sun-haven" },
    { key: "rimworld/strata", game: "rimworld" },
  ];
  const snapshot = {
    lastFetched: "2026-10-30T12:00:00.000Z",
    mods: {
      "sun-haven/the-vault": { steam: null, thunderstore: { downloads: 1300 }, nexus: { downloads: 400, unique: 350 } },
      "rimworld/strata": { steam: { subscriptions: 900 }, thunderstore: null, nexus: null },
    },
    games: {
      "sun-haven": { steam: null, thunderstore: 1300, nexus: 400, nexus_unique: 350, combined: 1700 },
      rimworld: { steam: 900, thunderstore: null, nexus: null, nexus_unique: null, combined: null },
    },
  };
  const merged = withSiteCounts(snapshot, roster, { "sun-haven/the-vault": 5, "rimworld/strata": 2 });
  assert.deepEqual(merged.mods["sun-haven/the-vault"].site, { downloads: 5 });
  assert.deepEqual(merged.mods["sun-haven/smut"].site, { downloads: 0 });
  assert.equal(merged.games["sun-haven"].site, 5);
  assert.equal(merged.games["sun-haven"].total, 1705);
  assert.equal(merged.games["sun-haven"].combined, 1700);
  // Steam subscribers are not downloads, so RimWorld's total is the site count alone.
  assert.equal(merged.games.rimworld.total, 2);

  const offline = withSiteCounts(snapshot, roster, null);
  assert.equal(offline.mods["sun-haven/the-vault"].site, null);
  assert.equal(offline.games["sun-haven"].site, null);
  assert.equal(offline.games["sun-haven"].total, 1700);
});

test("history gives daily clicks and the daily gain in store totals", async () => {
  const { historySeries } = await import("../src/downloads/count.mjs");
  const days = ["2026-10-29", "2026-10-30", "2026-10-31"];
  const series = historySeries(
    days,
    [
      { key: "sun-haven/the-vault", day: "2026-10-30", count: 3 },
      { key: "sun-haven/the-vault", day: "2026-10-31", count: 1 },
    ],
    [
      { key: "sun-haven/the-vault", day: "2026-10-28", thunderstore: 100, nexus: 50, steam: null },
      { key: "sun-haven/the-vault", day: "2026-10-29", thunderstore: 110, nexus: 52, steam: null },
      // No Nexus reading that day: the gain is Thunderstore's only.
      { key: "sun-haven/the-vault", day: "2026-10-31", thunderstore: 115, nexus: null, steam: null },
    ],
  );
  assert.deepEqual(series.days, days);
  assert.deepEqual(series.mods["sun-haven/the-vault"].site, [0, 3, 1]);
  assert.deepEqual(series.mods["sun-haven/the-vault"].store, [12, null, 5]);
});
