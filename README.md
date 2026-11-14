# ericdmontgomery-site

Public site for ericdmontgomery.com: the Eric D. Montgomery author hub.

- Built with [Astro](https://astro.build) (static output).
- Published by Cloudflare Workers (static assets). Workers Builds rebuilds and deploys on every push to `main`; other branches get a preview address.
- Public content only. Nothing private and no secrets (passwords, keys, tokens) ever go in this repo.

## Local commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Local preview at http://localhost:4321 |
| `npm run build` | Build the site into `dist/` |

## Pages

Page text lives in `src/content/pages/*.md`, one file per page; the file name is the address (`about.md` is `/about/`, `home.md` is `/`). The menu is built from these files' `nav` and `order` fields.

The five pages were generated from the old WordPress export by `scripts/convert-wordpress.mjs`. The export itself is not in this repo. To re-run the conversion (this overwrites the Markdown files, so any hand edits to them are lost):

```
node scripts/convert-wordpress.mjs path/to/ericdmontgomery.WordPress.2026-11-07.xml
npm run build
node scripts/verify-pages.mjs path/to/ericdmontgomery.WordPress.2026-11-07.xml
```

`verify-pages.mjs` compares each built page's text with the export and checks for leftover WordPress markup, broken links and outside references.

## Deployment

- Production: every push to `main` rebuilds and deploys to https://ericdmontgomery-site.eric-d-montgomery.workers.dev (until the domain is connected in January 2027).
- Previews: a push to any other branch builds a preview; its address is under the Worker's **Previews** section in the Cloudflare dashboard.
- Build settings (Cloudflare → Worker → Settings → Build): build command `npm run build`, deploy command `npx wrangler deploy`. Node version comes from `.node-version`.
