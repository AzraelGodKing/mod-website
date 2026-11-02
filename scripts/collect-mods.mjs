import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NOT_READY, compareVersions } from "../src/downloads/latest.mjs";
import { releaseNotesReader } from "./release-notes.mjs";

export { compareVersions };

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = [
  process.env.RIMWORLD_MODS ?? path.resolve(siteRoot, "../rimworld_mods-modjson"),
  process.env.SUNHAVEN_MODS ?? path.resolve(siteRoot, "../SunhavenMod-modjson"),
  process.env.SEVENDAYS_MODS ?? path.resolve(siteRoot, "../7d2d-modjson"),
];

const manifestUrl = process.env.DOWNLOADS_MANIFEST ?? "https://downloads.azraelsmods.com/downloads.json";
const statsUrl = process.env.STATS_URL ?? "https://azraelsmods.com/api/stats";

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

// Steam needs About/Preview.png and Thunderstore an icon.png, so a mod that
// lists no screenshots still has a picture. A mod with neither gets the one
// drawn by scripts/make-previews.mjs in previews/.
const PREVIEW_FILES = ["About/Preview.png", "preview.png", "Preview.png", "thunderstore/icon.png", "icon.png"];

export function findPreview(modDir, mod, previewsDir) {
  for (const relative of PREVIEW_FILES) {
    if (existsSync(path.join(modDir, relative))) return { relative, source: path.join(modDir, relative) };
  }
  const drawn = path.join(previewsDir, mod.game, `${mod.slug}.jpg`);
  return existsSync(drawn) ? { relative: `${mod.slug}.jpg`, source: drawn } : null;
}

// Width and height from a PNG or JPEG header, so pages can tell a square icon
// from a wide poster without loading the image.
export function imageSize(buffer) {
  if (buffer.length >= 24 && buffer.toString("ascii", 12, 16) === "IHDR") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < buffer.length && buffer[at] === 0xff) {
    const marker = buffer[at + 1];
    const length = buffer.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buffer.readUInt16BE(at + 7), height: buffer.readUInt16BE(at + 5) };
    }
    at += 2 + length;
  }
  return null;
}

// The list rows show the preview at about 76px wide, so they get a small WebP
// instead of the full poster. Square icons stay square. Without sharp the rows
// fall back to the full image.
export async function writeThumb(source, dest, square) {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return false;
  }
  try {
    const image = sharp(source);
    await (square ? image.resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }) : image.resize(240, 150, { fit: "cover" }))
      .webp({ quality: 78 })
      .toFile(dest);
    return true;
  } catch (error) {
    console.warn(`Could not make a thumbnail from ${source}: ${error.message}`);
    return false;
  }
}

// Mod pages show the wide poster at up to about 1100px, so they get a WebP copy
// instead of the full PNG. Link previews keep the original file.
// Phones get a 640px copy through srcset.
export async function writePoster(source, dest, width = 1280) {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return false;
  }
  try {
    await sharp(source).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(dest);
    return true;
  } catch (error) {
    console.warn(`Could not make a poster from ${source}: ${error.message}`);
    return false;
  }
}

// Pages ship with the latest download counts so they show at once; the browser
// still refreshes them. When the live site cannot be reached, the last saved
// snapshot stays, or the pages show "—" until the browser loads the numbers.
export async function saveStatsSnapshot(file, url = statsUrl, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = await response.json();
    if (!snapshot || typeof snapshot !== "object" || (!snapshot.mods && !snapshot.games)) throw new Error("no counts in the response");
    writeFileSync(file, `${JSON.stringify(snapshot)}\n`);
    return true;
  } catch (error) {
    console.warn(`Download counts not saved (${error.message}); pages load them in the browser.`);
    return false;
  }
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
    // The zip's checksum and size are shown beside the download button.
    const sha256 = typeof hosted.sha256 === "string" && /^[0-9a-f]{64}$/i.test(hosted.sha256) ? { sha256: hosted.sha256.toLowerCase() } : {};
    const bytes = Number.isFinite(Number(hosted.bytes)) && Number(hosted.bytes) > 0 ? { bytes: Number(hosted.bytes) } : {};
    return { ...mod, version: String(hosted.version), ...uploadedAt, ...sha256, ...bytes };
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
      // The recorded checksum and size belong to the older zip.
      const { sha256: _oldSha, bytes: _oldBytes, ...rest } = files?.[key] ?? {};
      const length = Number(response.headers?.get?.("content-length"));
      const sum = await fetchImpl(`${url}.sha256`)
        .then((res) => (res?.ok ? res.text() : ""))
        .catch(() => "");
      const sha256 = String(sum).trim().split(/\s+/)[0];
      confirmed[key] = {
        ...rest,
        version: String(mod.version),
        file,
        uploadedAt,
        ...(/^[0-9a-f]{64}$/i.test(sha256) ? { sha256 } : {}),
        ...(length > 0 ? { bytes: length } : {}),
      };
    }),
  );
  return confirmed;
}

