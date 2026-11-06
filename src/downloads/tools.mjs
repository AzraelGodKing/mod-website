// Desktop apps that live in their own GitHub repos rather than the mod catalog.
// /download/tools/<slug> sends the newest release's installer; /download/tools/<slug>/exe
// and /zip send the standalone exe and the framework-dependent zip.

export const TOOLS = [
  {
    slug: "modwright",
    name: "Modwright",
    game: "rimworld",
    repo: "AzraelGodKing/ModWright",
    summary:
      "A Windows app for RimWorld. The Drop Pod sorts your load order, keeps modlists, finds missing requirements and clashes, and runs separate instances. The Launch Pad uploads mod updates to the Workshop for mod authors.",
  },
  {
    slug: "survivors-toolkit",
    name: "Survivor's Toolkit",
    game: "7-days-to-die",
    repo: "AzraelGodKing/Survivor-s-Toolkit",
    summary:
      "A Windows mod manager for 7 Days to Die. Turn mods on and off, keep profiles, install from a zip or a link, spot clashing mods and broken ModInfo files, then start the game or a dedicated server.",
  },
];

// Each release ships the same three files; the installer is the recommended one.
export const VARIANTS = {
  setup: { label: "Installer", note: "Recommended. Installs for your Windows user and keeps itself up to date.", pattern: /-Setup\.exe$/i },
  exe: { label: "Standalone exe", note: "One self-contained file, no install.", pattern: /-win-x64\.exe$/i },
  zip: { label: "Small zip", note: "Needs the .NET 8 Desktop Runtime.", pattern: /-win-x64-framework-dependent\.zip$/i },
};

export const RELEASE_TTL_SECONDS = 600;

// Added to a tool's click count before it is shown, e.g. to drop Azrael's own test click.
export const COUNT_OFFSETS = { "survivors-toolkit": -1 };

/**
 * Each tool's download count for /api/stats, from the site's click totals.
 * @param {Record<string, number> | null} counts  siteCounts(), keyed "tools/<slug>"
 * @returns {Record<string, { downloads: number }> | null}
 */
export function toolCounts(counts) {
  if (!counts) return null;
  const tools = {};
  for (const tool of TOOLS) {
    const key = `tools/${tool.slug}`;
    tools[key] = { downloads: Math.max(0, (counts[key] ?? 0) + (COUNT_OFFSETS[tool.slug] ?? 0)) };
  }
  return tools;
}

export function toolsForGame(game) {
  return TOOLS.filter((tool) => tool.game === game);
}

export function releasesPage(tool) {
  return `https://github.com/${tool.repo}/releases/latest`;
}

/**
 * "/download/tools/modwright/zip" is tool "modwright", variant "zip".
 * @param {string} pathname
 * @returns {{ tool: (typeof TOOLS)[number]; variant: keyof typeof VARIANTS } | null}
 */
export function parseToolPath(pathname) {
  const match = pathname.match(/^\/download\/tools\/([a-z0-9-]+)(?:\/([a-z]+))?\/?$/);
  if (!match) return null;
  const tool = TOOLS.find((entry) => entry.slug === match[1]);
  const variant = match[2] ?? "setup";
  if (!tool || !(variant in VARIANTS)) return null;
  return { tool, variant };
}

/**
 * The version and the three downloads of a GitHub release, from the API's JSON.
 * @param {{ tag_name?: string; published_at?: string; html_url?: string; assets?: { name: string; browser_download_url: string; size?: number }[] } | null} release
 */
export function releaseFiles(release) {
  if (!release?.tag_name) return null;
  const files = {};
  for (const [variant, { pattern }] of Object.entries(VARIANTS)) {
    const asset = (release.assets ?? []).find((entry) => pattern.test(entry.name));
    if (asset) files[variant] = { file: asset.name, url: asset.browser_download_url, bytes: asset.size ?? null };
  }
  return {
    version: release.tag_name.replace(/^v/i, ""),
    publishedAt: release.published_at ?? null,
    notes: release.html_url ?? null,
    files,
  };
}

/**
 * GitHub's own download counts for the three files people install (installer, exe, zip),
 * from the API's list of releases. The app's updater files are left out.
 * @param {{ tag_name?: string; draft?: boolean; assets?: { name: string; download_count?: number }[] }[] | null} releases
 * @returns {{ total: number; versions: Record<string, number> } | null}
 */
export function githubDownloads(releases) {
  if (!Array.isArray(releases)) return null;
  const patterns = Object.values(VARIANTS).map((variant) => variant.pattern);
  /** @type {Record<string, number>} */
  const versions = {};
  let total = 0;
  for (const release of releases) {
    if (!release?.tag_name || release.draft) continue;
    let count = 0;
    for (const asset of release.assets ?? []) {
      if (patterns.some((pattern) => pattern.test(asset.name))) count += Number(asset.download_count ?? 0);
    }
    versions[release.tag_name.replace(/^v/i, "")] = count;
    total += count;
  }
  return { total, versions };
}

/**
 * Reads GitHub's download counts for every release of a tool, or null when that fails.
 * @param {(input: string, init?: RequestInit & { cf?: unknown }) => Promise<Response>} fetcher
 */
export async function fetchGithubDownloads(tool, fetcher) {
  try {
    const response = await fetcher(`https://api.github.com/repos/${tool.repo}/releases?per_page=100`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "azraelsmods.com" },
      cf: { cacheTtl: RELEASE_TTL_SECONDS, cacheEverything: true },
    });
    if (!response.ok) return null;
    return githubDownloads(await response.json());
  } catch {
    return null;
  }
}

/**
 * This site's clicks for one tool, split by version, newest version first.
 * @param {{ key: string; version: string; count: number }[] | null} rows  siteDownloadLog()
 * @returns {{ version: string; count: number }[] | null}
 */
export function siteVersions(tool, rows) {
  if (!rows) return null;
  const key = `tools/${tool.slug}`;
  /** @type {Record<string, number>} */
  const byVersion = {};
  for (const row of rows) if (row.key === key) byVersion[row.version] = (byVersion[row.version] ?? 0) + row.count;
  return Object.entries(byVersion)
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => compareVersionStrings(b.version, a.version));
}

function compareVersionStrings(a, b) {
  const pa = a.split(/[.-]/).map((part) => Number(part) || 0);
  const pb = b.split(/[.-]/).map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/**
 * Reads a tool's latest release from GitHub, or null when that fails.
 * @param {(input: string, init?: RequestInit & { cf?: unknown }) => Promise<Response>} fetcher
 */
export async function fetchLatestRelease(tool, fetcher) {
  try {
    const response = await fetcher(`https://api.github.com/repos/${tool.repo}/releases/latest`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "azraelsmods.com" },
      // Cached at the edge, so the unauthenticated API limit is never close.
      cf: { cacheTtl: RELEASE_TTL_SECONDS, cacheEverything: true },
    });
    if (!response.ok) return null;
    return releaseFiles(await response.json());
  } catch {
    return null;
  }
}
