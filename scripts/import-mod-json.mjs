import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const roots = {
  rimworld: process.env.RIMWORLD_MODS ?? "F:/Repositories/rimworld_mods-modjson",
  sunhaven: process.env.SUNHAVEN_MODS ?? "F:/Repositories/SunhavenMod-modjson",
  sevendays: process.env.SEVENDAYS_MODS ?? "F:/Repositories/7d2d-modjson",
};

function textTag(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match ? match[1].trim() : "";
}

function attr(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*value="([^"]*)"`));
  return match ? match[1].trim() : "";
}

function firstParagraph(value) {
  return value
    .split(/\n\s*\n/)[0]
    .replace(/\s+/g, " ")
    .trim();
}

function dirSlug(dir) {
  return dir
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function writeMod(dir, mod) {
  const file = path.join(dir, "mod.json");
  writeFileSync(file, `${JSON.stringify(mod, null, 2)}\n`);
  console.log(mod.game, mod.slug, mod.version, mod.download.url ? "download" : "no-url");
}

function rimworld() {
  const root = roots.rimworld;
  const matrix = JSON.parse(readFileSync(path.join(root, "scripts/matrix/mod-matrix.json"), "utf8"));
  const site = JSON.parse(readFileSync(path.join(root, "site/src/data/mods.json"), "utf8"));
  const byId = new Map(site.mods.map((mod) => [mod.id, mod]));
  const published = new Set([
    "DateNight.zip",
    "DeepColony.zip",
    "Homesteader.zip",
    "Nemesis.zip",
    "Niceties.zip",
    "Stormproof.zip",
    "Strata.zip",
  ]);

  for (const entry of matrix) {
    const aboutPath = path.join(root, entry.modDir, "About", "About.xml");
    const about = readFileSync(aboutPath, "utf8");
    const slug =
      entry.modDir === "Deep Colony"
        ? "deep-colony"
        : entry.modDir === "DateNight"
          ? "date-night"
          : entry.modDir === "LivingWorld"
            ? "living-world"
            : dirSlug(entry.modDir);
    const siteMod = byId.get(slug);
    const version = textTag(about, "modVersion");
    const zip = `${entry.zipName}.zip`;
    const preview = path.join(root, entry.modDir, "About", "Preview.png");
    const download = { file: published.has(zip) ? zip : `${entry.zipName}-${version}.zip` };
    if (published.has(zip)) {
      download.url = `https://github.com/AzraelGodKing/rimworld_mods/releases/latest/download/${zip}`;
    }
    writeMod(path.join(root, entry.modDir), {
      slug,
      name: textTag(about, "name"),
      game: "rimworld",
      description: siteMod?.tagline ?? firstParagraph(textTag(about, "description")),
      version,
      screenshots: existsSync(preview) ? ["About/Preview.png"] : [],
      download,
      links: {
        steam: siteMod?.workshopUrl || null,
        thunderstore: null,
        nexus: siteMod?.nexusUrl || entry.nexus || null,
      },
    });
  }
}

function sunhaven() {
  const root = roots.sunhaven;
  const matrix = JSON.parse(readFileSync(path.join(root, "scripts/matrix/mod-matrix.json"), "utf8"));
  const versions = JSON.parse(readFileSync(path.join(root, "docs/versions.json"), "utf8"));
  const releases = JSON.parse(
    execFileSync(
      "gh",
      ["api", "repos/AzraelGodKing/SunhavenMod/releases?per_page=100"],
      { encoding: "utf8" },
    ),
  );
  const assets = new Set(releases.flatMap((release) => release.assets.map((asset) => asset.name)));

  for (const entry of matrix) {
    const meta = versions[entry.jsonKey];
    if (!meta) throw new Error(`Missing versions.json entry for ${entry.jsonKey}`);
    const file = `${entry.thunderstoreName}-${meta.version}.zip`;
    const download = { file };
    if (assets.has(file)) {
      download.url = `https://github.com/AzraelGodKing/SunhavenMod/releases/download/${entry.thunderstoreName}-v${meta.version}/${file}`;
    }
    const slug = entry.modDir === "SunHavenMuseumUtilityTracker" ? "smut" : dirSlug(entry.modDir);
    writeMod(path.join(root, entry.modDir), {
      slug,
      name: meta.name,
      game: "sun-haven",
      description: meta.description,
      version: meta.version,
      screenshots: [],
      download,
      links: {
        steam: null,
        thunderstore: meta.thunderstore || null,
        nexus: meta.nexus || null,
      },
    });
  }
}

function sevendays() {
  const root = roots.sevendays;
  const mods = [
    ["BloodMoonSound", "blood-moon-sound", "Blood Moon Sound"],
    ["KeepBackpacks", "keep-backpacks", "Keep Backpacks"],
    ["QuestDisconnectFix", "quest-disconnect-fix", "Quest Disconnect Fix"],
    ["RemoveZombieDogs", "remove-zombie-dogs", "Remove Zombie Dogs"],
    ["Speedometer", "speedometer", "Speedometer"],
  ];
  for (const [dir, slug, name] of mods) {
    const xml = readFileSync(path.join(root, dir, "mod", "ModInfo.xml"), "utf8");
    const version = attr(xml, "Version");
    writeMod(path.join(root, dir), {
      slug,
      name,
      game: "7-days-to-die",
      description: attr(xml, "Description"),
      version,
      screenshots: [],
      download: { file: `${dir}-${version}.zip` },
      links: { steam: null, thunderstore: null, nexus: null },
    });
  }
}

rimworld();
sunhaven();
sevendays();
