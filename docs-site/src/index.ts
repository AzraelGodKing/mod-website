// docs.azraelsmods.com: guides for Modwright and Survivor's Toolkit, built on request from
// each repo's README.md and CHANGELOG.md, so a README change shows here within 10 minutes.
import { KOFI_URL, SUBDOMAINS } from "../../src/data/links.mjs";
import { TOOLS, VARIANTS, fetchLatestRelease } from "../../src/downloads/tools.mjs";
import { escapeHtml, renderChangelog, renderMarkdown, renderPage, search, splitReadme } from "./render.mjs";
import { GAMES, gameGuideMarkdown, knownIssuesMarkdown, modGuideMarkdown, moddersMarkdown, troubleshootingMarkdown } from "./mods.mjs";
// Written by the site build (scripts/collect-mods.mjs), which the deploy runs before this Worker is published.
import catalogFile from "../../src/data/catalog.json";
import commandsFile from "../../src/data/sevendays-commands.json";
import { indexInfo, installHints, installLabels } from "../../src/data/sevendays-index";
import { NOT_READY, isPrivateMod } from "../../src/downloads/latest.mjs";

interface Env {
  ASSETS: Fetcher;
}

type Tool = (typeof TOOLS)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mod = any;
const MODS: Mod[] = (catalogFile as { mods: Mod[] }).mods
  .filter((mod) => !isPrivateMod(mod) && !NOT_READY.has(`${mod.game}/${mod.slug}`))
  .map((mod) => (mod.game === "7-days-to-die" ? { ...mod, installsLabel: installLabels[indexInfo(mod).installs] } : mod));
const modsOf = (game: string) => MODS.filter((mod) => mod.game === game).sort((a, b) => a.name.localeCompare(b.name));

function modMarkdown(mod: Mod): string {
  const installs = mod.game === "7-days-to-die" ? indexInfo(mod).installs : null;
  return modGuideMarkdown(mod, {
    commands: (commandsFile as Record<string, unknown>)[mod.slug],
    installs: installs ? { label: installLabels[installs], hint: installHints[installs] } : undefined,
  });
}

interface Issue {
  title: string;
  status: string;
}

// The open issues the main site lists on a mod's page (Linear, through its Worker).
async function knownIssues(mod: Mod): Promise<Issue[]> {
  try {
    const response = await fetch(`https://azraelsmods.com/api/issues?mod=${encodeURIComponent(`${mod.game}/${mod.slug}`)}`, {
      cf: { cacheTtl: FRESH_SECONDS, cacheEverything: true },
    });
    if (!response.ok) return [];
    const { issues } = (await response.json()) as { issues?: Issue[] };
    return Array.isArray(issues) ? issues : [];
  } catch {
    return [];
  }
}

const THEMES: Record<string, { accent: string; tagline: string; gameName: string }> = {
  modwright: { accent: "#e8c98a", tagline: "Load order, modlists and Workshop uploads for RimWorld.", gameName: "RimWorld" },
  "survivors-toolkit": { accent: "#e07a3d", tagline: "A mod manager for 7 Days to Die.", gameName: "7 Days to Die" },
};

const FRESH_SECONDS = 600;
// The last copy that loaded, used when GitHub can't be reached.
const STALE_SECONDS = 7 * 24 * 3600;

async function sourceFile(tool: Tool, file: string, ctx: ExecutionContext): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${tool.repo}/main/${file}`;
  const backupKey = new Request(`https://docs.azraelsmods.com/__source/${tool.slug}/${file}`);
  try {
    const response = await fetch(url, { cf: { cacheTtl: FRESH_SECONDS, cacheEverything: true } });
    if (response.ok) {
      const text = await response.text();
      ctx.waitUntil(
        caches.default.put(backupKey, new Response(text, { headers: { "cache-control": `public, max-age=${STALE_SECONDS}` } })),
      );
      return text;
    }
  } catch {
    // Fall through to the saved copy.
  }
  const saved = await caches.default.match(backupKey);
  return saved ? saved.text() : null;
}

