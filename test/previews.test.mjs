import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { findPreview, imageSize } from "../scripts/collect-mods.mjs";

test("a store icon is found before the drawn preview", () => {
  const root = mkdtempSync(path.join(tmpdir(), "previews-"));
  const modDir = path.join(root, "TheVault");
  mkdirSync(path.join(modDir, "thunderstore"), { recursive: true });
  writeFileSync(path.join(modDir, "thunderstore", "icon.png"), "");
  mkdirSync(path.join(root, "drawn", "sun-haven"), { recursive: true });
  writeFileSync(path.join(root, "drawn", "sun-haven", "the-vault.jpg"), "");
  const found = findPreview(modDir, { game: "sun-haven", slug: "the-vault" }, path.join(root, "drawn"));
  assert.equal(found.relative, "thunderstore/icon.png");
});

test("a mod with no picture of its own gets the drawn preview", () => {
  const root = mkdtempSync(path.join(tmpdir(), "previews-"));
  mkdirSync(path.join(root, "drawn", "7-days-to-die"), { recursive: true });
  writeFileSync(path.join(root, "drawn", "7-days-to-die", "gyro-safe.jpg"), "");
  const mod = { game: "7-days-to-die", slug: "gyro-safe" };
  assert.equal(findPreview(root, mod, path.join(root, "drawn")).relative, "gyro-safe.jpg");
  assert.equal(findPreview(root, { ...mod, slug: "new-mod" }, path.join(root, "drawn")), null);
});

test("the drawn 7 Days to Die previews are 1280x720", () => {
  const dir = new URL("../previews/7-days-to-die/", import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith(".jpg"));
  assert.ok(files.length > 0);
  for (const name of files) assert.deepEqual(imageSize(readFileSync(new URL(name, dir))), { width: 1280, height: 720 }, name);
});

test("image sizes come from PNG headers", () => {
  const png = Buffer.alloc(24);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(256, 16);
  png.writeUInt32BE(256, 20);
  assert.deepEqual(imageSize(png), { width: 256, height: 256 });
  assert.equal(imageSize(Buffer.from("not an image")), null);
});
