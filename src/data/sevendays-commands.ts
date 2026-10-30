import commands from "./sevendays-commands.json";

export interface ModCommand {
  cmd: string;
  does: string;
  admin?: boolean;
}

export interface CommandGroup {
  title: string;
  note?: string;
  aliases?: string;
  rows: ModCommand[];
}

export interface ModCommands {
  intro?: string;
  groups: CommandGroup[];
}

const bySlug = commands as Record<string, ModCommands>;

// Console and chat commands for a 7 Days to Die mod page, checked against the mod's source in 7d2d_mods.
export function commandsFor(slug: string): ModCommands | undefined {
  return bySlug[slug];
}
