import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { CATALOG_PAGES, chatCommand, geneCost, rowsOf, searchCatalog } from "../kats/web/src/lib/catalogs.js";
import { links } from "../kats/web/src/lib/nav.js";
import { LEGACY_PAGES, legacyPagePath } from "../kats/web/src/lib/legacy.js";
import { relativeTime } from "../kats/web/src/lib/data.js";

const data = (name) => JSON.parse(readFileSync(new URL(`../kats/web/public/data/${name}.json`, import.meta.url), "utf8"));
const router = readFileSync(new URL("../kats/web/src/router.js", import.meta.url), "utf8");

test("every menu link has a page", () => {
  for (const link of links) assert.ok(router.includes(`path: "${link.to}"`), `${link.to} has a route`);
  for (const page of LEGACY_PAGES) assert.ok(legacyPagePath(page).startsWith("/"));
  assert.equal(legacyPagePath("index"), "/");
  assert.equal(legacyPagePath("traits"), "/traits");
});

test("every catalog the pages read has rows that map cleanly", () => {
  for (const name of Object.keys(rowsOf)) {
    const rows = data(name);
    assert.ok(Array.isArray(rows) && rows.length > 0, `${name} has rows`);
    const first = rowsOf[name](rows[0]);
    assert.ok(Object.values(first).some((value) => value !== undefined && value !== ""), `${name} maps`);
  }
  const meta = data("meta");
  assert.ok(meta.updatedAt);
  assert.deepEqual(meta.geneRates, { complexity: 100, metabolism: 250, archite: 1000 });
});

test("tapping a row copies the command chat would type", () => {
  const thrumbo = rowsOf.items(["Animals", "Thrumbo", "Thrumbo", 3275, 1, 0, 0, 0, "Core", 1]);
  assert.equal(chatCommand.items(thrumbo), "!buy Thrumbo");
  assert.equal(chatCommand.items({ ...thrumbo, enabled: false }), "");
  const command = rowsOf.commands(data("commands")[0]);
  assert.equal(chatCommand.commands(command), command.enabled ? `!${command.key}` : "");
  assert.equal(geneCost({ biostatCpx: 2, biostatMet: -1, biostatArc: 1 }), 2 * 100 + 250 + 1000);
});

test("one search box finds entries across catalogs", () => {
  const items = data("items").map(rowsOf.items);
  const found = searchCatalog("items", items, "thrumbo");
  assert.ok(found.total > 0);
  assert.equal(found.hits[0].label.toLowerCase(), "thrumbo", "an exact name ranks first");
  assert.equal(searchCatalog("items", items, "t").total, 0, "one letter is not searched");
  for (const name of Object.keys(CATALOG_PAGES)) assert.ok(CATALOG_PAGES[name].link("x").path.startsWith("/"));
});

test("relative update times read naturally", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  assert.equal(relativeTime("2026-11-03T11:59:50Z", now), "just now");
  assert.equal(relativeTime("2026-11-03T09:00:00Z", now), "3 hours ago");
  assert.equal(relativeTime("2026-11-01T12:00:00Z", now), "2 days ago");
  assert.equal(relativeTime("", now), "");
});

test("the Kat's RICS site builds every page and the upload portal", () => {
  const out = mkdtempSync(path.join(tmpdir(), "kats-assets-"));
  execFileSync(process.execPath, ["kats/scripts/build-assets.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, KATS_ASSETS: out },
    stdio: "pipe",
  });
  for (const file of ["index.html", "upload.html", "portal.js", "unrar.wasm", "favicon.svg", "og.png", "robots.txt", "_headers", "data/items.json", "data/meta.json"]) {
    assert.ok(existsSync(path.join(out, file)), `${file} is built`);
  }
  const index = readFileSync(path.join(out, "index.html"), "utf8");
  assert.match(index, /og:image/);
  assert.match(index, /prefers-color-scheme: light/);
  assert.match(readFileSync(path.join(out, "upload.html"), "utf8"), /noindex/);
});

test("My coins hides what a viewer can't afford and starred rows are remembered", async () => {
  const { useBalance } = await import("../kats/web/src/composables/useBalance.js");
  const { useStars } = await import("../kats/web/src/composables/useStars.js");
  const { useFilters } = await import("../kats/web/src/composables/useFilters.js");
  const { ref } = await import("vue");

  const { balance, limit, affordable } = useBalance();
  assert.equal(limit.value, null);
  assert.equal(affordable(1_000_000), true, "an empty balance hides nothing");
  balance.value = "1,500";
  assert.equal(limit.value, 1500);
  assert.equal(affordable(1500), true);
  assert.equal(affordable(1501), false);
  balance.value = "lots";
  assert.equal(limit.value, null, "text that is not a number is ignored");
  balance.value = "";

  const stars = useStars("test-items");
  stars.toggle("Thrumbo");
  assert.equal(stars.has("Thrumbo"), true);
  assert.equal(stars.count.value, 1);
  stars.toggle("Thrumbo");
  assert.equal(stars.has("Thrumbo"), false);

  const q = ref("beer");
  const on = ref(false);
  const filters = useFilters([[q, ""], [on, true]]);
  assert.equal(filters.active.value, 2);
  filters.clear();
  assert.equal(q.value, "");
  assert.equal(on.value, true);
  assert.equal(filters.active.value, 0);
});
