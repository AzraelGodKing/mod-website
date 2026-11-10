// Mod guides for docs.azraelsmods.com, written as Markdown from the site's own catalog
// (the same mod.json files, guides and command lists the mod pages are built from).
// Kept free of Worker APIs so test/docs-site.test.mjs can run it in Node.

export const GAMES = [
  {
    slug: "rimworld",
    name: "RimWorld",
    install: [
      "Download the zip from the mod's page, or subscribe on Steam when the mod has a Steam page.",
      "Unzip it and put the folder inside RimWorld's `Mods` folder. On Windows that is `C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods`, on Linux `~/.steam/steam/steamapps/common/RimWorld/Mods`, and on macOS `~/Library/Application Support/Steam/steamapps/common/RimWorld/Mods`.",
      "Start RimWorld, open **Mods**, turn the mod on, and restart when asked.",
      "Not sure about the order? Paste your list into the [mod list checker](https://azraelsmods.com/rimworld/check), or let [Modwright](/modwright) sort it.",
    ],
    trouble: [
      "Red errors on start usually mean a missing requirement or a wrong load order. The [mod list checker](https://azraelsmods.com/rimworld/check) reads your `ModsConfig.xml` and names both.",
      "After a RimWorld update, check the mod's page for the versions it works on before loading an old save.",
      "Test with only the mod and its requirements turned on. If the problem goes away, another mod is involved, and the report should name it.",
    ],
  },
  {
    slug: "7-days-to-die",
    name: "7 Days to Die",
    install: [
      "Download the zip from the mod's page and unzip it.",
      "Put the folder it holds inside the game's `Mods` folder, or the dedicated server's `Mods` folder. Make the folder if it is not there yet.",
      "Each guide says where the mod goes: on the server, on each player's game, or both. A server-only mod needs nothing from players.",
      "Code that a player installs needs EasyAntiCheat turned off. Server-only mods do not.",
      "Restart the game or the server. [Survivor's Toolkit](/survivors-toolkit) can turn mods on and off and keep profiles for you.",
    ],
    trouble: [
      "If a mod does nothing, check that its folder sits directly inside `Mods` (not `Mods/SomeFolder/SomeFolder`) and that it holds a `ModInfo.xml`.",
      "A mod that players install will not load with EasyAntiCheat on. Start the game without EAC.",
      "Check the mod is on the right side. A server-only mod in a player's game does nothing on someone else's server.",
      "Out of date? The [update checker](https://azraelsmods.com/7-days-to-die/check) compares your `Mods` folder with the newest versions.",
    ],
  },
  {
    slug: "sun-haven",
    name: "Sun Haven",
    install: [
      "Install [BepInEx 5.x](https://docs.bepinex.dev/articles/user_guide/installation/index.html) for Sun Haven first.",
      "Download the mod from its page, or from Thunderstore or Nexus when it is listed there.",
      "Copy the mod's DLL, and any files packed with it, into `Sun Haven/BepInEx/plugins/`. Subfolders are fine.",
      "Start the game. Each mod stands alone, and they work together.",
    ],
    trouble: [
      "If nothing loads, BepInEx itself is not running. Start the game once and look for `BepInEx/LogOutput.log`.",
      "That log names every plugin that loaded and any error it hit. Attach it to a report.",
      "After a Sun Haven update, check the mod's page for a newer version before reporting.",
    ],
  },
];

