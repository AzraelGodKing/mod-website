import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compareVersions } from "../src/downloads/latest.mjs";

export { compareVersions };

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

function namedNotes(entries) {
  return (entries ?? [])
    .filter((entry) => entry?.name)
    .map((entry) => ({ name: entry.name, note: entry.note ?? "" }));
}

// A mod's shipped folder can hold its own mod.json (7 Days Bait has the game's
// XML there). Only a JSON entry with a game and slug is a catalog entry.
export function parseCatalogEntry(text) {
  try {
    // Some mod.json files are saved with a byte order mark (7 Days Gyro Safe).
    const mod = JSON.parse(text.replace(/^\uFEFF/, ""));
    return mod && typeof mod.game === "string" && typeof mod.slug === "string" ? mod : null;
  } catch {
    return null;
  }
}

function readCatalogEntry(file) {
  const mod = parseCatalogEntry(readFileSync(file, "utf8"));
  if (!mod) console.warn(`Skipping ${file}: not a catalog mod.json`);
  return mod;
}

export function guideFromSiteMod(mod) {
  if (!mod || (!Array.isArray(mod.overview) && !Array.isArray(mod.featureTabs))) return null;
  const faq = mod.stationFaq?.title
    ? {
        title: mod.stationFaq.title,
        intro: mod.stationFaq.intro ?? "",
        rows: (mod.stationFaq.rows ?? []).map((row) => ({ pair: row.pair, answer: row.answer })),
      }
    : null;
  return {
    overview: mod.overview ?? [],
    badges: mod.badges ?? [],
    sections: (mod.featureTabs ?? []).map((tab) => ({
      id: tab.id,
      label: tab.label,
      features: (tab.features ?? []).map((feature) => ({
        title: feature.title,
        body: feature.body,
        ...(feature.tag ? { tag: feature.tag } : {}),
      })),
    })),
    notes: mod.goodToKnow ?? [],
    ...(faq ? { faq } : {}),
    worksWith: namedNotes(mod.compatibility?.compatibleWith),
    avoid: namedNotes(mod.compatibility?.incompatibleWith),
    compatNotes: mod.compatibility?.notes ?? [],
  };
}

export function catalogFingerprint(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function loadRimworldGuides(rimworldRoot, fallbackFile) {
  const guides = {};
  const siteFile = path.join(rimworldRoot, "site", "src", "data", "mods.json");
  if (existsSync(siteFile)) {
    const site = JSON.parse(readFileSync(siteFile, "utf8"));
    for (const mod of site.mods ?? []) {
      const guide = guideFromSiteMod(mod);
      if (guide && mod.id) guides[`rimworld/${mod.id}`] = guide;
    }
  }
  if (fallbackFile && existsSync(fallbackFile)) {
    const extra = JSON.parse(readFileSync(fallbackFile, "utf8"));
    for (const [slug, guide] of Object.entries(extra)) {
      const key = `rimworld/${slug}`;
      if (!guides[key]) guides[key] = guide;
    }
  }
  return guides;
}

export function loadPackagedGuides(file, game) {
  if (!existsSync(file)) return {};
  const extra = JSON.parse(readFileSync(file, "utf8"));
  const guides = {};
  for (const [slug, guide] of Object.entries(extra)) guides[`${game}/${slug}`] = guide;
  return guides;
}

export function attachGuides(mods, guides) {
  return mods.map((mod) => {
    const guide = guides[`${mod.game}/${mod.slug}`];
    return guide ? { ...mod, guide } : mod;
  });
}

// The page already shows mod.version. A numeric badge left over from an older
// release (Strata "3.5") would sit next to the current version.
export function normalizeRimworldBadges(mod) {
  if (mod.game !== "rimworld" || !mod.guide?.badges) return mod;
  const badges = mod.guide.badges
    .map((badge) => (badge === "RimWorld 1.6" ? "RimWorld 1.6 · 1.7" : badge))
    .filter((badge) => !/^\d+\.\d+(\.\d+)?$/.test(badge));
  return { ...mod, guide: { ...mod.guide, badges } };
}

export function applyHostedVersions(mods, files) {
  return mods.map((mod) => {
    const hosted = files?.[`${mod.game}/${mod.slug}`];
    if (!hosted?.version) return mod;
    const uploadedAt = hosted.uploadedAt ? { uploadedAt: String(hosted.uploadedAt) } : {};
    return { ...mod, version: String(hosted.version), ...uploadedAt };
  });
}

// Parallel releases can overwrite each other's downloads.json entry, so a newer
// mod.json version counts as hosted when its zip is already in the bucket.
export async function confirmNewerUploads(mods, files, fetchImpl = globalThis.fetch) {
  const confirmed = { ...files };
  await Promise.all(
    mods.map(async (mod) => {
      const key = `${mod.game}/${mod.slug}`;
      const recorded = files?.[key]?.version;
      if (recorded && compareVersions(mod.version, recorded) <= 0) return;
      const file = `${mod.slug}-${mod.version}.zip`;
      const url = new URL(`${mod.game}/${mod.slug}/${mod.version}/${file}`, manifestUrl).href;
      const response = await fetchImpl(url, { method: "HEAD" }).catch(() => null);
      if (!response?.ok) return;
      console.log(`${key} ${mod.version} is in the bucket; downloads.json has ${recorded ?? "nothing"}`);
      const modified = Date.parse(response.headers?.get?.("last-modified") ?? "");
      const uploadedAt = Number.isNaN(modified) ? undefined : new Date(modified).toISOString();
      confirmed[key] = { ...files?.[key], version: String(mod.version), file, uploadedAt };
    }),
  );
  return confirmed;
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
      const mod = readCatalogEntry(file);
      if (!mod) continue;
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

  const guides = {
    ...loadRimworldGuides(roots[0], path.join(siteRoot, "src", "data", "rimworld-guides.json")),
    ...loadPackagedGuides(path.join(siteRoot, "src", "data", "sunhaven-guides.json"), "sun-haven"),
    ...loadPackagedGuides(path.join(siteRoot, "src", "data", "sevendays-guides.json"), "7-days-to-die"),
  };
  const guided = attachGuides(mods, guides).map(normalizeRimworldBadges);
  const files = await confirmNewerUploads(guided, await hostedFiles());
  const hosted = applyHostedVersions(guided, files);
  for (const mod of hosted) {
    const previous = mods.find((entry) => entry.game === mod.game && entry.slug === mod.slug);
    if (previous && previous.version !== mod.version) {
      console.log(`${mod.game}/${mod.slug} ${previous.version} -> ${mod.version}`);
    }
  }

  hosted.sort((a, b) => a.game.localeCompare(b.game) || a.name.localeCompare(b.name));
  const out = path.join(siteRoot, "src", "data", "catalog.json");
  const text = `${JSON.stringify({ mods: hosted }, null, 2)}\n`;
  writeFileSync(out, text);
  // Scheduled builds compare this with the live copy to decide whether to deploy.
  writeFileSync(path.join(siteRoot, "public", "catalog-version.txt"), `${catalogFingerprint(text)}\n`);
  console.log(`Wrote ${hosted.length} mods to ${out}`);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  await main();
}
