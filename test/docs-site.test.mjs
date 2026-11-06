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
