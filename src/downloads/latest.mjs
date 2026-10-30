export const DOWNLOAD_ORIGIN = "https://downloads.azraelsmods.com";
export const MANIFEST_URL = `${DOWNLOAD_ORIGIN}/downloads.json`;

// These mods have no public zip yet. Download goes to /not-ready.
export const NOT_READY = new Set(["rimworld/azrael", "rimworld/living-world"]);

const MANIFEST_TTL_SECONDS = 300;

export function compareVersions(a, b) {
  const left = String(a).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b).split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

export function zipFor(game, slug, version) {
  const file = `${slug}-${version}.zip`;
  return { file, url: `${DOWNLOAD_ORIGIN}/${game}/${slug}/${version}/${file}` };
}

/**
 * The newest download for each mod: the version baked into the catalog at build
 * time, or a newer one that downloads.json recorded since.
 *
 * @param {{ game: string; slug: string; version: string; uploadedAt?: string }[]} mods
 * @param {Record<string, { version?: string; uploadedAt?: string }> | null} files
 */
export function latestDownloads(mods, files) {
  const latest = {};
  for (const mod of mods) {
    const key = `${mod.game}/${mod.slug}`;
    if (NOT_READY.has(key)) continue;
    const hosted = files?.[key];
    const newer = hosted?.version && compareVersions(hosted.version, mod.version) > 0;
    const version = String(newer ? hosted.version : mod.version);
    const uploadedAt = newer ? hosted.uploadedAt : mod.uploadedAt;
    latest[key] = {
      version,
      ...zipFor(mod.game, mod.slug, version),
      ...(uploadedAt ? { uploadedAt: String(uploadedAt) } : {}),
    };
  }
  return latest;
}

// A missing or broken manifest returns null, so callers fall back to the build's versions.
export async function fetchManifestFiles(fetchImpl = globalThis.fetch, log = console.warn) {
  try {
    const response = await fetchImpl(MANIFEST_URL, {
      cf: { cacheTtl: MANIFEST_TTL_SECONDS, cacheEverything: true },
    });
    if (!response.ok) {
      log(`downloads.json answered ${response.status}`);
      return null;
    }
    const manifest = await response.json();
    if (!manifest || typeof manifest.files !== "object" || manifest.files === null) {
      log("downloads.json has no files map");
      return null;
    }
    return manifest.files;
  } catch (error) {
    log(`downloads.json could not be read: ${error}`);
    return null;
  }
}