function layout(options: { title: string; description: string; tool?: Tool; area?: "mods" | "modders"; nav?: string; body: string; status?: number }) {
  const theme = options.tool ? THEMES[options.tool.slug] : undefined;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<meta name="description" content="${escapeHtml(options.description)}">
<meta name="theme-color" content="#14110f">
<link rel="icon" href="https://azraelsmods.com/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
${theme ? `<style>:root{--accent:${theme.accent}}</style>` : ""}
</head>
<body id="top">
<a class="skip" href="#content">Skip to content</a>
<header class="bar">
  <a class="brand" href="/">Azrael's Mods <span>Guides</span></a>
  <nav aria-label="Guides">${TOOLS.map((tool) => `<a href="/${tool.slug}"${options.tool?.slug === tool.slug ? ' aria-current="true"' : ""}>${escapeHtml(tool.name)}</a>`).join("")}<a href="/mods"${options.area === "mods" ? ' aria-current="true"' : ""}>Mod guides</a><a href="/modders"${options.area === "modders" ? ' aria-current="true"' : ""}>For modders</a></nav>
  <form class="search top" action="/search" role="search"><label for="qa" class="vh">Search every guide</label><input id="qa" name="q" type="search" placeholder="Search every guide"></form>
</header>
<div class="${options.nav ? "with-nav" : "plain"}">
${options.nav ? `<nav class="side" aria-label="Guide pages">${options.nav}</nav>` : ""}
<main id="content" tabindex="-1">${options.body}</main>
</div>
<footer class="foot">
  <nav aria-label="More from Azrael"><a href="https://azraelsmods.com">Mods</a><a href="${SUBDOMAINS.status.href}">${SUBDOMAINS.status.label}</a><a href="${SUBDOMAINS.live.href}">${SUBDOMAINS.live.label}</a></nav>
  <p>Enjoying the tools? <a href="${KOFI_URL}" rel="me">Support me on Ko-fi</a></p>
</footer>
</body>
</html>`;
  return new Response(html, {
    status: options.status ?? 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": `public, max-age=${options.status ? 60 : 300}` },
  });
}

function sideNav(tool: Tool, pages: ReturnType<typeof splitReadme>["pages"], current: string) {
  const link = (slug: string, title: string, extra = "") =>
    `<li><a href="/${tool.slug}${slug ? `/${slug}` : ""}"${slug === current ? ' aria-current="page"' : ""}>${escapeHtml(title)}</a>${extra}</li>`;
  const sub = (page: (typeof pages)[number]) =>
    page.slug === current && page.subheadings.length
      ? `<ul class="sub">${page.subheadings.map((h) => `<li><a href="#${escapeHtml(h.id)}">${escapeHtml(h.title)}</a></li>`).join("")}</ul>`
      : "";
  const users = pages.filter((page) => !page.developer);
  const developers = pages.filter((page) => page.developer);
  return `<form class="search" action="/${tool.slug}/search" role="search"><label for="q" class="vh">Search the ${escapeHtml(tool.name)} guide</label><input id="q" name="q" type="search" placeholder="Search this guide"></form>
<ul>${users.map((page) => link(page.slug, page.title, sub(page))).join("")}${link("changelog", "Changelog")}</ul>
${developers.length ? `<p class="side-head">For developers</p><ul>${developers.map((page) => link(page.slug, page.title, sub(page))).join("")}</ul>` : ""}
<p class="side-head">Links</p><ul><li><a href="https://github.com/${tool.repo}">Source on GitHub</a></li><li><a href="https://github.com/${tool.repo}/issues">Report a problem</a></li></ul>`;
}

async function downloadBox(tool: Tool) {
  const release = await fetchLatestRelease(tool, (input: string, init?: RequestInit) => fetch(input, init));
  const buttons = Object.entries(VARIANTS)
    .map(([variant, info], i) => {
      const href = `https://azraelsmods.com/download/tools/${tool.slug}${variant === "setup" ? "" : `/${variant}`}`;
      return `<a class="btn${i === 0 ? " primary" : ""}" href="${href}"><strong>${escapeHtml(info.label)}</strong><span>${escapeHtml(info.note)}</span></a>`;
    })
    .join("");
  return `<section class="download" aria-labelledby="dl"><h2 id="dl">Download${release ? ` v${escapeHtml(release.version)}` : ""}</h2><p class="muted">Windows 10 and 11. Always the newest release.</p><div class="btns">${buttons}</div></section>`;
}

async function loadTool(tool: Tool, ctx: ExecutionContext) {
  const readme = await sourceFile(tool, "README.md", ctx);
  return readme ? splitReadme(readme) : null;
}

