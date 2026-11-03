/** Old standalone pages (traits.html and friends) that now live at clean paths. */
export const LEGACY_PAGES = ["index", "store", "traits", "backstories", "events", "commands", "isekai", "genes"];

export function legacyPagePath(page) {
  return page === "index" || page === "store" ? "/" : `/${page}`;
}
