// Converts the published pages in a WordPress export (WXR) to Markdown files
// for the Astro "pages" content collection.
//
//   node scripts/convert-wordpress.mjs <export.xml> [outDir]
//
// Re-runnable: it overwrites src/content/pages/*.md every time. No dependencies.
// WordPress pages are stored as block markup (HTML wrapped in <!-- wp:... --> comments).
// This keeps the words, the structure (headings, paragraphs, links, emphasis, rules)
// and the layout as a few plain class names (see containerClass below); it drops
// WordPress's own markup, inline styles, forms and images.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , exportPath, outDir = 'src/content/pages'] = process.argv;
if (!exportPath) {
  console.error('Usage: node scripts/convert-wordpress.mjs <export.xml> [outDir]');
  process.exit(1);
}

// Which published pages to move, in navigation order. `nav` is the menu label.
// `theme` (optional) names a property theme from src/styles/themes.css.
// Newsletter is left out on purpose (email capture is deferred).
const PAGES = [
  { slug: 'home', nav: 'Home' },
  { slug: 'about', nav: 'About' },
  { slug: 'stories', nav: 'Stories' },
  { slug: 'the-unknown-mother', nav: 'The Unknown Mother', theme: 'plum-dusk' },
  { slug: 'glossary', nav: 'Glossary', theme: 'plum-dusk' },
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

// The same, but kept as clean HTML, for blocks written out as HTML (labels, buttons).
// Markdown is not read inside an HTML line, so emphasis and links stay as tags.
function inlineHtml(html) {
  return html
    .replace(/<(em|i)\b[^>]*>/g, '<em>').replace(/<\/(em|i)>/g, '</em>')
    .replace(/<(strong|b)\b[^>]*>/g, '<strong>').replace(/<\/(strong|b)>/g, '</strong>')
    .replace(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, text) =>
      UNLINKED_PATHS.includes(href) ? text : `<a href="${href}">${text}</a>`,
    )
    .replace(/<br\s*\/?>/g, '<br>')
    .replace(/<(?!\/?(em|strong|a|br)\b)[^>]+>/g, '')
    .trim();
}

// WordPress layout blocks become a few plain wrappers with design-neutral class names.
// The site's stylesheet decides what each looks like; nothing WordPress-specific survives.
//   band     a full-width section of the page (band--ink, band--paper, band--plum: its tone)
//   wide     a wider-than-text area inside a band
//   cols/col side-by-side columns that stack on phones (col--narrow: a fixed narrow column)
//   card     a boxed panel; cover: a book-cover stand-in; cover-frame: the line inside one
//   label-row a section label with a rule under it
//   actions  a row of buttons
const TONES = { foreground: 'ink', plum: 'plum', tertiary: 'paper', muted: 'muted' };
function containerClass(type, a) {
  if (type === 'columns') return 'cols';
  if (type === 'buttons') return 'actions';
  if (type === 'column') {
    const w = String(a.width || '');
    const narrow = /px$/.test(w) || (/%$/.test(w) && parseFloat(w) <= 35);
    return narrow ? 'col col--narrow' : 'col';
  }
  // group
  const tone = TONES[a.backgroundColor];
  if (a.align === 'full') return tone ? `band band--${tone}` : 'band';
  if (a.style?.dimensions?.minHeight) return tone ? `cover cover--${tone}` : 'cover-frame';
  if (a.style?.border?.bottom) return 'label-row';
  if (tone || a.style?.border) return tone && tone !== 'paper' ? `card card--${tone}` : 'card';
  if (a.align === 'wide') return 'wide';
  return null; // a group that only grouped things for WordPress: no wrapper
}

// Paragraph styling that carries meaning, kept as a class:
//   eyebrow  small capitals label that introduces a page or section
//   meta     small capitals detail line (format, status, attribution)
//   lede     larger opening paragraph;  pull: large display quote;  center: centred
function paragraphClass(attrs) {
  const style = (attrs.match(/\bstyle="([^"]*)"/) || [])[1] || '';
  const cls = (attrs.match(/\bclass="([^"]*)"/) || [])[1] || '';
  const out = [];
  if (/text-transform:\s*uppercase/.test(style)) out.push(/has-secondary-color/.test(cls) ? 'eyebrow' : 'meta');
  else if (/font-size:\s*clamp/.test(style)) out.push('pull');
  // Large text with book-like spacing (the chapter) is reading text, not a lede: no class.
  else if (parseFloat((style.match(/font-size:\s*([\d.]+)px/) || [])[1]) >= 19 &&
    !(parseFloat((style.match(/line-height:\s*([\d.]+)/) || [])[1]) >= 1.7)) out.push('lede');
  if (/has-text-align-center/.test(cls)) out.push('center');
  return out.join(' ');
}