function unavailable(tool: Tool) {
  return layout({
    title: `${tool.name} guide`,
    description: tool.summary,
    tool,
    status: 503,
    body: `<h1>The guide can't load right now</h1><p>GitHub didn't answer. Try again in a minute, or read the <a href="https://github.com/${tool.repo}#readme">README on GitHub</a>.</p>`,
  });
}

async function home() {
  const cards = TOOLS.map((tool) => {
    const theme = THEMES[tool.slug];
    return `<a class="card" href="/${tool.slug}" style="--accent:${theme?.accent ?? "#e8c98a"}"><span class="kicker">${escapeHtml(theme?.gameName ?? "")}</span><h2>${escapeHtml(tool.name)}</h2><p>${escapeHtml(tool.summary)}</p><span class="more">Read the guide →</span></a>`;
  }).join("");
  return layout({
    title: "Guides · Azrael's Mods",
    description: "How to use Modwright and Survivor's Toolkit, Azrael's Windows apps for RimWorld and 7 Days to Die mods.",
    body: `<h1>Guides</h1><p class="lede">How to install and use Azrael's desktop apps and mods, with every version's changes.</p><form class="search big" action="/search" role="search"><label for="qh" class="vh">Search every guide</label><input id="qh" name="q" type="search" placeholder="Search every guide"><button>Search</button></form><h2>Desktop apps</h2><div class="cards">${cards}</div><h2>Mods</h2><div class="cards">${gameCards()}</div><p class="muted">Making a mod of your own? See the <a href="/modders">notes for modders</a>.</p>`,
  });
}

const GAME_ACCENTS: Record<string, string> = { rimworld: "#e8c98a", "7-days-to-die": "#e07a3d", "sun-haven": "#8fc36b" };

function gameCards() {
  return GAMES.map((game) => {
    const count = modsOf(game.slug).length;
    return `<a class="card" href="/mods/${game.slug}" style="--accent:${GAME_ACCENTS[game.slug] ?? "#e8c98a"}"><span class="kicker">${count} ${count === 1 ? "guide" : "guides"}</span><h2>${escapeHtml(game.name)}</h2><p>How to install each mod, what it does, its commands and settings, and known issues.</p><span class="more">Read the guides →</span></a>`;
  }).join("");
}

function modsNav(game: (typeof GAMES)[number], current: string) {
  const link = (slug: string, title: string) =>
    `<li><a href="/mods/${game.slug}${slug ? `/${slug}` : ""}"${slug === current ? ' aria-current="page"' : ""}>${escapeHtml(title)}</a></li>`;
  return `<p class="side-head">${escapeHtml(game.name)}</p><ul>${link("", "Install a mod")}${link("troubleshooting", "Troubleshooting")}</ul>
<p class="side-head">Mods</p><ul>${modsOf(game.slug).map((mod) => link(mod.slug, mod.name)).join("")}</ul>
<p class="side-head">Other games</p><ul>${GAMES.filter((entry) => entry.slug !== game.slug).map((entry) => `<li><a href="/mods/${entry.slug}">${escapeHtml(entry.name)}</a></li>`).join("")}</ul>`;
}

async function modsSection(parts: string[]): Promise<Response | null> {
  if (parts.length === 1) {
    return layout({
      title: "Mod guides · Azrael's Mods",
      description: "Guides for Azrael's RimWorld, 7 Days to Die and Sun Haven mods.",
      area: "mods",
      body: `<h1>Mod guides</h1><p class="lede">Pick a game. Each mod has its own page with how to install it, what it does, and what is known to be broken.</p><div class="cards">${gameCards()}</div>`,
    });
  }
  const game = GAMES.find((entry) => entry.slug === parts[1]);
  if (!game || parts.length > 3) return null;
  const theme = `<style>:root{--accent:${GAME_ACCENTS[game.slug] ?? "#e8c98a"}}</style>`;
  const kicker = `<p class="kicker"><a href="/mods/${game.slug}">${escapeHtml(game.name)} mods</a></p>`;
  const page = parts[2] ?? "";
  if (page === "") {
    return layout({
      title: `${game.name} mod guides`,
      description: `How to install Azrael's ${game.name} mods, and a guide for each one.`,
      area: "mods",
      nav: modsNav(game, ""),
      body: `${theme}<p class="kicker"><a href="/mods">Mod guides</a></p><h1>${escapeHtml(game.name)} mods</h1><div class="prose">${renderMarkdown(gameGuideMarkdown(game, modsOf(game.slug)))}</div>`,
    });
  }
  if (page === "troubleshooting") {
    const all = await Promise.all(modsOf(game.slug).map(async (mod) => ({ mod, issues: await knownIssues(mod) })));
    return layout({
      title: `Troubleshooting · ${game.name} mods`,
      description: `What to check when a ${game.name} mod is not working, and the known issues.`,
      area: "mods",
      nav: modsNav(game, "troubleshooting"),
      body: `${theme}${kicker}<h1>Troubleshooting</h1><div class="prose">${renderMarkdown(troubleshootingMarkdown(game, all.filter((entry) => entry.issues.length)))}</div>`,
    });
  }
  const mod = modsOf(game.slug).find((entry) => entry.slug === page);
  if (!mod) return null;
  const markdown = `${modMarkdown(mod)}\n${knownIssuesMarkdown(mod, await knownIssues(mod))}`;
  return layout({
    title: `${mod.name} guide · ${game.name}`,
    description: mod.description,
    area: "mods",
    nav: modsNav(game, mod.slug),
    body: `${theme}${kicker}<h1>${escapeHtml(mod.name)}</h1><div class="prose">${renderMarkdown(markdown)}</div><p class="edit muted">Built from the mod's own files. <a href="https://azraelsmods.com/${mod.game}/${mod.slug}">Download and screenshots on azraelsmods.com</a>.</p>`,
  });
}

