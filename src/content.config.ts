import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// One Markdown file per page, produced by scripts/convert-wordpress.mjs.
// The file name is the page's address: about.md is served at /about/.
const pages = defineCollection({
  loader: glob({ base: './src/content/pages', pattern: '*.md' }),
  schema: z.object({
    title: z.string(), // used for the browser tab title
    nav: z.string(), // label in the site menu
    order: z.number(), // position in the site menu
    theme: z.string().optional(), // a property theme from src/styles/themes.css; none = the plain hub
  }),
});

export const collections = { pages };
