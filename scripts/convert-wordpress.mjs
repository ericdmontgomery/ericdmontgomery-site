// Converts the published pages in a WordPress export (WXR) to Markdown files
// for the Astro "pages" content collection.
//
//   node scripts/convert-wordpress.mjs <export.xml> [outDir]
//
// Re-runnable: it overwrites src/content/pages/*.md every time. No dependencies.
// WordPress pages are stored as block markup (HTML wrapped in <!-- wp:... --> comments).
// This keeps the words and structure (headings, paragraphs, links, emphasis, rules)
// and drops the layout (groups, columns, inline styles), forms and images.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , exportPath, outDir = 'src/content/pages'] = process.argv;
if (!exportPath) {
  console.error('Usage: node scripts/convert-wordpress.mjs <export.xml> [outDir]');
  process.exit(1);
}

// Which published pages to move, in navigation order. `nav` is the menu label.
// Newsletter is left out on purpose (email capture is deferred).
const PAGES = [
  { slug: 'home', nav: 'Home' },
  { slug: 'about', nav: 'About' },
  { slug: 'stories', nav: 'Stories' },
  { slug: 'the-unknown-mother', nav: 'The Unknown Mother' },
  { slug: 'glossary', nav: 'Glossary' },
];

// Links to pages that are not moved. Rendered as plain text so no live link leads to
// a 404. To restore the links later, empty this list and re-run the script.
const UNLINKED_PATHS = ['/newsletter/'];

const BRAND_FIX = [/\bEric Montgomery\b/g, 'Eric D. Montgomery'];

const xml = readFileSync(exportPath, 'utf8');

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

// Pull the published pages out of the export. The export is machine-generated and
// regular, so a pattern match is enough; no XML library needed.
function getPublishedPages() {
  const pages = new Map();
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const field = (tag) => {
      const r = item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
      return r ? r[1] : '';
    };
    if (field('wp:post_type') !== 'page' || field('wp:status') !== 'publish') continue;
    pages.set(field('wp:post_name'), { title: decode(field('title')), html: field('content:encoded') });
  }
  return pages;
}

// Inline markup inside one block: emphasis, links, line breaks; everything else dropped.
function inline(html) {
  const s = html
    .replace(/<br\s*\/?>/g, '  \n')
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/g, '*$2*')
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/g, '**$2**')
    .replace(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, text) =>
      UNLINKED_PATHS.includes(href) ? text : `[${text}](${href})`,
    )
    .replace(/<[^>]+>/g, '');
  return decode(s).trim();
}

function convert(html) {
  const stats = {
    forms: (html.match(/wp:jetpack\/subscriptions/g) || []).length,
    images: (html.match(/<figure\b/g) || []).length,
  };

  const s = html
    .replace(/<!--[\s\S]*?-->/g, '') // block comments, including the subscribe forms
    .replace(/<figure\b[\s\S]*?<\/figure>/g, ''); // images are not carried over

  // Walk the remaining markup, keeping only content blocks.
  const out = [];
  const block =
    /<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>|<p\b([^>]*)>([\s\S]*?)<\/p>|<hr\b[^>]*\/?>|<div class="wp-block-button\b[^"]*">\s*<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/div>/g;
  const idOf = (attrs) => (attrs || '').match(/\bid="([^"]+)"/)?.[1];
  for (const m of s.matchAll(block)) {
    if (m[1]) {
      const text = inline(m[3]);
      const id = idOf(m[2]);
      // A heading that is a jump target (glossary letters) keeps its id as raw HTML.
      out.push(id ? `<${m[1]} id="${id}">${text}</${m[1]}>` : `${'#'.repeat(Number(m[1][1]))} ${text}`);
    } else if (m[0].startsWith('<hr')) {
      out.push('---');
    } else if (m[6] !== undefined) {
      const text = inline(m[7]);
      out.push(UNLINKED_PATHS.includes(m[6]) ? text : `[${text}](${m[6]})`);
    } else {
      const text = inline(m[5]);
      if (!text) continue;
      const id = idOf(m[4]);
      // A paragraph that is a jump target keeps its id as raw HTML.
      out.push(id ? `<p id="${id}">${text}</p>` : text);
    }
  }
  return { md: out.join('\n\n') + '\n', stats };
}

const pages = getPublishedPages();
mkdirSync(outDir, { recursive: true });

PAGES.forEach(({ slug, nav }, order) => {
  const page = pages.get(slug);
  if (!page) throw new Error(`Published page "${slug}" not found in ${exportPath}`);
  const { md, stats } = convert(page.html);
  const body = md.replace(...BRAND_FIX);
  const title = page.title.replace(...BRAND_FIX);
  const front = ['---', `title: ${JSON.stringify(title)}`, `nav: ${JSON.stringify(nav)}`, `order: ${order}`, '---', ''].join('\n');
  writeFileSync(join(outDir, `${slug}.md`), front + '\n' + body);
  console.log(`${slug}: ${body.length} chars; dropped ${stats.images} image(s), ${stats.forms} subscribe form(s)`);
});
