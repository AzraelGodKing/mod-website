import assert from "node:assert/strict";
import test from "node:test";
import { buildIssuesQuery, handleIssues, publicIssues } from "../src/report/issues.mjs";

const mods = { "rimworld/strata": { modName: "Strata", labelId: "label-strata" }, "rimworld/new": { modName: "New" } };
const env = { LINEAR_API_KEY: "key", LINEAR_TEAM_ID: "team" };
const linear = (nodes, ok = true) => async () => ({ ok, status: ok ? 200 : 401, json: async () => ({ data: { issues: { nodes } } }) });
const get = (key) => new Request(`https://azraelsmods.com/api/issues?mod=${encodeURIComponent(key)}`);

test("the query filters by team, mod label and Todo or In Progress", () => {
  const { variables } = buildIssuesQuery("team", "label");
  assert.deepEqual(variables.filter, {
    team: { id: { eq: "team" } },
    labels: { id: { eq: "label" } },
    state: { type: { in: ["unstarted", "started"] } },
  });
});

test("issue titles lose the mod name prefix and any HTML", () => {
  const issues = publicIssues(
    { data: { issues: { nodes: [
      { identifier: "AZR-1", title: "Strata: <b>Crash</b> on load", state: { name: "In Progress", type: "started" }, updatedAt: "2026-11-01" },
      { identifier: "AZR-2", title: "Backlog item", state: { name: "Backlog", type: "backlog" } },
    ] } } },
    "Strata",
  );
  assert.deepEqual(issues, [{ id: "AZR-1", title: "Crash on load", status: "In Progress", started: true, updatedAt: "2026-11-01" }]);
});

test("an unknown mod is a 404", async () => {
  const response = await handleIssues(get("rimworld/nope"), env, mods, { fetch: linear([]), cache: null });
  assert.equal(response.status, 404);
});

test("a mod without its own label shows no issues and never calls Linear", async () => {
  let called = false;
  const response = await handleIssues(get("rimworld/new"), env, mods, { fetch: async () => ((called = true), null), cache: null });
  assert.deepEqual(await response.json(), { issues: [] });
  assert.equal(called, false);
});

test("the read key is preferred and the list is returned", async () => {
  let auth;
  const fetchImpl = async (_url, init) => {
    auth = init.headers.authorization;
    return linear([{ identifier: "AZR-3", title: "Strata: Typo", state: { name: "Todo", type: "unstarted" } }])();
  };
  const response = await handleIssues(get("rimworld/strata"), { ...env, LINEAR_READ_KEY: "read" }, mods, { fetch: fetchImpl, cache: null });
  assert.equal(auth, "read");
  const { issues } = await response.json();
  assert.equal(issues[0].title, "Typo");
  assert.match(response.headers.get("cache-control"), /max-age=600/);
});

test("a Linear error is an empty list that is not cached", async () => {
  const response = await handleIssues(get("rimworld/strata"), env, mods, { fetch: linear([], false), cache: null, log: () => {} });
  assert.deepEqual(await response.json(), { issues: [] });
  assert.equal(response.headers.get("cache-control"), "no-store");
});