function convert(html) {
  const stats = {
    forms: (html.match(/wp:jetpack\/subscriptions/g) || []).length,
    images: (html.match(/<figure\b/g) || []).length,
  };

  const s = html.replace(/<figure\b[\s\S]*?<\/figure>/g, ''); // images are not carried over

  // Walk the markup in order: layout-block comments open and close wrappers;
  // content blocks (headings, paragraphs, rules, buttons) become Markdown or HTML.
  // Every other WordPress comment, including the subscribe forms, is skipped.
  const out = [];
  const stack = []; // open layout blocks: { cls, at } (at = index of the opening tag in out)
  const token =
    /<!-- (\/?)wp:(group|columns|column|buttons)(?: (\{[\s\S]*?\}))? -->|<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\4>|<p\b([^>]*)>([\s\S]*?)<\/p>|<hr\b[^>]*\/?>|<div class="wp-block-button\b([^"]*)">\s*<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/div>/g;
  const idOf = (attrs) => (attrs || '').match(/\bid="([^"]+)"/)?.[1];
  for (const m of s.matchAll(token)) {
    if (m[2]) {
      if (m[1]) {
        const open = stack.pop();
        if (!open?.cls) continue;
        // A wrapper left empty (its image was dropped) is removed rather than written out.
        if (open.at === out.length - 1) out.pop();
        else out.push('</div>');
      } else {
        const cls = containerClass(m[2], m[3] ? JSON.parse(m[3]) : {});
        stack.push({ cls, at: out.length });
        if (cls) out.push(`<div class="${cls}">`);
      }
    } else if (m[4]) {
      const text = inline(m[6]);
      const id = idOf(m[5]);
      // A heading that is a jump target (glossary letters) keeps its id as raw HTML.
      out.push(id ? `<${m[4]} id="${id}">${inlineHtml(m[6])}</${m[4]}>` : `${'#'.repeat(Number(m[4][1]))} ${text}`);
    } else if (m[0].startsWith('<hr')) {
      out.push('---');
    } else if (m[10] !== undefined) {
      const text = inlineHtml(m[11]);
      if (UNLINKED_PATHS.includes(m[10])) out.push(text); // plain text, no button
      else out.push(`<a class="button${/is-style-outline/.test(m[9]) ? ' button--ghost' : ''}" href="${m[10]}">${text}</a>`);
    } else {
      if (!inline(m[8])) continue;
      const id = idOf(m[7]);
      const cls = paragraphClass(m[7]);
      // Plain paragraphs stay Markdown; labelled ones and jump targets are written as HTML.
      if (cls || id) out.push(`<p${id ? ` id="${id}"` : ''}${cls ? ` class="${cls}"` : ''}>${inlineHtml(m[8])}</p>`);
      else out.push(inline(m[8]));
    }
  }
  if (stack.length) throw new Error(`Unbalanced layout blocks: ${stack.length} left open`);
  return { md: out.join('\n\n') + '\n', stats };
}

const pages = getPublishedPages();
mkdirSync(outDir, { recursive: true });

PAGES.forEach(({ slug, nav, theme }, order) => {
  const page = pages.get(slug);
  if (!page) throw new Error(`Published page "${slug}" not found in ${exportPath}`);
  const { md, stats } = convert(page.html);
  const body = md.replace(...BRAND_FIX);
  const title = page.title.replace(...BRAND_FIX);
  const front = ['---', `title: ${JSON.stringify(title)}`, `nav: ${JSON.stringify(nav)}`, `order: ${order}`, ...(theme ? [`theme: ${JSON.stringify(theme)}`] : []), '---', ''].join('\n');
  writeFileSync(join(outDir, `${slug}.md`), front + '\n' + body);
  console.log(`${slug}: ${body.length} chars; dropped ${stats.images} image(s), ${stats.forms} subscribe form(s)`);
});
