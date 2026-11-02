// The download counts collect-mods.mjs saved from the live site at build time.
// A build without it (no network) ships "—" and the browser fills the numbers in.
const files = import.meta.glob("./stats-snapshot.json", { eager: true, import: "default" });

export const statsSnapshot: any = Object.values(files)[0] ?? {};
