import assert from "node:assert/strict";
import test from "node:test";
import { githubSlug, renderChangelog, renderPage, rewriteHref, search, splitReadme } from "../docs-site/src/render.mjs";

const tool = { slug: "modwright", repo: "AzraelGodKing/ModWright" };
const README = `# Modwright

Intro. See [The Drop Pod](#the-drop-pod-rimworld-players) and ![shot](Assets/shot.png).

## Download

Get it from [releases](https://github.com/x/y/releases). Also [winget](#install-with-winget).

### Install with winget

\`\`\`
## not a heading
\`\`\`

## The Drop Pod (RimWorld players)

Sorting the load order. Back to [download](#download). Read [the changelog](CHANGELOG.md).

## Releasing (maintainer)

Tag it.
`;

test("GitHub-style slugs", () => {
  assert.equal(githubSlug("The Drop Pod (RimWorld players)"), "the-drop-pod-rimworld-players");
  assert.equal(githubSlug("The layout file: .steamhelper.json"), "the-layout-file-steamhelperjson");
});

test("the README splits into pages at ## headings, ignoring code blocks", () => {
  const doc = splitReadme(README);
  assert.equal(doc.title, "Modwright");
  assert.deepEqual(doc.pages.map((page) => page.slug), ["", "download", "the-drop-pod-rimworld-players", "releasing-maintainer"]);
  assert.deepEqual(doc.pages.map((page) => page.developer), [false, false, false, true]);
  assert.deepEqual(doc.pages[1].subheadings, [{ id: "install-with-winget", title: "Install with winget" }]);
  assert.equal(doc.anchors["install-with-winget"], "download");
});

test("links between sections point at the right page", () => {
  const doc = splitReadme(README);
  const intro = renderPage(doc.pages[0], { tool, anchors: doc.anchors });
  assert.match(intro, /href="\/modwright\/the-drop-pod-rimworld-players"/);
  assert.match(intro, /src="https:\/\/raw\.githubusercontent\.com\/AzraelGodKing\/ModWright\/main\/Assets\/shot\.png"/);
  const download = renderPage(doc.pages[1], { tool, anchors: doc.anchors });
  assert.match(download, /href="#install-with-winget"/);
  assert.match(download, /<h3 id="install-with-winget">/);
  const pod = renderPage(doc.pages[2], { tool, anchors: doc.anchors });
  assert.match(pod, /href="\/modwright\/download"/);
  assert.match(pod, /href="\/modwright\/changelog"/);
  assert.equal(rewriteHref("#nowhere", { tool, page: "", anchors: doc.anchors }), "#nowhere");
  assert.equal(rewriteHref("src/App.cs", { tool, page: "", anchors: doc.anchors }), "https://github.com/AzraelGodKing/ModWright/blob/main/src/App.cs");
});

test("changelog versions become anchors", () => {
  const { html, versions } = renderChangelog("# Changelog\n\n## 2.1.1\n\n- Fix\n\n## 2.1.0\n\n- New\n", tool);
  assert.deepEqual(versions, [{ id: "211", title: "2.1.1" }, { id: "210", title: "2.1.0" }]);
  assert.match(html, /<h2 id="211">/);
  assert.doesNotMatch(html, /<h1/);
});

test("search finds pages with every word", () => {
  const doc = splitReadme(README);
  const results = search(doc.pages, "load order");
  assert.deepEqual(results.map((r) => r.slug), ["the-drop-pod-rimworld-players"]);
  assert.deepEqual(search(doc.pages, ""), []);
});

test("a mod guide is written from the catalog entry", async () => {
  const { GAMES, gameGuideMarkdown, knownIssuesMarkdown, modGuideMarkdown, moddersMarkdown, troubleshootingMarkdown } = await import("../docs-site/src/mods.mjs");
  const { renderMarkdown } = await import("../docs-site/src/render.mjs");
  const mod = {
    slug: "blood-moon-sound",
    name: "Blood Moon Sound",
    game: "7-days-to-die",
    description: "Plays your clips.",
    version: "1.5.0",
    folder: "AzraelBloodMoonSound",
    gameVersions: ["V2.4"],
    requires: ["Nothing <else>"],
    configs: [{ id: "config", name: "discord.txt", folder: "AzraelBloodMoonSound", summary: "Discord posts." }],
    changelog: [{ version: "1.5.0", notes: ["Added **awards**."] }],
    guide: {
      overview: ["Play your own clips."],
      sections: [{ id: "clips", label: "Your clips", features: [{ title: "Blood moon", body: "Plays at the horde.", tag: "Players" }] }],
      notes: ["No sounds are shipped."],
      faq: { title: "Questions", intro: "", rows: [{ pair: "Server?", answer: "Optional." }] },
      worksWith: [{ name: "Bait", note: "Shares the webhook." }],
      avoid: [],
      compatNotes: [],
    },
  };
  const commands = { groups: [{ title: "Chat", rows: [{ cmd: "/bm|/bloodmoon", does: "Shows the countdown", admin: true }] }] };
  const md = modGuideMarkdown(mod, { commands, installs: { label: "Server, client optional", hint: "Install on the server." } });
  for (const part of ["## Install", "`Mods/AzraelBloodMoonSound`", "**Installs on:** Server, client optional", "### Chat", "| `/bm\\|/bloodmoon` | Shows the countdown (admin) |", "## Settings files", "## Good to know", "**Server?**", "- Bait: Shares the webhook.", "## New in 1.5.0", "Nothing &lt;else&gt;"]) {
    assert.ok(md.includes(part), `guide has ${part}`);
  }
  const html = renderMarkdown(md);
  assert.match(html, /<h2 id="install">/);
  assert.match(html, /href="\/mods\/7-days-to-die"/, "site links are left alone");
  assert.match(html, /<table>/);
  assert.ok(!html.includes("<else>"));

  const game = GAMES.find((entry) => entry.slug === "7-days-to-die");
  assert.match(gameGuideMarkdown(game, [mod]), /\[Blood Moon Sound\]\(\/mods\/7-days-to-die\/blood-moon-sound\)/);
  assert.match(troubleshootingMarkdown(game, []), /Nothing is open right now/);
  assert.match(troubleshootingMarkdown(game, [{ mod, issues: [{ title: "No sound on Linux", status: "In Progress" }] }]), /### Blood Moon Sound\n\n- No sound on Linux \*\(In Progress\)\*/);
  assert.match(knownIssuesMarkdown(mod, []), /Nothing is open/);

  const rim = { slug: "strata", name: "Strata", game: "rimworld", loadRules: { packageId: "azraelgodking.strata", dependencies: [{ id: "brrainz.harmony", name: "Harmony" }], incompatible: ["some.clash"], loadAfter: ["brrainz.harmony", "azraelgodking.homesteader"], loadBefore: [] } };
  const home = { slug: "homesteader", name: "Homesteader", game: "rimworld", loadRules: { packageId: "azraelgodking.homesteader", dependencies: [], incompatible: [], loadAfter: [], loadBefore: [] } };
  const modders = moddersMarkdown([rim, home, { ...mod, installsLabel: "Server, client optional" }]);
  assert.ok(modders.includes("| [Strata](/mods/rimworld/strata) | `azraelgodking.strata` | Harmony | `azraelgodking.homesteader` |"));
  assert.ok(modders.includes("- Strata: `some.clash`"));
  assert.ok(modders.includes("| [Blood Moon Sound](/mods/7-days-to-die/blood-moon-sound) | `AzraelBloodMoonSound` | Server, client optional |"));
});