// Changelog versions older than the current one whose zip is still in the bucket.
// Their changelog entries get a Download link. A failed check just leaves the link off.
export async function attachOlderDownloads(mods, fetchImpl = globalThis.fetch) {
  return Promise.all(
    mods.map(async (mod) => {
      if (NOT_READY.has(`${mod.game}/${mod.slug}`)) return mod;
      const older = [...new Set((mod.changelog ?? []).map((entry) => String(entry.version)))].filter(
        (version) => /^\d+(\.\d+){0,3}$/.test(version) && compareVersions(version, mod.version) < 0,
      );
      if (older.length === 0) return mod;
      const found = await Promise.all(
        older.map(async (version) => {
          const url = new URL(`${mod.game}/${mod.slug}/${version}/${mod.slug}-${version}.zip`, manifestUrl).href;
          const response = await fetchImpl(url, { method: "HEAD" }).catch(() => null);
          return response?.ok ? version : null;
        }),
      );
      const olderDownloads = found.filter(Boolean);
      return olderDownloads.length ? { ...mod, olderDownloads } : mod;
    }),
  );
}

// The shipped config file of the 7 Days mods listed in sevendays-configs.json, for the
// config builder on their pages. Installed at Mods/<folder>/<file>.
export function attachConfig(mod, modDir, configs) {
  const entry = configs?.[mod.slug];
  if (mod.game !== "7-days-to-die" || !entry) return mod;
  const file = path.join(modDir, entry.file);
  if (!existsSync(file)) {
    console.warn(`${mod.slug}: ${entry.file} is missing, so its page has no config builder`);
    return mod;
  }
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  return { ...mod, config: { ...entry, name: path.basename(entry.file), folder: path.basename(modDir), text } };
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
  const sevendaysConfigs = JSON.parse(readFileSync(path.join(siteRoot, "src", "data", "sevendays-configs.json"), "utf8"));
  const catalogDir = path.join(siteRoot, "public", "catalog");
  const previewsDir = path.join(siteRoot, "previews");
  rmSync(catalogDir, { recursive: true, force: true });
  mkdirSync(catalogDir, { recursive: true });

  const mods = [];
  for (const root of roots) {
    const files = [];
    walk(root, files);
    const entries = [];
    for (const file of files) {
      const mod = readCatalogEntry(file);
      if (!mod) continue;
      const modDir = path.dirname(file);
      const destDir = path.join(catalogDir, mod.game, mod.slug);
      const images = [];
      for (const relative of mod.screenshots ?? []) {
        const source = path.join(modDir, relative);
        mkdirSync(destDir, { recursive: true });
        const filename = path.basename(relative);
        cpSync(source, path.join(destDir, filename));
        images.push(`/catalog/${mod.game}/${mod.slug}/${filename}`);
      }
      let preview;
      const firstShot = mod.screenshots?.[0];
      const found = firstShot ? { relative: firstShot, source: path.join(modDir, firstShot) } : findPreview(modDir, mod, previewsDir);
      if (found) {
        let src = images[0];
        if (!src) {
          mkdirSync(destDir, { recursive: true });
          const filename = path.basename(found.relative);
          cpSync(found.source, path.join(destDir, filename));
          src = `/catalog/${mod.game}/${mod.slug}/${filename}`;
        }
        const size = imageSize(readFileSync(found.source));
        const square = Boolean(size && size.width === size.height);
        const thumbFile = path.join(destDir, "thumb.webp");
        const thumb = (await writeThumb(found.source, thumbFile, square)) ? `/catalog/${mod.game}/${mod.slug}/thumb.webp` : undefined;
        const posterFile = path.join(destDir, "poster.webp");
        const poster = !square && (await writePoster(found.source, posterFile)) ? `/catalog/${mod.game}/${mod.slug}/poster.webp` : undefined;
        const smallFile = path.join(destDir, "poster-640.webp");
        const posterSmall =
          poster && size && size.width > 640 && (await writePoster(found.source, smallFile, 640)) ? `/catalog/${mod.game}/${mod.slug}/poster-640.webp` : undefined;
        preview = { src, ...(size ?? {}), ...(thumb ? { thumb } : {}), ...(poster ? { poster } : {}), ...(posterSmall ? { posterSmall } : {}) };
      }
      entries.push({ mod: attachConfig({ ...mod, images, ...(preview ? { preview } : {}) }, modDir, sevendaysConfigs), dir: modDir });
    }
    if (entries.length) mods.push(...releaseNotesReader(root, entries[0].mod.game)(entries));
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
  const hosted = await attachOlderDownloads(applyHostedVersions(guided, files));
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
  await saveStatsSnapshot(path.join(siteRoot, "src", "data", "stats-snapshot.json"));
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  await main();
}
