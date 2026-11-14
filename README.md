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
