import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { belongsOn, bundleReadme, crc32, mergeZips, pickedSlugs, readEntries } from "../src/downloads/bundle.mjs";

// A deflated zip with data descriptors, the way some zip tools write them.
function zipOf(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0008, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(nameBytes.length, 26);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(data.length, 8);
    descriptor.writeUInt32LE(raw.length, 12);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0008, 8);
    head.writeUInt16LE(8, 10);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(data.length, 20);
    head.writeUInt32LE(raw.length, 24);
    head.writeUInt16LE(nameBytes.length, 28);
    head.writeUInt32LE(offset, 42);
    parts.push(local, nameBytes, data, descriptor);
    central.push(head, nameBytes);
    offset += local.length + nameBytes.length + data.length + descriptor.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, centralBytes, end]));
}

function contents(zip) {
  const out = {};
  for (const entry of readEntries(zip)) {
    const bytes = entry.method === 8 ? inflateRawSync(entry.data) : Buffer.from(entry.data);
    assert.equal(crc32(bytes), entry.crc);
    out[new TextDecoder().decode(entry.name)] = bytes.toString();
  }
  return out;
}

test("crc32 matches the known value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("merged zips keep every mod folder and a README, and every entry checks out", () => {
  const first = zipOf({ "KeepBackpacks/ModInfo.xml": "<a/>" });
  const second = zipOf({ "SpawnTuner/Config/x.xml": "x".repeat(5000), "SpawnTuner/ModInfo.xml": "<b/>" });
  const merged = mergeZips([first, second, first], [{ name: "README.txt", text: "hello" }]);
  assert.deepEqual(contents(merged), {
    "README.txt": "hello",
    "KeepBackpacks/ModInfo.xml": "<a/>",
    "SpawnTuner/Config/x.xml": "x".repeat(5000),
    "SpawnTuner/ModInfo.xml": "<b/>",
  });
  // The data descriptor flag is cleared, since sizes are in the local headers now.
  for (const entry of readEntries(merged)) assert.equal(entry.flags & 0x0008, 0);
});
test("server and player zips split by install side", () => {
  assert.equal(belongsOn("server", "server"), true);
  assert.equal(belongsOn("server", "players"), false);
  assert.equal(belongsOn("client", "server"), false);
  assert.equal(belongsOn("client", "players"), true);
  assert.equal(belongsOn("both", "players"), true);
  assert.equal(belongsOn("optional", "server"), true);
  assert.equal(belongsOn("optional", "players"), true);
});

test("picked slugs keep only known mods, once each", () => {
  assert.deepEqual(pickedSlugs("speedometer, nope,speedometer,gyro-safe", new Set(["speedometer", "gyro-safe"])), ["speedometer", "gyro-safe"]);
  assert.deepEqual(pickedSlugs(null, new Set(["a"])), []);
});

test("the README lists what is in the zip and what was left out", () => {
  const text = bundleReadme("server", [{ name: "Keep Backpacks", version: "1.0.0", installs: "Server only" }], ["Speedometer"]);
  assert.match(text, /server's Mods folder/);
  assert.match(text, /- Keep Backpacks v1\.0\.0 \(Server only\)/);
  assert.match(text, /Not needed on the server[^\n]*\r\n- Speedometer/);
});
