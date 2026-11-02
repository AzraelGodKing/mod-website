// README badges: /badge/<game>/<mod>.svg (downloads) and /badge/<game>/<mod>/version.svg.
// Flat shields-style SVGs, so a mod's GitHub, Nexus or Thunderstore page can show
// live numbers from this site without a third-party badge service.

const NARROW = new Set("fijlrtI1.,:;'!|()[] ");
const WIDE = new Set("mwMW@%");

/**
 * Rough 11px Verdana width. Close enough that the text never spills out of its box.
 *
 * @param {string} text
 * @returns {number}
 */
export function textWidth(text) {
  let width = 0;
  for (const char of text) {
    if (NARROW.has(char)) width += 3.9;
    else if (WIDE.has(char)) width += 10.2;
    else if (char >= "A" && char <= "Z") width += 7.6;
    else width += 6.8;
  }
  return Math.ceil(width);
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeXml(text) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * @param {string} label
 * @param {string} message
 * @param {string} color  hex, e.g. "#4c9a52"
 * @returns {string}
 */
export function renderBadge(label, message, color) {
  const left = textWidth(label) + 12;
  const right = textWidth(message) + 12;
  const total = left + right;
  const title = escapeXml(`${label}: ${message}`);
  const l = escapeXml(label);
  const m = escapeXml(message);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${title}"><title>${title}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${total}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${left}" height="20" fill="#555"/><rect x="${left}" width="${right}" height="20" fill="${color}"/><rect width="${total}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${left / 2}" y="15" fill="#010101" fill-opacity=".3">${l}</text><text x="${left / 2}" y="14">${l}</text><text x="${left + right / 2}" y="15" fill="#010101" fill-opacity=".3">${m}</text><text x="${left + right / 2}" y="14">${m}</text></g></svg>`;
}

/**
 * 950 -> "950", 1234 -> "1.2k", 25300 -> "25k", 1250000 -> "1.3M".
 *
 * @param {number} value
 * @returns {string}
 */
export function compactNumber(value) {
  const n = Math.max(0, Math.round(value));
  if (n < 1000) return String(n);
  const [divisor, suffix] = n < 1_000_000 ? [1000, "k"] : [1_000_000, "M"];
  const scaled = n / divisor;
  const text = scaled < 10 ? scaled.toFixed(1).replace(/\.0$/, "") : String(Math.round(scaled));
  return `${text}${suffix}`;
}

/**
 * @param {string} pathname
 * @returns {{ game: string, slug: string, kind: "downloads" | "version" } | null}
 */
export function parseBadgePath(pathname) {
  const match = pathname.match(/^\/badge\/([a-z0-9-]+)\/([a-z0-9-]+)(\/version)?\.svg$/);
  if (!match) return null;
  return { game: match[1], slug: match[2], kind: match[3] ? "version" : "downloads" };
}

/**
 * Downloads across this site, Thunderstore and Nexus. Steam counts subscribers,
 * not downloads, so it is only used when a mod has nothing else.
 *
 * @param {{ site?: { downloads?: number } | null, thunderstore?: { downloads?: number } | null, nexus?: { downloads?: number } | null, steam?: { subscriptions?: number } | null } | undefined} stats
 * @returns {{ label: string, value: number } | null}
 */
export function downloadTotal(stats) {
  if (!stats) return null;
  const parts = [stats.site?.downloads, stats.thunderstore?.downloads, stats.nexus?.downloads].filter(
    (value) => typeof value === "number",
  );
  const downloads = parts.reduce((total, value) => total + value, 0);
  if (downloads > 0 || (parts.length > 0 && typeof stats.steam?.subscriptions !== "number")) {
    return { label: "downloads", value: downloads };
  }
  if (typeof stats.steam?.subscriptions === "number") return { label: "subscribers", value: stats.steam.subscriptions };
  return null;
}

export const BADGE_COLORS = { downloads: "#4c9a52", version: "#c4782a", missing: "#9f9f9f" };
