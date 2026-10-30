// Draws the 1280x720 preview image for each 7 Days to Die mod that has no
// picture of its own, the size Nexus and Steam show as the mod's main image.
// Run after `npm run catalog`: node scripts/make-previews.mjs [slug ...]
// It needs Playwright with Chromium (not a site dependency) and lucide-static.
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { indexInfo, installLabels } from "../src/data/sevendays-index.ts";
import { lookFor } from "../src/data/themes.ts";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const game = "7-days-to-die";
const outDir = path.join(siteRoot, "previews", game);
const require = createRequire(import.meta.url);
// Loaded through require so a global Playwright install (NODE_PATH) works too.
const { chromium } = require("playwright");

// Lucide icon names, https://lucide.dev/icons
const icons = {
  "blood-moon-sound": "moon",
  "craft-from-chests": "package-open",
  "craftable-signs": "signpost",
  "drone-loot-filter": "list-filter",
  "gyro-safe": "shield-check",
  "honk-door-fix": "megaphone",
  "keep-backpacks": "backpack",
  "no-ding-sound": "bell-off",
  "quest-disconnect-fix": "unplug",
  "remove-any-entity": "skull",
  "slot-lock-fix": "lock",
  "spawn-tuner": "sliders-horizontal",
  speedometer: "gauge",
  "upgrade-bench": "anvil",
  "zombie-and-animal-bait": "beef",
  "zombie-and-animal-bait-ui": "paw-print",
};

function icon(name) {
  const svg = readFileSync(require.resolve(`lucide-static/icons/${name}.svg`), "utf8");
  return svg.replace(/<!--[\s\S]*?-->/g, "").replace(/ class="[^"]*"/, "");
}

const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function page(mod) {
  const look = lookFor(mod.slug);
  const info = indexInfo(mod);
  const long = mod.name.length > 18;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=Barlow:wght@500;600&display=block">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1280px; height: 720px; overflow: hidden; font-family: Barlow, sans-serif; color: ${look.heroInk};
    background:
      radial-gradient(620px 520px at 82% 46%, color-mix(in srgb, ${look.accent} 34%, transparent), transparent 70%),
      radial-gradient(900px 600px at 0% 100%, rgba(0,0,0,.55), transparent 70%),
      ${look.wash}; position: relative; }
  .ghost { position: absolute; right: -150px; top: -90px; width: 760px; height: 760px; color: ${look.accent}; opacity: .07; }
  .ghost svg { width: 100%; height: 100%; stroke-width: 1.4; }
  .copy { position: absolute; left: 84px; top: 0; bottom: 64px; width: 700px; display: flex; flex-direction: column; justify-content: center; gap: 26px; }
  .kicker { font: 600 26px/1 Oswald, sans-serif; letter-spacing: .22em; text-transform: uppercase; color: ${look.accent}; }
  h1 { font: 700 ${long ? 92 : 118}px/.95 Oswald, sans-serif; text-transform: uppercase; letter-spacing: .01em; text-shadow: 0 4px 0 rgba(0,0,0,.35); }
  .short { font-size: 33px; line-height: 1.25; font-weight: 500; color: ${look.heroMuted}; max-width: 640px; }
  .chip { align-self: flex-start; padding: 10px 18px; border: 2px solid ${look.accent}; color: ${look.heroInk};
    font: 600 22px/1 Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; background: rgba(0,0,0,.28); }
  .badge { position: absolute; right: 110px; top: 160px; width: 340px; height: 340px; display: grid; place-items: center; }
  .badge .hex { position: absolute; inset: 0; width: 100%; height: 100%; }
  .badge .glyph svg { display: block; width: 190px; height: 190px; color: ${look.accent}; stroke-width: 1.6; filter: drop-shadow(0 0 18px color-mix(in srgb, ${look.accent} 60%, transparent)); }
  .brand { position: absolute; right: 84px; bottom: 64px; font: 600 20px/1 Oswald, sans-serif; letter-spacing: .3em; color: ${look.heroMuted}; opacity: .8; }
  .hazard { position: absolute; left: 0; right: 0; bottom: 0; height: 26px;
    background: repeating-linear-gradient(135deg, ${look.accent} 0 26px, #0c0a08 26px 52px); }
</style></head>
<body>
  <div class="ghost">${icon(icons[mod.slug] ?? "skull")}</div>
  <div class="badge">
    <svg class="hex" viewBox="0 0 340 340"><polygon points="85,6 255,6 336,170 255,334 85,334 4,170" fill="rgba(0,0,0,.32)" stroke="color-mix(in srgb, ${look.accent} 70%, transparent)" stroke-width="4"/></svg>
    <div class="glyph">${icon(icons[mod.slug] ?? "skull")}</div>
  </div>
  <div class="copy">
    <p class="kicker">7 Days to Die · ${escape(info.category)}</p>
    <h1>${escape(mod.name)}</h1>
    <p class="short">${escape(info.short)}</p>
    <p class="chip">${escape(installLabels[info.installs])}</p>
  </div>
  <p class="brand">AZRAEL'S MODS</p>
  <div class="hazard"></div>
</body></html>`;
}

const catalog = JSON.parse(readFileSync(path.join(siteRoot, "src", "data", "catalog.json"), "utf8"));
const wanted = new Set(process.argv.slice(2));
const mods = catalog.mods.filter((mod) => mod.game === game && (wanted.size ? wanted.has(mod.slug) : true));

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const mod of mods) {
  await tab.setContent(page(mod), { waitUntil: "networkidle" });
  await tab.evaluate(() => document.fonts.ready);
  const file = path.join(outDir, `${mod.slug}.jpg`);
  await tab.screenshot({ path: file, type: "jpeg", quality: 90 });
  console.log(`Wrote ${path.relative(siteRoot, file)}`);
}
await browser.close();
