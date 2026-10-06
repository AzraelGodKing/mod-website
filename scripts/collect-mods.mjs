import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = [
  process.env.RIMWORLD_MODS ?? path.resolve(siteRoot, "../rimworld_mods-modjson"),
  process.env.SUNHAVEN_MODS ?? path.resolve(siteRoot, "../SunhavenMod-modjson"),
  process.env.SEVENDAYS_MODS ?? path.resolve(siteRoot, "../7d2d-modjson"),
];

const manifestUrl = process.env.DOWNLOADS_MANIFEST ?? "https://downloads.azraelsmods.com/downloads.json";

function walk(dir, found) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.name === "mod.json") found.push(full);
  }
}

export function applyHostedVersions(mods, files) {
  return mods.map((mod) => {
    const hosted = files?.[`${mod.game}/${mod.slug}`];
    if (!hosted?.version || hosted.version === mod.version) return mod;
    return { ...mod, version: String(hosted.version) };
  });
}

export async function hostedFiles(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(manifestUrl);
  if (!response.ok) {
    throw new Error(`Could not read hosted downloads (${response.status}) from ${manifestUrl}`);
  }
  const manifest = await response.json();
  if (!manifest || typeof manifest.files !== "object" || manifest.files === null) {
    throw new Error(`Hosted downloads manifest has no files map: ${manifestUrl}`);
  }
  return manifest.files;
}

async function main() {
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

  if (mods.length === 0) {
    console.error("No mod.json files found in the catalog repos.");
    process.exit(1);
  }

  const files = await hostedFiles();
  const hosted = applyHostedVersions(mods, files);
  for (const mod of hosted) {
    const previous = mods.find((entry) => entry.game === mod.game && entry.slug === mod.slug);
    if (previous && previous.version !== mod.version) {
      console.log(`${mod.game}/${mod.slug} ${previous.version} -> ${mod.version}`);
    }
  }

  hosted.sort((a, b) => a.game.localeCompare(b.game) || a.name.localeCompare(b.name));
  const out = path.join(siteRoot, "src", "data", "catalog.json");
  writeFileSync(out, `${JSON.stringify({ mods: hosted }, null, 2)}\n`);
  console.log(`Wrote ${hosted.length} mods to ${out}`);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  await main();
}
