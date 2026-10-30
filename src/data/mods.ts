import catalog from "./catalog.json";
import { NOT_READY, zipFor } from "../downloads/latest.mjs";

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

export interface ModEntry {
  slug: string;
  name: string;
  game: string;
  description: string;
  version: string;
  uploadedAt?: string;
  screenshots: string[];
  images: string[];
  download: ModDownload;
  links: ModLinks;
  guide?: ModGuide;
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
