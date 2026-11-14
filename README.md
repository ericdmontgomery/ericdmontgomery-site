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

## Deployment

- Production: every push to `main` rebuilds and deploys to https://ericdmontgomery-site.eric-d-montgomery.workers.dev (until the domain is connected in January 2027).
- Previews: a push to any other branch builds a preview; its address is under the Worker's **Previews** section in the Cloudflare dashboard.
- Build settings (Cloudflare → Worker → Settings → Build): build command `npm run build`, deploy command `npx wrangler deploy`. Node version comes from `.node-version`.
