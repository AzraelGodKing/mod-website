import { test } from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";
import { createRequest, deleteRequest, handleRequests, listAll, listPublic, setVote, updateRequest, votedBy, voterId } from "../src/requests/requests.mjs";
import { modTrend, recordDownload, recordStoreDay } from "../src/downloads/count.mjs";

const GAMES = ["rimworld", "sun-haven", "7-days-to-die"];
const env = (db) => ({ DOWNLOADS_DB: db, TURNSTILE_SECRET: "secret", TURNSTILE_HOSTNAMES: "azraelsmods.com" });
const turnstile = (action = "request") => async () => Response.json({ success: true, action, hostname: "azraelsmods.com" });

function post(path, body, ip = "203.0.113.5") {
  return new Request(`https://azraelsmods.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://azraelsmods.com", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}

test("a new request waits for approval, then shows with its first vote", async () => {
  const db = sqliteD1();
  const made = await createRequest(db, { game: "rimworld", title: "A mod for tidy stockpiles", details: "", voter: "aaa" });
  assert.match(made.id, /^[0-9a-f]{12}$/);
  assert.deepEqual(await listPublic(db), []);
  assert.equal((await listAll(db))[0].status, "pending");
  assert.equal(await setVote(db, made.id, "bbb", true), null, "no votes while it is waiting");
  assert.equal(await updateRequest(db, made.id, { status: "open", note: " Good idea " }), true);
  const [shown] = await listPublic(db);
  assert.equal(shown.votes, 1);
  assert.equal(shown.note, "Good idea");
});

test("one vote per visitor, and a vote can be taken back", async () => {
  const db = sqliteD1();
  const { id } = await createRequest(db, { game: "other", title: "Something entirely new", details: "", voter: "aaa" });
  await updateRequest(db, id, { status: "open" });
  assert.equal(await setVote(db, id, "bbb", true), 2);
  assert.equal(await setVote(db, id, "bbb", true), 2);
  assert.deepEqual(await votedBy(db, "bbb"), [id]);
  assert.equal(await setVote(db, id, "bbb", false), 1);
  assert.equal(await updateRequest(db, id, { status: "nonsense" }), false);
  await updateRequest(db, id, { status: "declined" });
  assert.deepEqual(await listPublic(db), []);
  assert.equal(await deleteRequest(db, id), true);
  assert.deepEqual(await listAll(db), []);
});

test("a visitor can only have a few requests waiting", async () => {
  const db = sqliteD1();
  for (let i = 0; i < 3; i += 1) assert.ok("id" in (await createRequest(db, { game: "rimworld", title: `Request number ${i}`, details: "", voter: "aaa" })));
  assert.deepEqual(await createRequest(db, { game: "rimworld", title: "One too many", details: "", voter: "aaa" }), { error: "busy" });
  assert.ok("id" in (await createRequest(db, { game: "rimworld", title: "Someone else", details: "", voter: "bbb" })));
});

test("the visitor id hides the address and changes with the salt", async () => {
  const request = post("/api/requests/vote", {});
  const id = await voterId(request, "salt");
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.ok(!id.includes("203"));
  assert.equal(id, await voterId(post("/api/requests/vote", {}), "salt"));
  assert.notEqual(id, await voterId(request, "other"));
});

test("the API: submit behind the check, approve, list, vote", async () => {
  const db = sqliteD1();
  const sent = await handleRequests(post("/api/requests", { game: "rimworld", title: "<b>Tidy</b> stockpiles please", details: "x", turnstileToken: "t" }), env(db), "/api/requests", GAMES, turnstile());
  assert.equal(sent.status, 200);
  const { id } = await sent.json();
  assert.equal((await listAll(db))[0].title, "Tidy stockpiles please");
  await updateRequest(db, id, { status: "planned" });

  const voted = await handleRequests(post("/api/requests/vote", { id }, "198.51.100.9"), env(db), "/api/requests/vote", GAMES);
  assert.deepEqual(await voted.json(), { ok: true, votes: 2, voted: true });

  const listed = await handleRequests(new Request("https://azraelsmods.com/api/requests", { headers: { "cf-connecting-ip": "198.51.100.9" } }), env(db), "/api/requests", GAMES);
  const body = await listed.json();
  assert.equal(body.requests[0].status, "planned");
  assert.deepEqual(body.voted, [id]);
  assert.ok(!JSON.stringify(body).includes("voter"));
});

test("the API refuses bad input", async () => {
  const db = sqliteD1();
  const call = (body, fetchImpl = turnstile()) => handleRequests(post("/api/requests", body), env(db), "/api/requests", GAMES, fetchImpl);
  assert.equal((await call({ game: "minecraft", title: "A long enough title", turnstileToken: "t" })).status, 400);
  assert.equal((await call({ game: "rimworld", title: "short", turnstileToken: "t" })).status, 400);
  assert.equal((await call({ game: "rimworld", title: "A long enough title" })).status, 403);
  assert.equal((await call({ game: "rimworld", title: "A long enough title", turnstileToken: "t" }, turnstile("report"))).status, 403);
  const elsewhere = new Request("https://azraelsmods.com/api/requests", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
  assert.equal((await handleRequests(elsewhere, env(db), "/api/requests", GAMES, turnstile())).status, 403);
  assert.equal((await handleRequests(post("/api/requests/vote", { id: "nope" }), env(db), "/api/requests/vote", GAMES)).status, 400);
  assert.equal((await handleRequests(post("/api/requests", {}), {}, "/api/requests", GAMES)).status, 503);
  assert.deepEqual(await listAll(db), []);
});

test("a mod's trend adds site clicks to the daily store gain", async () => {
  const db = sqliteD1();
  const day = (iso) => new Date(`${iso}T12:00:00Z`);
  await recordDownload(db, "rimworld/strata", "1.0.0", day("2026-11-08"));
  await recordDownload(db, "rimworld/strata", "1.0.0", day("2026-11-09"));
  await recordDownload(db, "rimworld/strata", "1.0.0", day("2026-11-09"));
  await recordDownload(db, "rimworld/other", "1.0.0", day("2026-11-09"));
  await recordStoreDay(db, { "rimworld/strata": { nexus: { downloads: 100 } } }, day("2026-11-08"));
  await recordStoreDay(db, { "rimworld/strata": { nexus: { downloads: 107 } } }, day("2026-11-09"));
  const trend = await modTrend(db, "rimworld/strata", 7, day("2026-11-10"));
  assert.equal(trend.days.length, 7);
  assert.equal(trend.days.at(-1), "2026-11-10");
  assert.deepEqual(trend.site.slice(-3), [1, 2, 0]);
  assert.deepEqual(trend.store.slice(-3), [null, 7, null]);
  assert.deepEqual(trend.total.slice(-3), [1, 9, 0]);
  assert.deepEqual((await modTrend(db, "rimworld/nothing", 7, day("2026-11-10"))).total, [0, 0, 0, 0, 0, 0, 0]);
});
