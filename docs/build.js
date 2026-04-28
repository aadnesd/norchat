#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const MarkdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");

function parseArgs(argv) {
  const args = { out: "_site", base: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--out") {
      args.out = argv[index + 1] || args.out;
      index += 1;
    } else if (current === "--base") {
      args.base = argv[index + 1] || args.base;
      index += 1;
    }
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugFromFilename(fileName) {
  return path.basename(fileName, path.extname(fileName));
}

function titleFromMarkdown(source, fallback) {
  const match = source.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeBase(base) {
  if (!base || base === "/") {
    return "";
  }

  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function buildLayout({ title, pageTitle, navItems, content, base }) {
  const nav = navItems
    .map((item) => {
      const href = item.slug === "index" ? `${base}/` || "/" : `${base}/${item.slug}.html`;
      const current = item.slug === pageTitle ? ' aria-current="page"' : "";
      return `<a href="${href}"${current}>${escapeHtml(item.title)}</a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f1e8;
        --panel: rgba(255, 255, 255, 0.76);
        --text: #172026;
        --muted: #52616d;
        --line: rgba(23, 32, 38, 0.12);
        --accent: #0f766e;
        --accent-soft: rgba(15, 118, 110, 0.12);
        --code-bg: rgba(23, 32, 38, 0.06);
        --shadow: 0 24px 60px rgba(23, 32, 38, 0.08);
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 32rem),
          radial-gradient(circle at right, rgba(199, 137, 78, 0.16), transparent 28rem),
          var(--bg);
      }

      a { color: var(--accent); }
      code, pre { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; }
      pre {
        overflow-x: auto;
        padding: 1rem;
        border-radius: 14px;
        background: var(--code-bg);
      }

      :not(pre) > code {
        padding: 0.18rem 0.36rem;
        border-radius: 999px;
        background: var(--code-bg);
      }

      .shell {
        width: min(1080px, calc(100% - 2rem));
        margin: 2rem auto;
        background: var(--panel);
        backdrop-filter: blur(14px);
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }

      header {
        padding: 2rem 2rem 1rem;
        border-bottom: 1px solid var(--line);
      }

      h1 {
        margin: 0;
        font-size: clamp(2rem, 3vw, 3.25rem);
        line-height: 1.05;
      }

      .subhead {
        margin-top: 0.75rem;
        max-width: 42rem;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.55;
      }

      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: 1.5rem;
      }

      nav a {
        text-decoration: none;
        padding: 0.55rem 0.9rem;
        border-radius: 999px;
        border: 1px solid var(--line);
        color: var(--text);
        background: rgba(255, 255, 255, 0.56);
      }

      nav a[aria-current="page"] {
        background: var(--accent-soft);
        border-color: rgba(15, 118, 110, 0.24);
      }

      main {
        padding: 2rem;
        line-height: 1.75;
        font-size: 1.04rem;
      }

      img, table {
        max-width: 100%;
      }

      table {
        border-collapse: collapse;
      }

      th, td {
        padding: 0.65rem 0.8rem;
        border: 1px solid var(--line);
      }

      blockquote {
        margin: 1.5rem 0;
        padding-left: 1rem;
        border-left: 3px solid rgba(15, 118, 110, 0.35);
        color: var(--muted);
      }

      @media (max-width: 720px) {
        .shell {
          width: calc(100% - 1rem);
          margin: 0.5rem auto 1rem;
          border-radius: 20px;
        }

        header, main {
          padding: 1.25rem;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <h1>Project Documentation</h1>
        <p class="subhead">Published from the repository's markdown files for GitHub Pages.</p>
        <nav>${nav}</nav>
      </header>
      <main>
        ${content}
      </main>
    </div>
  </body>
</html>`;
}

function main() {
  const rootDir = process.cwd();
  const docsDir = path.join(rootDir, "docs");
  const { out, base } = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(rootDir, out);
  const normalizedBase = normalizeBase(base);

  const markdownFiles = fs
    .readdirSync(docsDir)
    .filter((file) => file.endsWith(".md"))
    .sort();

  if (markdownFiles.length === 0) {
    throw new Error(`No markdown files found in ${docsDir}`);
  }

  ensureDir(outputDir);

  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
  }).use(markdownItAnchor);

  const pages = markdownFiles.map((fileName) => {
    const source = fs.readFileSync(path.join(docsDir, fileName), "utf8");
    const slug = slugFromFilename(fileName);
    const title = titleFromMarkdown(source, slug);
    return {
      fileName,
      slug,
      title,
      source,
      html: md.render(source),
    };
  });

  const navItems = [{ slug: "index", title: "Overview" }, ...pages];

  const indexCards = pages
    .map((page) => {
      const href = `${normalizedBase}/${page.slug}.html` || `/${page.slug}.html`;
      return `<li><a href="${href}">${escapeHtml(page.title)}</a></li>`;
    })
    .join("");

  const indexHtml = buildLayout({
    title: "Project Documentation",
    pageTitle: "index",
    navItems,
    base: normalizedBase,
    content: `<h2>Available Documents</h2><ul>${indexCards}</ul>`,
  });

  fs.writeFileSync(path.join(outputDir, "index.html"), indexHtml);

  for (const page of pages) {
    const html = buildLayout({
      title: `${page.title} | Project Documentation`,
      pageTitle: page.slug,
      navItems,
      base: normalizedBase,
      content: page.html,
    });
    fs.writeFileSync(path.join(outputDir, `${page.slug}.html`), html);
  }
}

main();
