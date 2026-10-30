import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const commands = JSON.parse(readFileSync(new URL("../src/data/sevendays-commands.json", import.meta.url), "utf8"));

test("every command group has rows with a command and what it does", () => {
  for (const [slug, entry] of Object.entries(commands)) {
    assert.ok(entry.groups.length > 0, slug);
    for (const group of entry.groups) {
      assert.ok(group.title, slug);
      assert.ok(group.rows.length > 0, `${slug}: ${group.title}`);
      for (const row of group.rows) assert.ok(row.cmd && row.does, `${slug}: ${JSON.stringify(row)}`);
    }
  }
});
