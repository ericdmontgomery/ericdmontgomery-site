// Checks the built site (dist/) against the WordPress export.
//
//   npm run build && node scripts/verify-pages.mjs <export.xml>
//
// Fails (exit 1) on any text mismatch or leftover WordPress markup. Also lists
// hits for terms the Storytelling Career project asked to be reported, not edited.

import { readFileSync, existsSync } from 'node:fs';

const exportPath = process.argv[2];
if (!exportPath) {
  console.error('Usage: node scripts/verify-pages.mjs <export.xml>');
  process.exit(1);
}

const SLUGS = ['home', 'about', 'stories', 'the-unknown-mother', 'glossary'];
const REPORT_TERMS = ['Forgotten Echoes', 'Isimala', 'Habernitch'];
const UNLINKED_PATHS = ['/newsletter/'];

const decode = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'").replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
const words = (html) => decode(html.replace(/<[^>]+>/g, ' ')).split(/\s+/).filter(Boolean);

// Export side: strip block comments (and the images they wrap), then tags.
const xml = readFileSync(exportPath, 'utf8');
const exportText = new Map();
for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
  const item = m[1];
  const field = (tag) => item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`))?.[1] ?? '';
  if (field('wp:post_type') !== 'page' || field('wp:status') !== 'publish') continue;
  const html = field('content:encoded').replace(/<!--[\s\S]*?-->/g, '').replace(/<figure\b[\s\S]*?<\/figure>/g, '');
  exportText.set(field('wp:post_name'), words(html));
}

let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };
const hits = [];
const ids = new Map(); // slug -> Set of ids, for checking jump links
const links = [];

for (const slug of SLUGS) {
  console.log(slug);
  const file = `dist/${slug === 'home' ? '' : slug + '/'}index.html`;
  if (!existsSync(file)) { fail(`${file} missing`); continue; }
  const page = readFileSync(file, 'utf8');
  const article = page.match(/<article class="prose">([\s\S]*?)<\/article>/)?.[1];
  if (!article) { fail('no <article class="prose">'); continue; }

  // 1. Text matches the export word for word (brand fix applied to the export side).
  const expected = words(exportText.get(slug).join(' ').replace(/\bEric Montgomery\b/g, 'Eric D. Montgomery'));
  const actual = words(article);
  const n = Math.max(expected.length, actual.length);
  let bad = -1;
  for (let i = 0; i < n; i++) if (expected[i] !== actual[i]) { bad = i; break; }
  if (bad >= 0) fail(`text differs at word ${bad}: export "${expected.slice(bad, bad + 6).join(' ')}" vs built "${actual.slice(bad, bad + 6).join(' ')}"`);
  else console.log(`  ok  text identical (${actual.length} words)`);

  // 2. No WordPress leftovers or forms.
  for (const [label, re] of [['wp: comment', /<!--\s*\/?wp:/], ['wp-block class', /wp-block|wp-element/], ['form', /<form\b|<input\b/], ['image', /<img\b/], ['style attribute', /\sstyle="/]]) {
    if (re.test(article)) fail(`leftover: ${label}`);
  }
  if (/\bEric Montgomery\b/.test(page)) fail('"Eric Montgomery" without the D.');

  // 3. Collect ids and links for the cross-page checks below.
  ids.set(slug, new Set([...article.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1])));
  for (const l of article.matchAll(/href="([^"]*)"/g)) links.push([slug, l[1]]);

  // 4. Report-only term search.
  const text = actual.join(' ');
  for (const t of REPORT_TERMS) {
    const c = (text.match(new RegExp(t, 'g')) || []).length;
    if (c) hits.push(`${slug}: "${t}" x${c}`);
  }
}

// Links: jump links resolve on their own page, internal links hit a built page, none go to unmoved pages.
console.log('links');
for (const [slug, href] of links) {
  if (href.startsWith('#')) { if (!ids.get(slug)?.has(href.slice(1))) fail(`${slug}: ${href} has no matching id`); }
  else if (UNLINKED_PATHS.includes(href)) fail(`${slug}: link to ${href}`);
  else if (href.startsWith('/')) {
    const target = href === '/' ? 'dist/index.html' : `dist${href}index.html`;
    if (!existsSync(target)) fail(`${slug}: ${href} has no built page`);
  }
}
console.log(`  checked ${links.length} links`);

// Nothing loaded from outside the site (fonts are self-hosted).
for (const slug of SLUGS) {
  const file = `dist/${slug === 'home' ? '' : slug + '/'}index.html`;
  const ext = [...readFileSync(file, 'utf8').matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((x) => x[1]);
  if (ext.length) console.log(`  note ${slug}: external references: ${ext.join(', ')}`);
}

console.log('\nTerm hits (report only, not edited):');
console.log(hits.length ? hits.map((h) => '  ' + h).join('\n') : '  none');
console.log(failures ? `\n${failures} failure(s)` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
