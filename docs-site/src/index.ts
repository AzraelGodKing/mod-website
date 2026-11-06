// docs.azraelsmods.com: guides for Modwright and Survivor's Toolkit, built on request from
// each repo's README.md and CHANGELOG.md, so a README change shows here within 10 minutes.
import { KOFI_URL, SUBDOMAINS } from "../../src/data/links.mjs";
import { TOOLS, VARIANTS, fetchLatestRelease } from "../../src/downloads/tools.mjs";
import { escapeHtml, renderChangelog, renderPage, search, splitReadme } from "./render.mjs";

interface Env {
  ASSETS: Fetcher;
}

type Tool = (typeof TOOLS)[number];

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

function layout(options: { title: string; description: string; tool?: Tool; nav?: string; body: string; status?: number }) {
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
  <nav aria-label="Tools">${TOOLS.map((tool) => `<a href="/${tool.slug}"${options.tool?.slug === tool.slug ? ' aria-current="true"' : ""}>${escapeHtml(tool.name)}</a>`).join("")}</nav>
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
    body: `<h1>Tool guides</h1><p class="lede">How to install and use Azrael's desktop apps, with every version's changes.</p><div class="cards">${cards}</div>`,
  });
}

export async function handle(request: Request, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return home();
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
