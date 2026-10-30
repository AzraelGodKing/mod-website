import type { ModEntry } from "./mods";
import type { Installs } from "./sevendays-index";

// List-row info for the RimWorld and Sun Haven pages. 7 Days to Die has its own
// in sevendays-index.ts because its rows also say where the mod installs.
export interface HubInfo {
  category: string;
  short: string;
}

// One row of a game page list.
export interface ModRow {
  mod: ModEntry;
  category: string;
  short: string;
  installs?: Installs;
  thumb?: string;
  direct: { file: string; url: string } | null;
  updated: { iso: string; label: string } | null;
}

interface HubGame {
  categories: string[];
  // Featured order. Mods missing from it go last, by name.
  order: string[];
  mods: Record<string, HubInfo>;
}

export const hubIndex: Record<string, HubGame> = {
  rimworld: {
    categories: ["Base", "Colonists", "Events", "QoL", "Storyteller"],
    order: ["homesteader", "stormproof", "strata", "nemesis", "deep-colony", "date-night", "niceties", "azrael", "living-world"],
    mods: {
      homesteader: { category: "Base", short: "Pantry, orchard, dairy, wells, cool cellars and off-grid power for homestead starts." },
      stormproof: { category: "Base", short: "Protect the power grid from flares, lightning, EMP and fallout, then call the storm yourself." },
      strata: { category: "Base", short: "Dig down, build up: multistory bases with commuting colonists and Odyssey-ready stacks." },
      nemesis: { category: "Events", short: "A named antagonist who taunts, sabotages and comes back with an army." },
      "deep-colony": { category: "Colonists", short: "Skill perks, trauma and therapy, apprentices, family life and faction reputation." },
      "date-night": { category: "Colonists", short: "Paint Date or Lovin on the Schedule tab: dinner, walks and stargazing." },
      niceties: { category: "QoL", short: "Small comforts: well-kept apparel, throne-room altars, hidden cryptosleep and more." },
      azrael: { category: "Storyteller", short: "Series showcase: the Deep Homestead scenario and Hub health in Mod Options." },
      "living-world": { category: "Events", short: "Other settlements drift, change hands, feud and make the news." },
    },
  },
  "sun-haven": {
    categories: ["QoL", "Storage", "UI", "Social", "Tracking", "Skills", "Dev"],
    order: [
      "the-vault",
      "havens-birthright",
      "faster-races",
      "havens-mirror",
      "trinket-fortune",
      "smut",
      "sunhaven-todo",
      "birthday-reminder",
      "gifting-assistant",
      "senpais-chest",
      "havens-almanac",
      "crop-optimizer",
      "havens-respec",
      "haven-dev-tools",
    ],
    mods: {
      "the-vault": { category: "Storage", short: "A per-character vault for currencies and keys, with a HUD and auto-deposit." },
      "senpais-chest": { category: "Storage", short: "Chests sort themselves by your rules: item, type, category or group." },
      "havens-birthright": { category: "Skills", short: "Unique bonuses and abilities for all 12 playable races." },
      "faster-races": { category: "Skills", short: "A configurable movement speed bonus for every race." },
      "havens-respec": { category: "Skills", short: "Reset any skill tree, with a confirm step and one-step undo." },
      "havens-mirror": { category: "UI", short: "Your own dialogue portraits from a folder of PNGs." },
      "havens-almanac": { category: "UI", short: "One dashboard and a morning briefing that gathers your other mods' data." },
      "trinket-fortune": { category: "Tracking", short: "Better odds of fishing trinkets you don't own yet." },
      smut: { category: "Tracking", short: "Track museum donations across all three halls." },
      "crop-optimizer": { category: "Tracking", short: "A crop forecast HUD with seasonal planning help." },
      "sunhaven-todo": { category: "QoL", short: "An in-game to-do list for farming goals, quests and dailies." },
      "birthday-reminder": { category: "Social", short: "Reminders for every NPC birthday, with gift ideas." },
      "gifting-assistant": { category: "Social", short: "Who loves what: a gift roster with heart bars and today's gifts." },
      "haven-dev-tools": { category: "Dev", short: "Debugging and game-state tools for mod makers." },
    },
  },
};

function firstSentence(description: string): string {
  const match = description.match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : description).trim();
}

export function hubInfo(mod: ModEntry): HubInfo {
  return hubIndex[mod.game]?.mods[mod.slug] ?? { category: hubIndex[mod.game]?.categories[0] ?? "Mods", short: firstSentence(mod.description) };
}

export function featuredOrder(game: string, mods: ModEntry[]): ModEntry[] {
  const order = hubIndex[game]?.order ?? [];
  const rank = (slug: string) => {
    const index = order.indexOf(slug);
    return index < 0 ? order.length : index;
  };
  return [...mods].sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name));
}
