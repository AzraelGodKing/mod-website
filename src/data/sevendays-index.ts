import type { ModEntry } from "./mods";

export type Installs = "server" | "client" | "both" | "optional";

export interface IndexInfo {
  category: string;
  installs: Installs;
  short: string;
}

export const sevendaysCategories = ["Fixes", "Server admin", "Crafting", "Gameplay", "HUD & sound"];

export const installLabels: Record<Installs, string> = {
  server: "Server only",
  client: "Client only",
  both: "Server + clients",
  optional: "Server, client optional",
};

export const installHints: Record<Installs, string> = {
  server: "Install on the server. Players install nothing.",
  client: "Each player installs it. The server needs nothing.",
  both: "Install on the server and on every player's game.",
  optional: "Install on the server. Players can add it too; each side works without the other.",
};

const known: Record<string, IndexInfo> = {
  "blood-moon-sound": {
    category: "HUD & sound",
    installs: "optional",
    short: "Server posts blood moon alerts to Discord and chat. Players can add custom sounds, a countdown and warnings.",
  },
  "craft-from-chests": {
    category: "Crafting",
    installs: "client",
    short: "Crafting pulls materials from chests inside your land claim.",
  },
  "craftable-signs": {
    category: "Crafting",
    installs: "server",
    short: "Craft the POI picture signs and draw on them.",
  },
  "drone-loot-filter": {
    category: "Gameplay",
    installs: "server",
    short: "Pick the items your Auto-Loot drone leaves alone.",
  },
  "gyro-safe": {
    category: "Fixes",
    installs: "both",
    short: "Gyrocopters stop damaging blocks and terrain they hit.",
  },
  "honk-door-fix": {
    category: "Fixes",
    installs: "server",
    short: "Stops the error spam from honking near the top of the world.",
  },
  "keep-backpacks": {
    category: "Gameplay",
    installs: "server",
    short: "Death backpacks never despawn. /mybag finds them.",
  },
  "no-ding-sound": {
    category: "HUD & sound",
    installs: "server",
    short: "Swaps the unbreakable-block ding for a bicycle horn.",
  },
  "quest-disconnect-fix": {
    category: "Fixes",
    installs: "server",
    short: "Fixes ghost players and broken parties after quests and drones.",
  },
  "remove-any-entity": {
    category: "Server admin",
    installs: "server",
    short: "Stop or swap any zombie or animal spawn, everywhere or per biome.",
  },
  "slot-lock-fix": {
    category: "Fixes",
    installs: "client",
    short: "Locked backpack and storage slots actually stay locked.",
  },
  "spawn-tuner": {
    category: "Server admin",
    installs: "server",
    short: "Tune spawn rates, max zombies and hordes live from the console.",
  },
  speedometer: {
    category: "HUD & sound",
    installs: "client",
    short: "Shows your vehicle speed on the HUD in MPH or KM/H.",
  },
  "upgrade-bench": {
    category: "Crafting",
    installs: "both",
    short: "Combine two mods of the same quality into one a level higher.",
  },
  "zombie-and-animal-bait": {
    category: "Gameplay",
    installs: "server",
    short: "Throwable bait that pulls zombies and animals in to eat.",
  },
  "zombie-and-animal-bait-ui": {
    category: "Gameplay",
    installs: "client",
    short: "Thrall roster, name tags and bestiary for the Bait mod.",
  },
};

// A new mod shows up before anyone writes its entry above, so its install side
// comes from the wording the mod.json descriptions already use.
export function guessInstalls(description: string): Installs {
  const text = description.toLowerCase();
  if (/server and every player|on the server and|on every player.*server/.test(text)) return "both";
  if (/server-side|server only|players install nothing|players do not (need|install)/.test(text)) return "server";
  if (/client-side|only players need it|the server needs nothing|server does not need/.test(text)) return "client";
  return "both";
}

function firstSentence(description: string): string {
  const match = description.match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : description).trim();
}

export function indexInfo(mod: ModEntry): IndexInfo {
  return (
    known[mod.slug] ?? {
      category: "Gameplay",
      installs: guessInstalls(mod.description),
      short: firstSentence(mod.description),
    }
  );
}
