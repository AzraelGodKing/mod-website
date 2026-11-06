// Turns a tool's README.md and CHANGELOG.md into docs pages: one page per "## " section.
// Kept free of Worker APIs so test/docs-site.test.mjs can run it in Node.
import { Marked } from "marked";

// Sections for people working on the tool itself. They are listed under "For developers".
const DEVELOPER = /maintainer|^build|^tests$|^releasing|history and branches|not carried over|code signing/i;

/** GitHub's heading anchor: lower case, punctuation dropped, spaces to dashes. */
export function githubSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function plainHeading(token) {
  return token.text.replace(/`/g, "").replace(/\*\*|__/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}

/** Heading anchors made unique the way GitHub does it: "usage", "usage-1", ... */
function slugger() {
  const seen = new Map();
  return (text) => {
    const base = githubSlug(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}

/**
 * Splits the README into pages.
 * @returns {{ title: string, pages: { slug: string, title: string, developer: boolean, tokens: object[], subheadings: { id: string, title: string }[], text: string }[], anchors: Record<string, string> }}
 */
export function splitReadme(markdown) {
  const lexer = new Marked();
  const tokens = lexer.lexer(markdown);
  const slug = slugger();
  const anchors = {};
  const pages = [];
  let title = "";
  let current = { slug: "", title: "Overview", developer: false, tokens: [], subheadings: [], text: "" };
  pages.push(current);
  for (const token of tokens) {
    if (token.type === "heading") {
      const text = plainHeading(token);
      const id = slug(text);
      token.anchor = id;
      if (token.depth === 1 && !title) {
        title = text;
        anchors[id] = "";
        continue;
      }
      if (token.depth === 2) {
        current = { slug: id, title: text, developer: DEVELOPER.test(text), tokens: [], subheadings: [], text: "" };
        pages.push(current);
        anchors[id] = id;
        continue;
      }
      anchors[id] = current.slug;
      if (token.depth === 3) current.subheadings.push({ id, title: text });
    }
    current.tokens.push(token);
    if (token.raw) current.text += token.raw;
  }
  for (const page of pages) page.tokens.links = tokens.links;
  return { title, pages, anchors };
}

/** Where a link in the README should point on the docs site. */
export function rewriteHref(href, { tool, page, anchors, image = false }) {
  if (!href) return href;
  if (href.startsWith("#")) {
    const anchor = href.slice(1);
    const target = anchors[anchor];
    if (target === undefined) return href;
    const base = `/${tool.slug}${target ? `/${target}` : ""}`;
    if (target === page) return anchor === page ? "#top" : href;
    return anchor === target ? base : `${base}#${anchor}`;
  }
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return href;
  const path = href.replace(/^\.?\//, "");
  if (/^README\.md(#|$)/i.test(path)) return rewriteHref(path.slice(9) || `#${Object.keys(anchors)[0] ?? ""}`, { tool, page, anchors });
  if (/^CHANGELOG\.md$/i.test(path)) return `/${tool.slug}/changelog`;
  return image ? `https://raw.githubusercontent.com/${tool.repo}/main/${path}` : `https://github.com/${tool.repo}/blob/main/${path}`;
}

function markedFor(context) {
  return new Marked({
    gfm: true,
    renderer: {
      heading(token) {
        const id = token.anchor ?? githubSlug(token.text);
        const inner = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${escapeHtml(id)}"><a class="anchor" href="#${escapeHtml(id)}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${token.depth}>\n`;
      },
      link(token) {
        const href = rewriteHref(token.href, context);
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
        const external = /^https?:/i.test(href) ? ' rel="noopener"' : "";
        return `<a href="${escapeHtml(href)}"${title}${external}>${this.parser.parseInline(token.tokens)}</a>`;
      },
      image(token) {
        const src = rewriteHref(token.href, { ...context, image: true });
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(token.text)}" loading="lazy">`;
      },
    },
  });
}

/** One page's HTML. */
export function renderPage(page, context) {
  return markedFor({ ...context, page: page.slug }).parser(page.tokens);
}

/** The changelog, with each "## 2.1.1" heading kept as an anchor. */
export function renderChangelog(markdown, tool) {
  const tokens = new Marked().lexer(markdown);
  const slug = slugger();
  const versions = [];
  const body = tokens.filter((token) => !(token.type === "heading" && token.depth === 1));
  for (const token of body) {
    if (token.type === "heading") {
      token.anchor = slug(plainHeading(token));
      if (token.depth === 2) versions.push({ id: token.anchor, title: plainHeading(token) });
    }
  }
  body.links = tokens.links;
  const html = markedFor({ tool, page: "changelog", anchors: {} }).parser(body);
  return { html, versions };
}

/** Search across a tool's pages: the pages whose text has every word. */
export function search(pages, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  return pages
    .map((page) => ({ page, text: `${page.title}\n${page.text}`.toLowerCase() }))
    .filter(({ text }) => words.every((word) => text.includes(word)))
    .map(({ page, text }) => {
      const at = text.indexOf(words[0]);
      const raw = `${page.title}\n${page.text}`;
      const snippet = raw
        .slice(Math.max(0, at - 80), at + 160)
        .replace(/[#*`_>\[\]]|\(http[^)]*\)/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const score = words.reduce((sum, word) => sum + text.split(word).length - 1, 0) + (page.title.toLowerCase().includes(words[0]) ? 20 : 0);
      return { slug: page.slug, title: page.title, snippet, score };
    })
    .sort((a, b) => b.score - a.score);
}
