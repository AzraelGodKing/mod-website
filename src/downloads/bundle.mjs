// Joins several mod zips into one without unpacking them: each entry's
// compressed bytes are copied as they are, so the Worker spends almost no CPU.
// Every 7 Days zip holds one top-level mod folder, so names do not collide;
// if two ever do, the first one is kept.

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** @param {Uint8Array} bytes */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * The entries in a zip's central directory.
 * @param {Uint8Array} zip
 */
export function readEntries(zip) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = -1;
  // The end record sits in the last 22 bytes plus an optional comment of up to 64 KB.
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i -= 1) {
    if (view.getUint32(i, true) === END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip file");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (count === 0xffff || at === 0xffffffff) throw new Error("zip64 is not supported");
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(at, true) !== CENTRAL) throw new Error("broken central directory");
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const entry = {
      versionNeeded: view.getUint16(at + 6, true),
      flags: view.getUint16(at + 8, true),
      method: view.getUint16(at + 10, true),
      time: view.getUint16(at + 12, true),
      date: view.getUint16(at + 14, true),
      crc: view.getUint32(at + 16, true),
      compressedSize: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      externalAttributes: view.getUint32(at + 38, true),
      localOffset: view.getUint32(at + 42, true),
      name: zip.subarray(at + 46, at + 46 + nameLength),
    };
    const local = entry.localOffset;
    if (view.getUint32(local, true) !== LOCAL) throw new Error("broken local header");
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    entries.push({ ...entry, data: zip.subarray(dataStart, dataStart + entry.compressedSize) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// 1980-01-01 is the earliest DOS date; the README gets today's date.
function dosDateTime(now) {
  const time = (now.getUTCHours() << 11) | (now.getUTCMinutes() << 5) | (now.getUTCSeconds() >> 1);
  const date = ((Math.max(1980, now.getUTCFullYear()) - 1980) << 9) | ((now.getUTCMonth() + 1) << 5) | now.getUTCDate();
  return { time, date };
}

/**
 * @param {Uint8Array[]} zips
 * @param {{ name: string; text: string }[]} [extras] Small text files stored uncompressed.
 * @param {Date} [now]
 */
export function mergeZips(zips, extras = [], now = new Date()) {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const decoder = new TextDecoder();
  const seen = new Set();
  const entries = [];
  for (const { name, text } of extras) {
    const data = encoder.encode(text);
    entries.push({ versionNeeded: 10, flags: 0x800, method: 0, time, date, crc: crc32(data), compressedSize: data.length, size: data.length, externalAttributes: 0, name: encoder.encode(name), data });
  }
  for (const entry of entries) seen.add(decoder.decode(entry.name));
  for (const zip of zips) {
    for (const entry of readEntries(zip)) {
      const name = decoder.decode(entry.name);
      if (seen.has(name)) continue;
      seen.add(name);
      entries.push(entry);
    }
  }

  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    // Sizes and CRC are written in the local header, so a data descriptor is not needed.
    const flags = entry.flags & ~0x0008;
    const local = new Uint8Array(30 + entry.name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL, true);
    lv.setUint16(4, entry.versionNeeded, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, entry.method, true);
    lv.setUint16(10, entry.time, true);
    lv.setUint16(12, entry.date, true);
    lv.setUint32(14, entry.crc, true);
    lv.setUint32(18, entry.compressedSize, true);
    lv.setUint32(22, entry.size, true);
    lv.setUint16(26, entry.name.length, true);
    lv.setUint16(28, 0, true);
    local.set(entry.name, 30);

    const central = new Uint8Array(46 + entry.name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, CENTRAL, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, entry.versionNeeded, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, entry.method, true);
    cv.setUint16(12, entry.time, true);
    cv.setUint16(14, entry.date, true);
    cv.setUint32(16, entry.crc, true);
    cv.setUint32(20, entry.compressedSize, true);
    cv.setUint32(24, entry.size, true);
    cv.setUint16(28, entry.name.length, true);
    cv.setUint32(38, entry.externalAttributes, true);
    cv.setUint32(42, offset, true);
    central.set(entry.name, 46);

    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + entry.data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  if (offset + centralSize > 0xffffffff || entries.length >= 0xffff) throw new Error("bundle too large");
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, END, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export const BUNDLE_SIDES = ["server", "players"];

/**
 * Which picked mods go in the server zip and which in the players' zip.
 * "optional" mods (server, client optional) go in both.
 * @param {"server" | "client" | "both" | "optional"} installs
 * @param {"server" | "players"} side
 */
export function belongsOn(installs, side) {
  if (side === "server") return installs !== "client";
  return installs !== "server";
}

/**
 * ?mods=a,b,c into known slugs, in order, without repeats.
 * @param {string | null} value
 * @param {Set<string>} known
 */
export function pickedSlugs(value, known) {
  const picked = [];
  for (const slug of String(value ?? "").split(",")) {
    const clean = slug.trim();
    if (known.has(clean) && !picked.includes(clean)) picked.push(clean);
  }
  return picked;
}

/**
 * @param {"server" | "players"} side
 * @param {{ name: string; version: string; installs: string }[]} rows
 * @param {string[]} leftOut Names of picked mods this side does not need.
 */
export function bundleReadme(side, rows, leftOut) {
  const lines = [
    `Azrael's 7 Days to Die mods: ${side === "server" ? "server" : "player"} bundle`,
    "https://azraelsmods.com/7-days-to-die",
    "",
    side === "server"
      ? "Extract everything into the server's Mods folder, next to the other mods, then restart the server."
      : "Extract everything into your game's Mods folder (7 Days To Die/Mods), then start the game with EAC off.",
    "",
    "Included:",
    ...rows.map((row) => `- ${row.name} v${row.version} (${row.installs})`),
  ];
  if (leftOut.length) {
    lines.push("", side === "server" ? "Not needed on the server (players install these):" : "Not needed by players (server only):", ...leftOut.map((name) => `- ${name}`));
  }
  return `${lines.join("\r\n")}\r\n`;
}