function modders() {
  return layout({
    title: "For modders · Azrael's Mods",
    description: "Package ids, folder names, load order rules and public data for making a mod that works with Azrael's mods.",
    area: "modders",
    body: `<h1>For modders</h1><div class="prose">${renderMarkdown(moddersMarkdown(MODS))}</div>`,
  });
}

// One search over every tool guide, every mod guide and the modder notes.
async function searchAll(url: URL, ctx: ExecutionContext) {
  const q = (url.searchParams.get("q") ?? "").slice(0, 100);
  const pages: { slug: string; title: string; text: string; href: string; where: string }[] = [];
  if (q.trim()) {
    const docs = await Promise.all(TOOLS.map(async (tool) => ({ tool, doc: await loadTool(tool, ctx) })));
    for (const { tool, doc } of docs) {
      for (const page of doc?.pages ?? []) {
        const href = `/${tool.slug}${page.slug ? `/${page.slug}` : ""}`;
        pages.push({ slug: href, title: page.title, text: page.text, href, where: tool.name });
      }
    }
    for (const mod of MODS) {
      const href = `/mods/${mod.game}/${mod.slug}`;
      pages.push({ slug: href, title: mod.name, text: modMarkdown(mod), href, where: GAMES.find((game) => game.slug === mod.game)?.name ?? "" });
    }
    for (const game of GAMES) {
      pages.push({ slug: `/mods/${game.slug}`, title: `Install ${game.name} mods`, text: [...game.install, ...game.trouble].join("\n"), href: `/mods/${game.slug}`, where: game.name });
    }
    pages.push({ slug: "/modders", title: "For modders", text: moddersMarkdown(MODS), href: "/modders", where: "Modding" });
  }
  const where = new Map(pages.map((page) => [page.slug, page.where]));
  const results = search(pages, q).slice(0, 40);
  const list = results.length
    ? `<ol class="results">${results.map((r) => `<li><a href="${escapeHtml(r.slug)}">${escapeHtml(r.title)}</a> <span class="where">${escapeHtml(where.get(r.slug) ?? "")}</span><p>${escapeHtml(r.snippet)}…</p></li>`).join("")}</ol>`
    : `<p>${q.trim() ? `Nothing matched “${escapeHtml(q)}”. Try fewer words.` : "Type a word or two to search every guide."}</p>`;
  return layout({
    title: "Search · Guides",
    description: "Search every tool and mod guide.",
    body: `<h1>Search every guide</h1><form class="search big" action="/search" role="search"><label for="q3" class="vh">Search</label><input id="q3" name="q" type="search" value="${escapeHtml(q)}"><button>Search</button></form>${q.trim() ? `<p class="muted">${results.length} ${results.length === 1 ? "page" : "pages"} for “${escapeHtml(q)}”.</p>` : ""}${list}`,
  });
}

