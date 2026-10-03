export type StatField = "steam" | "thunderstore" | "nexus" | "nexus_full" | "combined";

type Platform = "steam" | "thunderstore" | "nexus";

const platforms: Record<string, Platform[]> = {
  rimworld: ["steam", "nexus"],
  "sun-haven": ["thunderstore", "nexus"],
  "7-days-to-die": ["nexus"],
};

const labels: Record<Platform, string> = {
  steam: "Steam",
  thunderstore: "Thunderstore",
  nexus: "Nexus",
};

export interface StatRow {
  field: StatField;
  label: string;
}

// Only Sun Haven gets a combined total: Steam counts subscribers, not downloads.
export function statRows(game: string, detail: boolean): StatRow[] {
  const rows: StatRow[] = [];
  if (game === "sun-haven") rows.push({ field: "combined", label: "Downloads" });
  for (const platform of platforms[game] ?? []) {
    rows.push({
      field: platform === "nexus" && detail ? "nexus_full" : platform,
      label: labels[platform],
    });
  }
  return rows;
}
