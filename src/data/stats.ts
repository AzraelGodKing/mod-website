export type StatField = "steam" | "thunderstore" | "nexus" | "nexus_full" | "combined" | "site" | "total";

export type Platform = "steam" | "thunderstore" | "nexus";

export const platforms: Record<string, Platform[]> = {
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

// Downloads is this site's clicks plus Thunderstore and Nexus downloads. Steam is
// listed on its own because it counts subscribers, not downloads.
export function statRows(game: string, detail: boolean): StatRow[] {
  const rows: StatRow[] = [{ field: "total", label: "Downloads" }];
  if (detail) rows.push({ field: "site", label: "This site" });
  for (const platform of platforms[game] ?? []) {
    rows.push({
      field: platform === "nexus" && detail ? "nexus_full" : platform,
      label: labels[platform],
    });
  }
  return rows;
}
