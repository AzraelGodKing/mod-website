import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { announce, embedFor, messagesFor, newReleases } from "../scripts/announce-releases.mjs";

const release = (key, version, notes = []) => ({
  key,
  game: key.split("/")[0],
  gameName: "7 Days to Die",
  name: key.split("/")[1],
  version,
  uploadedAt: "2026-10-30T12:00:00.000Z",
  path: `/${key}`,
  notes,
});

function files(before, after) {
  const dir = mkdtempSync(path.join(tmpdir(), "announce-"));
  const beforeFile = path.join(dir, "before.json");
  const afterFile = path.join(dir, "after.json");
  if (before) writeFileSync(beforeFile, JSON.stringify({ releases: before }));
  writeFileSync(afterFile, JSON.stringify({ releases: after }));
  return { beforeFile: before ? beforeFile : "", afterFile };
}

test("only versions that went up are new", () => {
  const before = [release("7-days-to-die/a", "1.0.0"), release("7-days-to-die/b", "2.0.0")];
  const after = [release("7-days-to-die/a", "1.0.1"), release("7-days-to-die/b", "2.0.0"), release("7-days-to-die/c", "1.0.0")];
  assert.deepEqual(newReleases(before, after).map((entry) => entry.key), ["7-days-to-die/a", "7-days-to-die/c"]);
});

test("an embed links the changelog and keeps notes plain", () => {
  const embed = embedFor(release("7-days-to-die/spawn-tuner", "1.1.0", ["**Fix:** `st` works"]));
  assert.equal(embed.title, "spawn-tuner 1.1.0");
  assert.equal(embed.url, "https://azraelsmods.com/7-days-to-die/spawn-tuner#changelog");
  assert.equal(embed.description, "• Fix: st works");
});

test("more than ten releases are split across messages, with mentions off", () => {
  const list = Array.from({ length: 12 }, (_, at) => release(`7-days-to-die/m${at}`, "1.0.0"));
  const messages = messagesFor(list);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].embeds.length, 10);
  assert.deepEqual(messages[0].allowed_mentions, { parse: [] });
});

test("a new version is posted to the webhook", async () => {
  const posts = [];
  const { beforeFile, afterFile } = files([release("7-days-to-die/a", "1.0.0")], [release("7-days-to-die/a", "1.1.0")]);
  const count = await announce(beforeFile, afterFile, {
    webhook: "https://discord.test/hook",
    fetchImpl: async (url, init) => {
      posts.push({ url, body: JSON.parse(init.body) });
      return { ok: true };
    },
    log: () => {},
  });
  assert.equal(count, 1);
  assert.equal(posts[0].url, "https://discord.test/hook");
  assert.equal(posts[0].body.embeds[0].title, "a 1.1.0");
});

test("nothing is posted without a webhook or an earlier release list", async () => {
  const fetchImpl = async () => assert.fail("no post expected");
  const changed = files([release("7-days-to-die/a", "1.0.0")], [release("7-days-to-die/a", "1.1.0")]);
  assert.equal(await announce(changed.beforeFile, changed.afterFile, { webhook: "", fetchImpl, log: () => {} }), 0);
  const first = files(null, [release("7-days-to-die/a", "1.1.0")]);
  assert.equal(await announce(first.beforeFile, first.afterFile, { webhook: "https://discord.test/hook", fetchImpl, log: () => {} }), 0);
});

test("a catalog reset is not announced as twenty releases", async () => {
  const after = Array.from({ length: 20 }, (_, at) => release(`7-days-to-die/m${at}`, "1.0.0"));
  const { beforeFile, afterFile } = files([], after);
  const fetchImpl = async () => assert.fail("no post expected");
  assert.equal(await announce(beforeFile, afterFile, { webhook: "https://discord.test/hook", fetchImpl, log: () => {} }), 0);
});
