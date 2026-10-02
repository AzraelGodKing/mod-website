export interface ModLook {
  mark: string;
  wash: string;
  heroInk: string;
  heroMuted: string;
  accent: string;
  accentInk: string;
}

const looks: Record<string, ModLook> = {
  azrael: {
    mark: "Series showcase",
    wash: "#12141c",
    heroInk: "#f6efe2",
    heroMuted: "#c9bea8",
    accent: "#e4c27a",
    accentInk: "#1a140c",
  },
  "date-night": {
    mark: "Schedule romance",
    wash: "#2a1830",
    heroInk: "#f8e8f0",
    heroMuted: "#d7b4c6",
    accent: "#e7a0c4",
    accentInk: "#2a1020",
  },
  "deep-colony": {
    mark: "Perks, trauma, lineage",
    wash: "#140e09",
    heroInk: "#f6e7cf",
    heroMuted: "#cbb89a",
    accent: "#f0a14a",
    accentInk: "#1a1008",
  },
  homesteader: {
    mark: "Grow, preserve, power",
    wash: "#24301c",
    heroInk: "#f7f1e4",
    heroMuted: "#d5c7a4",
    accent: "#e2b15a",
    accentInk: "#1c160c",
  },
  "living-world": {
    mark: "Settlements make news",
    wash: "#efe4d0",
    heroInk: "#2a2118",
    heroMuted: "#5c4e3d",
    accent: "#7a4e2a",
    accentInk: "#f7f1e4",
  },
  nemesis: {
    mark: "A named antagonist",
    wash: "#16181c",
    heroInk: "#f3efe6",
    heroMuted: "#c4bbae",
    accent: "#d9cbb8",
    accentInk: "#16141a",
  },
  niceties: {
    mark: "Each comfort is a toggle",
    wash: "#1a140c",
    heroInk: "#f7f1e2",
    heroMuted: "#cbbda6",
    accent: "#d4b46a",
    accentInk: "#1a140c",
  },
  stormproof: {
    mark: "Hold the grid",
    wash: "#101820",
    heroInk: "#eef6ff",
    heroMuted: "#b7c7d6",
    accent: "#7ecbff",
    accentInk: "#071018",
  },
  strata: {
    mark: "Dig down, build up",
    wash: "#d7e8f5",
    heroInk: "#17324a",
    heroMuted: "#3d5c74",
    accent: "#1d4e89",
    accentInk: "#f7fbff",
  },
  "birthday-reminder": {
    mark: "Don't miss a birthday",
    wash: "#fff0f4",
    heroInk: "#3a2430",
    heroMuted: "#7a4d5e",
    accent: "#d4537e",
    accentInk: "#fff8f6",
  },
  "crop-optimizer": {
    mark: "Seasonal forecast",
    wash: "#eef6df",
    heroInk: "#243018",
    heroMuted: "#4d5c38",
    accent: "#3d7a32",
    accentInk: "#f7fbf2",
  },
  "faster-races": {
    mark: "A quicker step",
    wash: "#e7f6f4",
    heroInk: "#14332f",
    heroMuted: "#3d6560",
    accent: "#0e8a78",
    accentInk: "#f4fffc",
  },
  "gifting-assistant": {
    mark: "Loved and liked",
    wash: "#fff1f4",
    heroInk: "#3a1822",
    heroMuted: "#7a4454",
    accent: "#c43b5a",
    accentInk: "#fff8f6",
  },
  "havens-almanac": {
    mark: "Morning briefing",
    wash: "#fff6df",
    heroInk: "#3a2a12",
    heroMuted: "#6b5428",
    accent: "#c47a1a",
    accentInk: "#fffaf0",
  },
  "havens-birthright": {
    mark: "Twelve races",
    wash: "#f4eefe",
    heroInk: "#2c1840",
    heroMuted: "#5c4874",
    accent: "#6a3d8a",
    accentInk: "#fbf8ff",
  },
  "havens-mirror": {
    mark: "Your portrait",
    wash: "#f3f6fb",
    heroInk: "#243044",
    heroMuted: "#546278",
    accent: "#5c6b82",
    accentInk: "#f7f9fc",
  },
  "havens-respec": {
    mark: "Reset, then undo",
    wash: "#f7f1e6",
    heroInk: "#3a2818",
    heroMuted: "#6b5340",
    accent: "#a15c2a",
    accentInk: "#fffaf3",
  },
  "haven-dev-tools": {
    mark: "Inspect the game",
    wash: "#1e2a24",
    heroInk: "#e7f6ee",
    heroMuted: "#a9cbb8",
    accent: "#3ddc97",
    accentInk: "#062016",
  },
  "senpais-chest": {
    mark: "Sorts itself",
    wash: "#f6ead4",
    heroInk: "#3a2814",
    heroMuted: "#6b5030",
    accent: "#8a5a2b",
    accentInk: "#fffaf3",
  },
  "sunhaven-todo": {
    mark: "Today's tasks",
    wash: "#f7f3ea",
    heroInk: "#243024",
    heroMuted: "#4d5c48",
    accent: "#3d5a3a",
    accentInk: "#f7fbf4",
  },
  smut: {
    mark: "Three halls",
    wash: "#f4efe6",
    heroInk: "#2e261e",
    heroMuted: "#5c5148",
    accent: "#6b5344",
    accentInk: "#fbf8f3",
  },
  "the-vault": {
    mark: "Locked to the character",
    wash: "#1c2430",
    heroInk: "#f4e7c5",
    heroMuted: "#cbb892",
    accent: "#d4b15a",
    accentInk: "#1a140c",
  },
  "trinket-fortune": {
    mark: "Unowned trinkets",
    wash: "#e5f4f6",
    heroInk: "#12343a",
    heroMuted: "#3d656c",
    accent: "#147a8a",
    accentInk: "#f4fcfd",
  },
  "blood-moon-sound": {
    mark: "Your horde cue",
    wash: "#2a1014",
    heroInk: "#f8ecec",
    heroMuted: "#d7b0b0",
    accent: "#e23b4a",
    accentInk: "#1a080c",
  },
  "keep-backpacks": {
    mark: "Bags stay put",
    wash: "#1e2218",
    heroInk: "#f3eee4",
    heroMuted: "#cbbfa8",
    accent: "#c4a574",
    accentInk: "#1a140c",
  },
  "quest-disconnect-fix": {
    mark: "Logouts finish",
    wash: "#1a1e18",
    heroInk: "#f4f0e4",
    heroMuted: "#c9c0a4",
    accent: "#d7a441",
    accentInk: "#1a1408",
  },
  "remove-zombie-dogs": {
    mark: "No dogs, no screamers",
    wash: "#1c1816",
    heroInk: "#f4ece8",
    heroMuted: "#cbb6ae",
    accent: "#c47a62",
    accentInk: "#1a100c",
  },
  speedometer: {
    mark: "Speed on the HUD",
    wash: "#14181c",
    heroInk: "#f6f1e4",
    heroMuted: "#c9c0a8",
    accent: "#f0b429",
    accentInk: "#1a1408",
  },
};

