import catalog from "./catalog.json";
import { NOT_READY, formatBytes, zipFor } from "../downloads/latest.mjs";

export interface ModLinks {
  steam: string | null;
  thunderstore: string | null;
  nexus: string | null;
}

export interface ModDownload {
  file: string;
  url?: string;
}

export interface ModFeature {
  title: string;
  body: string;
  tag?: string;
}

export interface ModGuide {
  overview: string[];
  badges: string[];
  sections: { id: string; label: string; features: ModFeature[] }[];
  notes: string[];
  faq?: { title: string; intro: string; rows: { pair: string; answer: string }[] };
  worksWith: { name: string; note: string }[];
  avoid: { name: string; note: string }[];
  compatNotes: string[];
}

export interface ModPreview {
  src: string;
  width?: number;
  height?: number;
  // A small WebP for the list rows, made by collect-mods.mjs.
  thumb?: string;
}

export interface ModChange {
  version: string;
  date?: string;
  // One line of Markdown each; render with renderInline().
  notes: string[];
}

export interface ModEntry {
  slug: string;
  name: string;
  game: string;
  description: string;
  version: string;
  uploadedAt?: string;
  screenshots: string[];
  images: string[];
  preview?: ModPreview;
  download: ModDownload;
  links: ModLinks;
  guide?: ModGuide;
  changelog?: ModChange[];
  gameVersions?: string[];
  requires?: string[];
  sha256?: string;
  bytes?: number;
}

export const mods = catalog.mods as ModEntry[];

export function modsForGame(game: string): ModEntry[] {
  return mods.filter((mod) => mod.game === game);
}

export function findMod(game: string, slug: string): ModEntry | undefined {
  return mods.find((mod) => mod.game === game && mod.slug === slug);
}

export function isNotReady(mod: ModEntry): boolean {
  return NOT_READY.has(`${mod.game}/${mod.slug}`);
}

// Azrael's preview file is the Homesteader poster, so its pages show no picture.
// A square picture is a Thunderstore icon; the rest are wide store posters.
export function previewFor(
  mod: ModEntry,
): { src: string; thumb: string; square: boolean; width?: number; height?: number } | undefined {
  if (!mod.preview || mod.slug === "azrael") return undefined;
  const { src, width, height, thumb } = mod.preview;
  return { src, thumb: thumb ?? src, square: Boolean(width && height && width === height), width, height };
}

const uploadDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function uploadedOn(mod: ModEntry): { iso: string; label: string } | null {
  if (isNotReady(mod) || !mod.uploadedAt) return null;
  const date = new Date(mod.uploadedAt);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), label: uploadDate.format(date) };
}

// The Worker answers /download/<game>/<mod> with the newest zip in downloads.json,
// so the button stays current between site builds. The file name is the build's
// version until the page script swaps in the latest one.
export function r2Download(mod: ModEntry): { file: string; url: string } | null {
  if (isNotReady(mod)) return null;
  const { file } = zipFor(mod.game, mod.slug, mod.version);
  return { file, url: `/download/${mod.game}/${mod.slug}` };
}

// The zip's SHA-256 and size, from downloads.json, when the build's version is the hosted one.
export function fileFacts(mod: ModEntry): { sha256?: string; size?: string } {
  if (isNotReady(mod)) return {};
  return {
    ...(mod.sha256 ? { sha256: mod.sha256 } : {}),
    ...(mod.bytes ? { size: formatBytes(mod.bytes) } : {}),
  };
}

const gameVersionPrefix: Record<string, string> = {
  rimworld: "RimWorld",
  "7-days-to-die": "7 Days",
  "sun-haven": "Sun Haven",
};

// "RimWorld 1.6 · 1.7" or "7 Days V3.4".
export function gameVersionLabel(mod: ModEntry): string | null {
  if (!mod.gameVersions?.length) return null;
  return `${gameVersionPrefix[mod.game] ?? ""} ${mod.gameVersions.join(" · ")}`.trim();
}

// Newest release first, by upload date. Mods with no upload date are left out.
export function recentlyUpdated(limit = 6, list: ModEntry[] = mods): ModEntry[] {
  return list
    .filter((mod) => !isNotReady(mod) && mod.uploadedAt && !Number.isNaN(Date.parse(mod.uploadedAt)))
    .sort((a, b) => Date.parse(b.uploadedAt as string) - Date.parse(a.uploadedAt as string))
    .slice(0, limit);
}

// The notes for the version the site is serving, if the changelog has them.
export function notesFor(mod: ModEntry): ModChange | undefined {
  return mod.changelog?.find((entry) => entry.version === mod.version);
}
