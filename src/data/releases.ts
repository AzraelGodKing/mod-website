import { games } from "./games";
import { isNotReady, mods, notesFor, type ModEntry } from "./mods";
import { escapeHtml, plainText, renderInline } from "../../scripts/release-notes.mjs";

export interface Release {
  key: string;
  game: string;
  gameName: string;
  name: string;
  version: string;
  uploadedAt: string | null;
  path: string;
  // Markdown lines for the version the site serves.
  notes: string[];
}

// One entry per mod: the version the site serves now. scripts/announce-releases.mjs
// compares the live copy of /releases.json with the new build to find what changed.
export function releases(list: ModEntry[] = mods): Release[] {
  return list
    .filter((mod) => !isNotReady(mod))
    .map((mod) => ({
      key: `${mod.game}/${mod.slug}`,
      game: mod.game,
      gameName: games.find((game) => game.slug === mod.game)?.name ?? mod.game,
      name: mod.name,
      version: mod.version,
      uploadedAt: mod.uploadedAt && !Number.isNaN(Date.parse(mod.uploadedAt)) ? new Date(mod.uploadedAt).toISOString() : null,
      path: `/${mod.game}/${mod.slug}`,
      notes: notesFor(mod)?.notes ?? [],
    }))
    .sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? "") || a.name.localeCompare(b.name));
}

const FEED_SIZE = 30;

/** An RSS 2.0 feed of the newest releases. */
export function rssFeed(site: URL, options: { title: string; description: string; path: string; game?: string }): string {
  const items = releases(options.game ? mods.filter((mod) => mod.game === options.game) : mods)
    .filter((release) => release.uploadedAt)
    .slice(0, FEED_SIZE);
  const feedUrl = new URL(options.path, site).href;
  const homeUrl = new URL(options.game ? `/${options.game}` : "/", site).href;
  const newest = items[0]?.uploadedAt ? new Date(items[0].uploadedAt).toUTCString() : new Date(0).toUTCString();
  const body = items
    .map((release) => {
      const link = new URL(`${release.path}#changelog`, site).href;
      const html = release.notes.length
        ? `<ul>${release.notes.map((note) => `<li>${renderInline(note)}</li>`).join("")}</ul>`
        : `<p>${escapeHtml(release.name)} ${escapeHtml(release.version)} is out.</p>`;
      const summary = release.notes.map(plainText).join(" ").slice(0, 280);
      return [
        "    <item>",
        `      <title>${escapeHtml(`${release.name} ${release.version} (${release.gameName})`)}</title>`,
        `      <link>${link}</link>`,
        `      <guid isPermaLink="false">${escapeHtml(`${release.key}@${release.version}`)}</guid>`,
        `      <pubDate>${new Date(release.uploadedAt as string).toUTCString()}</pubDate>`,
        `      <category>${escapeHtml(release.gameName)}</category>`,
        `      <description>${escapeHtml(summary ? `${summary}${summary.length === 280 ? "…" : ""}` : html)}</description>`,
        `      <content:encoded><![CDATA[${html.replace(/]]>/g, "]]&gt;")}]]></content:encoded>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeHtml(options.title)}</title>
    <link>${homeUrl}</link>
    <description>${escapeHtml(options.description)}</description>
    <language>en</language>
    <lastBuildDate>${newest}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
${body}
  </channel>
</rss>
`;
}
