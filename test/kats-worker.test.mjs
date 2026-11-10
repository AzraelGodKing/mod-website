import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import test from "node:test";

// Workers add timingSafeEqual to crypto.subtle; Node keeps it in node:crypto.
if (!crypto.subtle.timingSafeEqual) {
  crypto.subtle.timingSafeEqual = (a, b) => timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
const { handle } = await import("../kats/src/index.ts");

function fakeBucket() {
  const store = new Map();
  const object = (value) => ({
    body: value,
    text: async () => value,
    json: async () => JSON.parse(value),
  });
  return {
    store,
    async get(key) {
      return store.has(key) ? object(store.get(key)) : null;
    },
    async head(key) {
      return store.has(key) ? {} : null;
    },
    async put(key, value) {
      store.set(key, typeof value === "string" ? value : await new Response(value).text());
    },
  };
}

function fakeAssets(files) {
  return {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (request.headers.get("if-none-match")) return new Response(null, { status: 304 });
      if (files[pathname]) return new Response(files[pathname], { headers: { "content-type": "application/json" } });
      return new Response("<!doctype html>", { headers: { "content-type": "text/html" } });
    },
  };
}

function setup({ limit = Infinity } = {}) {
  let calls = 0;
  const env = {
    CATALOG: fakeBucket(),
    ASSETS: fakeAssets({ "/data/items.json": '[["old"]]', "/data/meta.json": '{"updatedAt":"2026-09-12T00:00:00Z"}' }),
    KATS_UPLOAD_TOKEN: "secret",
    UPLOAD_LIMIT: { limit: async () => ({ success: ++calls <= limit }) },
  };
  const call = (method, path, body, password = "secret") =>
    handle(
      new Request(`https://kats.example${path}`, {
        method,
        body,
        headers: password ? { authorization: `Bearer ${password}` } : {},
      }),
      env,
    );
  return { env, call };
}

test("a revision only goes live once it is committed, and can be rolled back", async () => {
  const { env, call } = setup();
  assert.deepEqual(await (await call("GET", "/data/items.json")).json(), [["old"]]);

  const { id } = await (await call("POST", "/api/revisions")).json();
  assert.match(id, /^\d{8}T\d{6}Z-[a-z0-9]{6}$/);
  assert.equal((await call("PUT", `/api/revisions/${id}/items`, '[["new"]]')).status, 200);
  // Staged but not committed: readers still see the old list.
  assert.deepEqual(await (await call("GET", "/data/items.json")).json(), [["old"]]);

  const committed = await call(
    "POST",
    `/api/revisions/${id}/commit`,
    JSON.stringify({ counts: { items: 1 }, changes: { items: { before: 1, after: 1 } }, geneRates: { complexity: 1, metabolism: 2, archite: 3 } }),
  );
  assert.equal(committed.status, 200);
  assert.deepEqual(await (await call("GET", "/data/items.json")).json(), [["new"]]);
  const meta = await (await call("GET", "/data/meta.json")).json();
  assert.equal(meta.canRollBack, true);
  assert.deepEqual(meta.geneRates, { complexity: 1, metabolism: 2, archite: 3 });
  assert.ok(!JSON.stringify(meta).includes(id), "the public summary does not expose storage keys");

  assert.equal((await call("POST", "/api/rollback")).status, 200);
  assert.deepEqual(await (await call("GET", "/data/items.json")).json(), [["old"]]);
  assert.equal((await (await call("GET", "/data/meta.json")).json()).updatedAt, "2026-09-12T00:00:00Z");
  assert.equal((await call("POST", "/api/rollback")).status, 409);
  assert.ok(env.CATALOG.store.has("meta/current.json"));
});

test("a commit with a missing file changes nothing", async () => {
  const { call } = setup();
  const { id } = await (await call("POST", "/api/revisions")).json();
  await call("PUT", `/api/revisions/${id}/items`, "[]");
  const response = await call("POST", `/api/revisions/${id}/commit`, JSON.stringify({ counts: { items: 0, traits: 4 } }));
  assert.equal(response.status, 409);
  assert.deepEqual(await (await call("GET", "/data/items.json")).json(), [["old"]]);
});

test("uploads need the password, a known list, and a JSON array", async () => {
  const { call } = setup();
  assert.equal((await call("POST", "/api/revisions", null, "wrong")).status, 401);
  assert.equal((await call("POST", "/api/revisions", null, "")).status, 401);
  const { id } = await (await call("POST", "/api/revisions")).json();
  assert.equal((await call("PUT", `/api/revisions/${id}/viewers`, "[]")).status, 404);
  assert.equal((await call("PUT", `/api/revisions/${id}/items`, '{"not":"a list"}')).status, 400);
  assert.equal((await call("PUT", "/api/revisions/not-an-id/items", "[]")).status, 404);
  assert.equal((await call("GET", "/api/rollback")).status, 404);
});

test("too many upload attempts are turned away before the password is checked", async () => {
  const { call } = setup({ limit: 2 });
  assert.equal((await call("POST", "/api/revisions", null, "wrong")).status, 401);
  assert.equal((await call("POST", "/api/revisions", null, "wrong")).status, 401);
  assert.equal((await call("POST", "/api/revisions")).status, 429);
});

test("missing data files are a 404, not the app page, and cached copies pass through", async () => {
  const { env } = setup();
  const missing = await handle(new Request("https://kats.example/data/isekai-stats.json"), env);
  assert.equal(missing.status, 404);
  const cached = await handle(
    new Request("https://kats.example/data/isekai-stats.json", { headers: { "if-none-match": '"abc"' } }),
    env,
  );
  assert.equal(cached.status, 304);
  assert.equal((await handle(new Request("https://kats.example/data/secrets.json"), env)).status, 404);
});

test("price changes are kept as history, cleaned, and dropped again on rollback", async () => {
  const { call } = setup();
  assert.deepEqual(await (await call("GET", "/data/history.json")).json(), []);
  const { id } = await (await call("POST", "/api/revisions")).json();
  await call("PUT", `/api/revisions/${id}/items`, '[["new"]]');
  const priceLog = { items: [["Thrumbo", 5000, 4500], ["Bad row"], ["Same", 10, 10]], viewers: [["x", 1, 2]], genes: "nope" };
  assert.equal((await call("POST", `/api/revisions/${id}/commit`, JSON.stringify({ counts: { items: 1 }, priceLog }))).status, 200);
  const history = await (await call("GET", "/data/history.json")).json();
  assert.equal(history.length, 1);
  assert.deepEqual(history[0].prices, { items: [["Thrumbo", 5000, 4500]] });
  assert.ok(!JSON.stringify(history).includes(id), "the public history does not expose storage keys");
  assert.ok(!Number.isNaN(Date.parse(history[0].at)));

  assert.equal((await call("POST", "/api/rollback")).status, 200);
  assert.deepEqual(await (await call("GET", "/data/history.json")).json(), []);
});