const fallback: ModLook = {
  mark: "Mod",
  wash: "#fffaf3",
  heroInk: "#1c1915",
  heroMuted: "#5c5348",
  accent: "#6b3a1f",
  accentInk: "#fffaf3",
};

export function lookFor(slug: string): ModLook {
  return looks[slug] ?? fallback;
}

export function heroVars(slug: string): string {
  const look = lookFor(slug);
  return [
    `--wash:${look.wash}`,
    `--hero-ink:${look.heroInk}`,
    `--hero-muted:${look.heroMuted}`,
    `--accent:${look.accent}`,
    `--accent-ink:${look.accentInk}`,
  ].join(";");
}

const gameLooks: Record<string, string> = {
  rimworld: [
    "--paper:#f3ead7",
    "--ink:#2a2118",
    "--muted:#5c4e3d",
    "--link:#6b3a1f",
    "--bar:#2c241c",
    "--bar-ink:#f3ead7",
    "--bar-mark:#e2b15a",
    "--rule:#d9cbb0",
    "--card:#fffaf3",
    "--accent:#6b3a1f",
    "--accent-ink:#f3ead7",
    "--radius:2px",
    '--font:Georgia, "Iowan Old Style", Palatino, serif',
  ].join(";"),
  "sun-haven": [
    "--paper:#e7f3df",
    "--ink:#3a2a16",
    "--muted:#6b5840",
    "--link:#1f6b3a",
    "--bar:#245c34",
    "--bar-ink:#fff8ec",
    "--bar-mark:#f6e27a",
    "--rule:#ead7b0",
    "--card:#fff",
    "--accent:#245c34",
    "--accent-ink:#fff8ec",
    "--radius:14px",
    '--font:"Segoe UI", "Avenir Next", "Trebuchet MS", sans-serif',
  ].join(";"),
  "7-days-to-die": [
    "--paper:#1a1614",
    "--ink:#f2ebe3",
    "--muted:#cbbba8",
    "--link:#e2a15a",
    "--bar:#100e0c",
    "--bar-ink:#f2ebe3",
    "--bar-mark:#e07a3d",
    "--rule:#3a3028",
    "--card:#241e1b",
    "--accent:#e07a3d",
    "--accent-ink:#1a100c",
    "--radius:0",
    '--font:Bahnschrift, "Segoe UI", "Arial Narrow", sans-serif',
  ].join(";"),
};

export function gameVars(slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  return gameLooks[slug];
}
