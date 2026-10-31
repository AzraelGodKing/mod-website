// Posts new mod versions to Discord after a deploy.
//
//   node scripts/announce-releases.mjs <before.json> <after.json>
//
// before.json is the live /releases.json saved before the deploy, after.json the new
// build's dist/releases.json. A mod whose version went up is announced on the webhook in
// DISCORD_WEBHOOK_URL. Without the webhook, or without a before file (first deploy, or
// the live site could not be read), nothing is posted, so a deploy never spams the channel.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { compareVersions } from "../src/downloads/latest.mjs";
import { plainText } from "./release-notes.mjs";

const SITE = "https://azraelsmods.com";
// Discord allows 10 embeds per message and 4096 characters per description.
const EMBEDS_PER_MESSAGE = 10;
const DESCRIPTION_LIMIT = 1500;
const GAME_COLORS = { rimworld: 0x8b1a2b, "sun-haven": 0xe0a63a, "7-days-to-die": 0x9b2a1f };

function readReleases(file) {
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(data?.releases) ? data.releases : null;
  } catch {
    return null;
  }
}

/** Releases in `after` whose version is newer than in `before`. A mod new to the site counts too. */
export function newReleases(before, after) {
  const previous = new Map(before.map((release) => [release.key, release.version]));
  return after.filter((release) => {
    const old = previous.get(release.key);
    return old === undefined || compareVersions(release.version, old) > 0;
  });
}

export function embedFor(release, site = SITE) {
  const lines = (release.notes ?? []).map((note) => `• ${plainText(note)}`);
  let description = "";
  for (const line of lines) {
    if (description.length + line.length + 1 > DESCRIPTION_LIMIT) {
      description += `${description ? "\n" : ""}…and more on the mod page.`;
      break;
    }
    description += `${description ? "\n" : ""}${line}`;
  }
  return {
    title: `${release.name} ${release.version}`,
    url: `${site}${release.path}#changelog`,
    description: description || "A new version is up.",
    color: GAME_COLORS[release.game] ?? 0xc9a15b,
    footer: { text: release.gameName },
    ...(release.uploadedAt ? { timestamp: release.uploadedAt } : {}),
  };
}

export function messagesFor(releases, site = SITE) {
  const messages = [];
  for (let at = 0; at < releases.length; at += EMBEDS_PER_MESSAGE) {
    const chunk = releases.slice(at, at + EMBEDS_PER_MESSAGE);
    messages.push({
      username: "Azrael's Mods",
      content: at === 0 ? (releases.length === 1 ? "New mod update:" : `${releases.length} mod updates:`) : undefined,
      embeds: chunk.map((release) => embedFor(release, site)),
      allowed_mentions: { parse: [] },
    });
  }
  return messages;
}

export async function announce(beforeFile, afterFile, { webhook = process.env.DISCORD_WEBHOOK_URL, fetchImpl = globalThis.fetch, log = console.log } = {}) {
  if (!webhook) {
    log("DISCORD_WEBHOOK_URL is not set. No Discord post.");
    return 0;
  }
  const before = beforeFile ? readReleases(beforeFile) : null;
  const after = readReleases(afterFile);
  if (!before || !after) {
    log("No earlier /releases.json to compare with. No Discord post this time.");
    return 0;
  }
  const fresh = newReleases(before, after);
  if (fresh.length === 0) {
    log("No new versions since the last deploy.");
    return 0;
  }
  // A brand-new site, or a catalog that was broken, would announce everything at once.
  if (fresh.length > 15 && fresh.length >= after.length / 2) {
    log(`${fresh.length} mods look new; that is a catalog reset, not releases. No Discord post.`);
    return 0;
  }
  for (const message of messagesFor(fresh)) {
    const response = await fetchImpl(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!response.ok) {
      log(`Discord answered ${response.status}. The rest of the announcement was skipped.`);
      return 0;
    }
  }
  log(`Announced ${fresh.map((release) => `${release.key} ${release.version}`).join(", ")} on Discord.`);
  return fresh.length;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  // A failed announcement never fails the deploy.
  await announce(process.argv[2], process.argv[3]).catch((error) => console.warn(`Discord post failed: ${error.message}`));
}