const SITE = "https://azraelsmods.com";
const key = (mod) => `${mod.game}/${mod.slug}`;
// Guide text is plain text; angle brackets must not turn into HTML when the Markdown is rendered.
const safe = (value) => String(value ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cell = (value) => safe(value).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

/**
 * One mod's guide as Markdown.
 * @param {any} mod  a catalog entry
 * @param {{ commands?: any, installs?: { label: string, hint: string } }} [extra]
 */
export function modGuideMarkdown(mod, extra = {}) {
  const guide = mod.guide ?? {};
  const out = [];
  const overview = guide.overview?.length ? guide.overview : [mod.description];
  out.push(...overview.map(safe), "");

  out.push("## Install", "");
  const facts = [];
  facts.push(`**Version:** ${safe(mod.version)}. [Download it from the mod's page](${SITE}/${key(mod)}).`);
  if (extra.installs) facts.push(`**Installs on:** ${safe(extra.installs.label)}. ${safe(extra.installs.hint)}`);
  if (mod.gameVersions?.length) facts.push(`**Works on:** game version ${mod.gameVersions.map(safe).join(", ")}.`);
  if (mod.requires?.length) facts.push(`**Needs:** ${mod.requires.map(safe).join(", ")}.`);
  if (mod.folder) facts.push(`**Folder:** \`Mods/${safe(mod.folder)}\`.`);
  if (mod.loadRules?.packageId) facts.push(`**Package id:** \`${safe(mod.loadRules.packageId)}\`.`);
  out.push(...facts.map((fact) => `- ${fact}`), "", `New to mods for this game? Follow the [install steps](/mods/${mod.game}).`, "");

  if (guide.sections?.length) {
    out.push("## What it does", "");
    for (const section of guide.sections) {
      if (guide.sections.length > 1) out.push(`### ${safe(section.label)}`, "");
      for (const feature of section.features ?? []) {
        out.push(`- **${safe(feature.title)}**${feature.tag ? ` (${safe(feature.tag)})` : ""}: ${safe(feature.body)}`);
      }
      out.push("");
    }
  }

  if (extra.commands?.groups?.length) {
    out.push("## Commands", "");
    if (extra.commands.intro) out.push(safe(extra.commands.intro), "");
    for (const group of extra.commands.groups) {
      out.push(`### ${safe(group.title)}`, "");
      if (group.aliases) out.push(`Also: ${safe(group.aliases)}`, "");
      if (group.note) out.push(safe(group.note), "");
      out.push("| Command | What it does |", "|---|---|");
      for (const row of group.rows ?? []) out.push(`| \`${cell(row.cmd).replace(/`/g, "")}\` | ${cell(row.does)}${row.admin ? " (admin)" : ""} |`);
      out.push("");
    }
  }

  if (mod.configs?.length) {
    out.push("## Settings files", "");
    for (const config of mod.configs) {
      out.push(`- \`Mods/${safe(config.folder)}/${safe(config.name)}\`${config.summary ? `: ${safe(config.summary)}` : ""} [Build it on the mod's page](${SITE}/${key(mod)}#${safe(config.id)}).`);
    }
    out.push("");
  }

  if (guide.notes?.length) out.push("## Good to know", "", ...guide.notes.map((note) => `- ${safe(note)}`), "");

  if (guide.faq?.rows?.length) {
    out.push(`## ${safe(guide.faq.title || "Questions")}`, "");
    if (guide.faq.intro) out.push(safe(guide.faq.intro), "");
    for (const row of guide.faq.rows) out.push(`**${safe(row.pair)}**`, "", safe(row.answer), "");
  }

  const compat = [
    ["Works with", guide.worksWith],
    ["Leave these off", guide.avoid],
  ].filter(([, list]) => list?.length);
  if (compat.length || guide.compatNotes?.length) {
    out.push("## Alongside other mods", "");
    for (const [label, list] of compat) {
      out.push(`**${label}**`, "", ...list.map((entry) => `- ${safe(entry.name)}${entry.note ? `: ${safe(entry.note)}` : ""}`), "");
    }
    for (const note of guide.compatNotes ?? []) out.push(safe(note), "");
  }

  const latest = mod.changelog?.[0];
  if (latest?.notes?.length) {
    out.push(`## New in ${safe(latest.version)}`, "", ...latest.notes.slice(0, 8).map((note) => `- ${note}`), "");
    out.push(`[Every version's changes](${SITE}/${key(mod)}#changelog)`, "");
  }
  return out.join("\n");
}

/** A game's page: the install steps and its mods. */
export function gameGuideMarkdown(game, mods) {
  const out = ["## Install a mod", "", ...game.install.map((step, at) => `${at + 1}. ${step}`), ""];
  out.push("## Guides", "");
  for (const mod of mods) out.push(`- [${safe(mod.name)}](/mods/${mod.game}/${mod.slug}): ${safe(mod.description)}`);
  out.push("", `Something not working? See [troubleshooting](/mods/${game.slug}/troubleshooting).`, "");
  return out.join("\n");
}

/**
 * A game's troubleshooting page: what to check first, then the known issues of every mod.
 * @param {{ mod: any, issues: { title: string, status: string }[] }[]} known  mods that have open issues
 */
export function troubleshootingMarkdown(game, known) {
  const out = ["## Check these first", "", ...game.trouble.map((line) => `- ${line}`), ""];
  out.push("## Known issues", "");
  if (known.length === 0) {
    out.push("Nothing is open right now.", "");
  } else {
    out.push("These are already on the list, so there is no need to report them again.", "");
    for (const { mod, issues } of known) {
      out.push(`### ${safe(mod.name)}`, "", ...issues.map((issue) => `- ${safe(issue.title)} *(${safe(issue.status)})*`), "", `[${safe(mod.name)} guide](/mods/${mod.game}/${mod.slug})`, "");
    }
  }
  out.push("## Still stuck?", "", `Open the mod's page on [azraelsmods.com](${SITE}/${game.slug}) and use **Report a problem**. Say what you did, what happened, and which other mods were on.`, "");
  return out.join("\n");
}

