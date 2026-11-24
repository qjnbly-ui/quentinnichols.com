# Quentin Nichols

Personal founder website for Quentin Nichols. N3XRA and the direction of the company lead the site. Videos, writing, photography, and life outside the company have their own pages.

## Development

Use Node 24 and `npm ci`. Run `npm run dev` for Astro's development server. Run `npm run build` to generate `dist/`, then `npm test` to verify migrated content and integration boundaries. `node scripts/serve-preview.mjs` serves the built site on an available local port and includes the public Contact Card proxy.

Public pages use Astro, semantic HTML, local Inter typography, and CSS. There is no client framework or hydration.

- **Styling:** one stylesheet, `src/styles/site.css`, built on tokens that share N3XRA's palette (navy background, cyan-to-blue accent). Add to it; don't add page-specific stylesheets or inline styles.
- **Motion:** one module, `src/lib/motion.ts`. It handles the opening (photo entrance, logo light sweep, pointer depth, scroll fade), the N3XRA chapter (pinned on wide screens, stepping through the three vision chapters as you scroll), scroll reveals (`data-reveal`, staggered with `--d`), card spotlights (`.spotlight`), the header and the page progress bar. Scroll and pointer work is batched into one animation frame and only runs for sections on screen. Visitors who prefer reduced motion get a still, fully readable page.
- **Content:** the homepage puts N3XRA at the center, then the N3XRA products the site runs on, videos, the latest three posts, and the rest of Quentin's life. The vision text lives once in `src/data/site.ts` and feeds both the homepage and `/vision/`.

The original public article HTML remains the migration source, with the original public URLs and paragraphs retained. Story-specific files a post loads from `/assets/blog/` (such as the Live Photo gallery) are carried into the rebuilt article. The photography page reads the same photo list as the current live gallery, `assets/photography-feed.js`. Earth School remains its existing independent interactive experience. Existing authenticated apps and their assets are copied into the output by `scripts/preserve-legacy.mjs`; root API handlers and authentication middleware remain in place. Private blog drafts are not copied to the public build.

## Images

Many photos are phone originals (2–6 MB). After every build, `scripts/optimize-images.mjs` finds large local images on the pages Astro built, writes WebP copies at 480, 960 and 1600px into `dist/_img/`, and adds a `srcset` so each browser downloads only the size it shows; gallery viewers open the 1600px copy. Originals and their paths are untouched. Copies are cached in `node_modules/.cache/site-images` (keyed by file contents), so a rebuild with no new photos takes about a second. Give an `<img>` a `sizes` attribute when it is shown smaller than the 720px reading column, so browsers pick a small copy. `tests/rebuild/images.test.mjs` fails the build's tests if a page serves a large local photo without copies.

The reading shelf on `/blog/recent-reads/` lives in `src/data/books.ts`, one line per book.

## N3XRA connections

**Contact Card:** `/api/public-contact` reads only the published card endpoint and returns a small set of public fields for the native contact layout. Its fallback details are the same details already published on the previous site.

**Photography (N3XRA Website Gallery):** set `PUBLIC_N3XRA_GALLERY_ALBUM` to the slug of an album created for this website in N3XRA. The photography page then loads that album from `https://www.n3xra.com/api/website-gallery`, so album changes in N3XRA appear without a redeploy. Only photos in this website's own N3XRA storage are accepted (`PUBLIC_N3XRA_WEBSITE_ID`, defaulting to quentinnichols.com's id). Grid and viewer images are resized copies served by N3XRA storage (`src/lib/images.ts`). Until an album is set, the page shows the current live list from `assets/photography-feed.js`, whose photos are already in N3XRA storage.

**Communications:** `PUBLIC_COMMUNICATIONS_WORKSPACE` accepts the provisioned workspace slug. The workspace must allow the website's exact origin and have a website embed source, active consent configuration, and an available email channel. The form loads actual topics and current consent wording from N3XRA. It submits to the existing origin-checked subscription endpoint. Without an active configuration, visitors see a truthful alternative linking to YouTube; no signup is simulated.

Do not use production contact messages or subscription deliveries as tests. No gallery album or subscription workspace has been activated by this branch.

## Review and release

The Vercel configuration builds the site with `npm run build` into `dist`, keeps the existing API functions, middleware and redirects, and copies the authenticated apps and older asset URLs in unchanged (`scripts/preserve-legacy.mjs`). Pushes to a branch other than `main` get a Vercel preview; check the site there, including sign-in, the portal, the apps and Earth School, before merging to `main`.

Later, in N3XRA: create the photography album, provision the Communications workspace, move the site's own images into N3XRA website storage, and bring sign-in under N3XRA.
