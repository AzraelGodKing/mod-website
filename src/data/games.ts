export interface Game {
  slug: string;
  name: string;
  repo: string;
}

export const games: Game[] = [
  {
    slug: "rimworld",
    name: "RimWorld",
    repo: "https://github.com/AzraelGodKing/rimworld_mods",
  },
  {
    slug: "sun-haven",
    name: "Sun Haven",
    repo: "https://github.com/AzraelGodKing/SunhavenMod",
  },
  {
    slug: "7-days-to-die",
    name: "7 Days to Die",
    repo: "https://github.com/AzraelGodKing/7d2d_mods",
  },
];

export function gameBySlug(slug: string): Game | undefined {
  return games.find((game) => game.slug === slug);
}