/** The "Known issues" block at the end of one mod's guide. */
export function knownIssuesMarkdown(mod, issues) {
  const out = ["## Known issues", ""];
  if (issues.length) out.push(...issues.map((issue) => `- ${safe(issue.title)} *(${safe(issue.status)})*`), "");
  else out.push("Nothing is open right now.", "");
  out.push(`Found something else? Use **Report a problem** on [the mod's page](${SITE}/${key(mod)}#report). More help: [troubleshooting](/mods/${mod.game}/troubleshooting).`, "");
  return out.join("\n");
}

/**
 * Notes for other modders: the ids, folders and load rules of every mod, and the data
 * the site publishes, all read from the catalog.
 */
export function moddersMarkdown(mods) {
  const out = [
    "If your mod should work with one of mine, these are the names and rules to build against. Everything here is read from the mods themselves, so it stays current.",
    "",
    "## RimWorld: package ids and load order",
    "",
    "Use the package id in your `About.xml` (`loadAfter`, `loadBefore`, `modDependencies`, `incompatibleWith`).",
    "",
    "| Mod | Package id | Needs | Loads after |",
    "|---|---|---|---|",
  ];
  const own = new Set(mods.filter((mod) => mod.loadRules).map((mod) => mod.loadRules.packageId));
  for (const mod of mods.filter((entry) => entry.game === "rimworld" && entry.loadRules)) {
    const rules = mod.loadRules;
    const needs = rules.dependencies.map((dep) => cell(dep.name || dep.id)).join(", ") || "Nothing";
    // Core and Harmony go without saying; the useful part is which of these mods come first.
    const after = rules.loadAfter.filter((id) => own.has(id)).map((id) => `\`${cell(id)}\``).join(", ") || "No rule";
    out.push(`| [${cell(mod.name)}](/mods/rimworld/${mod.slug}) | \`${cell(rules.packageId)}\` | ${needs} | ${after} |`);
  }
  const clashes = mods.filter((mod) => mod.loadRules?.incompatible?.length);
  if (clashes.length) {
    out.push("", "Marked incompatible:", "", ...clashes.map((mod) => `- ${safe(mod.name)}: ${mod.loadRules.incompatible.map((id) => `\`${safe(id)}\``).join(", ")}`));
  }
  out.push(
    "",
    "## 7 Days to Die: folder names",
    "",
    "Each mod unpacks to the folder below, which is also its `ModInfo.xml` name. Check for that name if your mod wants to know whether one of these is installed.",
    "",
    "| Mod | Folder in `Mods` | Installs on |",
    "|---|---|---|",
  );
  for (const mod of mods.filter((entry) => entry.game === "7-days-to-die" && entry.folder)) {
    out.push(`| [${cell(mod.name)}](/mods/7-days-to-die/${mod.slug}) | \`${cell(mod.folder)}\` | ${cell(mod.installsLabel ?? "")} |`);
  }
  out.push(
    "",
    "## Sun Haven",
    "",
    "The Sun Haven mods are BepInEx 5 plugins that each stand alone. Their source, with every plugin's GUID, is in the [SunhavenMod repository](https://github.com/AzraelGodKing/SunhavenMod).",
    "",
    "## Data you can read",
    "",
    "These are public and safe to poll every few minutes.",
    "",
    `- [\`${SITE}/releases.json\`](${SITE}/releases.json): every mod with its current version, upload date, supported game versions and release notes.`,
    `- [\`${SITE}/api/downloads\`](${SITE}/api/downloads): the newest zip of every mod, with its URL, size and SHA-256.`,
    `- \`${SITE}/download/<game>/<mod>\`: always redirects to the newest zip. Add \`/<version>\` for an older one.`,
    `- [\`${SITE}/feed.xml\`](${SITE}/feed.xml), \`/<game>/feed.xml\` and \`/<game>/<mod>/feed.xml\`: RSS for new versions.`,
    `- \`${SITE}/badge/<game>/<mod>.svg\` and \`/version.svg\`: download and version badges for a README.`,
    "",
    "## Source and contact",
    "",
    "- [RimWorld mods](https://github.com/AzraelGodKing/rimworld_mods), [7 Days to Die mods](https://github.com/AzraelGodKing/7d2d_mods) and [Sun Haven mods](https://github.com/AzraelGodKing/SunhavenMod) on GitHub.",
    `- For a clash between your mod and one of these, use **Report a problem** on that mod's page at [azraelsmods.com](${SITE}), or [ask for a compatibility feature](${SITE}/requests).`,
    "",
  );
  return out.join("\n");
}