export async function handle(request: Request, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return home();
  if (parts[0] === "mods") return modsSection(parts);
  if (parts[0] === "modders" && parts.length === 1) return modders();
  if (parts[0] === "search" && parts.length === 1) return searchAll(url, ctx);
  const tool = TOOLS.find((entry) => entry.slug === parts[0]);
  if (!tool) return null;
  if (parts.length > 2) return null;
  const section = parts[1] ?? "";
  if (section === "download") {
    return Response.redirect(`https://azraelsmods.com/download/tools/${tool.slug}`, 302);
  }

  const doc = await loadTool(tool, ctx);
  if (!doc) return unavailable(tool);

  if (section === "changelog") {
    const changelog = await sourceFile(tool, "CHANGELOG.md", ctx);
    if (!changelog) return unavailable(tool);
    const { html, versions } = renderChangelog(changelog, tool);
    const jump = versions.length
      ? `<p class="jump">Jump to: ${versions.slice(0, 12).map((v) => `<a href="#${escapeHtml(v.id)}">${escapeHtml(v.title)}</a>`).join(" ")}</p>`
      : "";
    return layout({
      title: `Changelog · ${tool.name}`,
      description: `Every ${tool.name} release and what changed.`,
      tool,
      nav: sideNav(tool, doc.pages, "changelog"),
      body: `<h1>${escapeHtml(tool.name)} changelog</h1>${jump}<div class="prose changelog">${html}</div>`,
    });
  }

  if (section === "search") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 100);
    const results = search(doc.pages, q);
    const list = results.length
      ? `<ol class="results">${results.map((r) => `<li><a href="/${tool.slug}${r.slug ? `/${r.slug}` : ""}">${escapeHtml(r.title)}</a><p>${escapeHtml(r.snippet)}…</p></li>`).join("")}</ol>`
      : `<p>Nothing matched${q ? ` “${escapeHtml(q)}”` : ""}. Try fewer words.</p>`;
    return layout({
      title: `Search · ${tool.name}`,
      description: `Search the ${tool.name} guide.`,
      tool,
      nav: sideNav(tool, doc.pages, "search"),
      body: `<h1>Search the ${escapeHtml(tool.name)} guide</h1><form class="search big" action="/${tool.slug}/search" role="search"><label for="q2" class="vh">Search</label><input id="q2" name="q" type="search" value="${escapeHtml(q)}"><button>Search</button></form>${list}`,
    });
  }

  const index = doc.pages.findIndex((page) => page.slug === section);
  if (index < 0) return null;
  const page = doc.pages[index];
  const html = renderPage(page, { tool, anchors: doc.anchors });
  const prev = doc.pages[index - 1];
  const next = doc.pages[index + 1];
  const pager = `<nav class="pager" aria-label="Next and previous">${prev ? `<a href="/${tool.slug}${prev.slug ? `/${prev.slug}` : ""}">← ${escapeHtml(prev.title)}</a>` : "<span></span>"}${next ? `<a href="/${tool.slug}/${next.slug}">${escapeHtml(next.title)} →</a>` : ""}</nav>`;
  const theme = THEMES[tool.slug];
  const intro = section === ""
    ? `<p class="kicker">${escapeHtml(theme?.gameName ?? "")}</p><h1>${escapeHtml(doc.title || tool.name)}</h1>${theme ? `<p class="lede">${escapeHtml(theme.tagline)}</p>` : ""}${await downloadBox(tool)}`
    : `<p class="kicker"><a href="/${tool.slug}">${escapeHtml(tool.name)}</a></p><h1>${escapeHtml(page.title)}</h1>`;
  return layout({
    title: section ? `${page.title} · ${tool.name}` : `${tool.name} guide`,
    description: section ? `${page.title}: part of the ${tool.name} guide.` : tool.summary,
    tool,
    nav: sideNav(tool, doc.pages, page.slug),
    body: `${intro}<div class="prose">${html}</div>${pager}<p class="edit muted">From the <a href="https://github.com/${tool.repo}/blob/main/README.md">README on GitHub</a>.</p>`,
  });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      return Response.redirect(new URL(url.pathname.replace(/\/+$/, "") + url.search, url).href, 301);
    }
    if (/\.\w+$/.test(url.pathname)) return env.ASSETS.fetch(request);
    const response = await handle(request, ctx);
    if (response) return response;
    return layout({
      title: "Not found · Guides",
      description: "That guide page doesn't exist.",
      status: 404,
      body: `<h1>That page isn't here</h1><p>Pages move when the README changes. Start from <a href="/">the guides</a>.</p>`,
    });
  },
} satisfies ExportedHandler<Env>;
