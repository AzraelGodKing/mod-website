import catalog from "./catalog.json";

export interface ModLinks {
  steam: string | null;
  thunderstore: string | null;
  nexus: string | null;
}

export interface ModDownload {
  file: string;
  url?: string;
}

export interface ModEntry {
  slug: string;
  name: string;
  game: string;
  description: string;
  version: string;
  screenshots: string[];
  images: string[];
  download: ModDownload;
  links: ModLinks;
}

export const mods = catalog.mods as ModEntry[];

export function modsForGame(game: string): ModEntry[] {
  return mods.filter((mod) => mod.game === game);
}

export function findMod(game: string, slug: string): ModEntry | undefined {
  return mods.find((mod) => mod.game === game && mod.slug === slug);
}

const downloadOrigin = "https://downloads.azraelsmods.com";

const notReady = new Set([
  "rimworld/azrael",
  "rimworld/living-world",
  "7-days-to-die/craft-from-chests",
  "7-days-to-die/upgrade-bench",
]);

export function isNotReady(mod: ModEntry): boolean {
  return notReady.has(`${mod.game}/${mod.slug}`);
}

export function r2Download(mod: ModEntry): { file: string; url: string } | null {
  if (isNotReady(mod)) return null;
  const file = `${mod.slug}-${mod.version}.zip`;
  const url = `${downloadOrigin}/${mod.game}/${mod.slug}/${mod.version}/${file}`;
  return { file, url };
}
