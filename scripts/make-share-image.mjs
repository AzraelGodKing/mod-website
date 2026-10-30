// Draws the 1200x630 picture link previews show for the home and game pages
// (mod pages use their own preview). Run: node scripts/make-share-image.mjs
// It needs Playwright with Chromium (not a site dependency).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(siteRoot, "public", "share.jpg");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const games = [
  ["RimWorld", "#c9a15b", "Farm, harden, dig."],
  ["Sun Haven", "#e8a34f", "A little brighter."],
  ["7 Days to Die", "#e07a3d", "After dark."],
];

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Red+Hat+Text:wght@400;600;700&display=block">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; color: #f4ece1; font-family: "Red Hat Text", sans-serif;
    background:
      radial-gradient(900px 420px at 6% -10%, rgba(139, 26, 43, .42), transparent 60%),
      radial-gradient(760px 380px at 96% 4%, rgba(201, 161, 91, .2), transparent 55%),
      #110e0c;
    padding: 72px 80px; display: flex; flex-direction: column; }
  .kicker { font-size: 22px; font-weight: 700; letter-spacing: .32em; text-transform: uppercase; color: #c9a15b; }
  h1 { font-family: "Cormorant Garamond", serif; font-weight: 700; font-size: 128px; line-height: 1; margin-top: 18px; letter-spacing: -.02em; }
  .lede { font-size: 32px; color: #cbbba8; margin-top: 18px; max-width: 900px; line-height: 1.3; }
  .rule { height: 1px; margin: auto 0 32px; background: linear-gradient(90deg, #c9a15b, transparent); }
  .games { display: flex; gap: 22px; }
  .game { flex: 1; padding: 20px 24px; border: 1px solid #3a3028; border-top: 4px solid var(--c); background: rgba(255,255,255,.03); }
  .game strong { display: block; font-size: 30px; font-weight: 700; }
  .game span { display: block; margin-top: 6px; font-family: "Cormorant Garamond", serif; font-size: 28px; font-style: italic; color: var(--c); }
  .url { position: absolute; right: 80px; top: 76px; font-size: 22px; color: #a89888; letter-spacing: .04em; }
</style></head><body>
  <p class="kicker">The workshop</p>
  <h1>Azrael's Mods</h1>
  <p class="lede">Free mods for RimWorld, Sun Haven, and 7 Days to Die, with direct downloads.</p>
  <p class="url">azraelsmods.com</p>
  <div class="rule"></div>
  <div class="games">
    ${games.map(([name, color, line]) => `<div class="game" style="--c:${color}"><strong>${name}</strong><span>${line}</span></div>`).join("")}
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, type: "jpeg", quality: 88 });
await browser.close();
console.log(`Wrote ${out}`);
