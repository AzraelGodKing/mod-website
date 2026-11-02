// Draws the site icons from public/favicon.svg: favicon.ico (32px), the 180px
// apple-touch-icon, and the 192px and 512px icons the web manifest lists.
// Run: node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const svg = readFileSync(path.join(publicDir, "favicon.svg"));
const png = (size) => sharp(svg, { density: Math.ceil((72 * size) / 64) }).resize(size, size).png().toBuffer();

// An .ico file can hold a PNG as its one image.
function ico(image, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(image.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, image]);
}

writeFileSync(path.join(publicDir, "favicon.ico"), ico(await png(32), 32));
writeFileSync(path.join(publicDir, "apple-touch-icon.png"), await png(180));
writeFileSync(path.join(publicDir, "icon-192.png"), await png(192));
writeFileSync(path.join(publicDir, "icon-512.png"), await png(512));
console.log("Wrote favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png");
