import assert from "node:assert/strict";
import test from "node:test";
import labels from "../src/data/report-labels.json" with { type: "json" };
import catalog from "../src/data/catalog.json" with { type: "json" };
import { buildIssueBody, handleReport, stripHtml } from "../src/report/handle.mjs";

const target = {
  gameName: "RimWorld",
  modName: "Homesteader",
  version: "1.3.0",
  labelId: "mod-label",
  gameLabelId: "game-label",
};

const catalogForTest = {
  websiteLabelId: "website-label",
  mods: { "rimworld/homesteader": target },
};

const env = {
  TURNSTILE_SECRET: "secret",
  TURNSTILE_HOSTNAMES: "127.0.0.1",
  LINEAR_API_KEY: "lin_test",
  LINEAR_TEAM_ID: "team",
};

function reportRequest(body, extraHeaders = {}) {
  return new Request("http://127.0.0.1:8787/api/report", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:8787",
      referer: "http://127.0.0.1:8787/rimworld/homesteader/",
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  game: "rimworld",
  mod: "homesteader",
  summary: "Wells stop irrigating",
  details: "The well stops sending water to the field after a save.",
  turnstileToken: "token",
};

test("stripHtml removes tags and leftover brackets", () => {
  assert.equal(stripHtml("  <b>Hello</b> <script>alert(1)</script> "), "  Hello alert(1) ");
  assert.equal(stripHtml("<img src=x onerror=alert(1)>"), "");
  assert.equal(stripHtml("a < b"), "a  b");
});

test("issue body uses cleaned text and both labels", () => {
  const issue = buildIssueBody({
    teamId: "team",
    websiteLabelId: "website-label",
    game: "rimworld",
    slug: "homesteader",
    summary: "Wells stop irrigating",
    details: "The well stops sending water.",
    target,
  });
  assert.equal(issue.variables.input.title, "Homesteader: Wells stop irrigating");
  assert.deepEqual(issue.variables.input.labelIds, ["mod-label", "game-label", "website-label"]);
  assert.equal(issue.variables.input.description.includes("<"), false);
  assert.match(issue.variables.input.description, /Version: 1\.3\.0/);
});

test("every catalog mod has a label", () => {
  for (const mod of catalog.mods) {
    const key = `${mod.game}/${mod.slug}`;
    assert.equal(typeof labels.mods[key], "string", key);
  }
});

test("missing Linear key does not call Turnstile", async () => {
  let called = false;
  const response = await handleReport(
    reportRequest(validBody),
    { ...env, LINEAR_API_KEY: "" },
    catalogForTest,
    async () => {
      called = true;
      throw new Error("should not fetch");
    },
  );
  assert.equal(response.status, 503);
  assert.equal(called, false);
});

test("rejected Turnstile does not create an issue", async () => {
  const calls = [];
  const response = await handleReport(reportRequest(validBody), env, catalogForTest, async (url) => {
    calls.push(String(url));
    return Response.json({ success: false, action: "report", hostname: "127.0.0.1" });
  });
  assert.equal(response.status, 403);
  assert.deepEqual(calls, ["https://challenges.cloudflare.com/turnstile/v0/siteverify"]);
});

test("html is stripped before the Linear issue is created", async () => {
  /** @type {string | undefined} */
  let linearBody;
  const response = await handleReport(
    reportRequest({
      ...validBody,
      summary: "<b>Wells stop</b> irrigating",
      details: "<script>alert(1)</script> The well stops sending water after a save.",
    }),
    env,
    catalogForTest,
    async (url, init) => {
      if (String(url).includes("siteverify")) {
        return Response.json({ success: true, action: "report", hostname: "127.0.0.1" });
      }
      linearBody = String(init?.body);
      return Response.json({
        data: { issueCreate: { success: true, issue: { identifier: "AZR-12" } } },
      });
    },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, { ok: true, issue: "AZR-12" });
  assert.equal(linearBody?.includes("<"), false);
  assert.match(linearBody ?? "", /Wells stop irrigating/);
  assert.match(linearBody ?? "", /mod-label/);
  assert.match(linearBody ?? "", /website-label/);
});

test("a token from another hostname is rejected", async () => {
  const response = await handleReport(reportRequest(validBody), env, catalogForTest, async () =>
    Response.json({ success: true, action: "report", hostname: "evil.example" }),
  );
  assert.equal(response.status, 403);
});

test("a report for another mod is not tagged with this page", async () => {
  let called = false;
  const response = await handleReport(
    reportRequest({ ...validBody, game: "7-days-to-die", mod: "speedometer" }),
    env,
    catalogForTest,
    async () => {
      called = true;
      throw new Error("should not fetch");
    },
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, "That report does not match this page.");
  assert.equal(called, false);
});

test("an oversized report is rejected before Turnstile", async () => {
  let called = false;
  const response = await handleReport(
    reportRequest({ ...validBody, details: "x".repeat(20_000) }),
    env,
    catalogForTest,
    async () => {
      called = true;
      throw new Error("should not fetch");
    },
  );
  assert.equal(response.status, 413);
  assert.equal(called, false);
});
