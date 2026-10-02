import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = [
  process.env.RIMWORLD_MODS ?? path.resolve(siteRoot, "../rimworld_mods-modjson"),
  process.env.SUNHAVEN_MODS ?? path.resolve(siteRoot, "../SunhavenMod-modjson"),
  process.env.SEVENDAYS_MODS ?? path.resolve(siteRoot, "../7d2d-modjson"),
];

function walk(dir, found) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.name === "mod.json") found.push(full);
  }
}

const catalogDir = path.join(siteRoot, "public", "catalog");
rmSync(catalogDir, { recursive: true, force: true });
mkdirSync(catalogDir, { recursive: true });

const mods = [];
for (const root of roots) {
  const files = [];
  walk(root, files);
  for (const file of files) {
    const mod = JSON.parse(readFileSync(file, "utf8"));
    const modDir = path.dirname(file);
    const images = [];
    for (const relative of mod.screenshots ?? []) {
      const source = path.join(modDir, relative);
      const destDir = path.join(catalogDir, mod.game, mod.slug);
      mkdirSync(destDir, { recursive: true });
      const filename = path.basename(relative);
      cpSync(source, path.join(destDir, filename));
      images.push(`/catalog/${mod.game}/${mod.slug}/${filename}`);
    }
    mods.push({ ...mod, images });
  }
}

mods.sort((a, b) => a.game.localeCompare(b.game) || a.name.localeCompare(b.name));
const out = path.join(siteRoot, "src", "data", "catalog.json");
writeFileSync(out, `${JSON.stringify({ mods }, null, 2)}\n`);
console.log(`Wrote ${mods.length} mods to ${out}`);
