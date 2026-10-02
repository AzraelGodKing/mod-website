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

export function r2Download(mod: ModEntry): { file: string; url: string; checksum: string } | null {
  if (!mod.download.url) return null;
  const file = `${mod.slug}-${mod.version}.zip`;
  const url = `${downloadOrigin}/${mod.game}/${mod.slug}/${mod.version}/${file}`;
  return { file, url, checksum: `${url}.sha256` };
}
