/**
 * Web-sized copies of large local photos, made after every build.
 *
 * Many photos on the site are phone originals (2–6 MB). This step finds every large local <img> in the
 * pages Astro built, writes WebP copies at a few widths into dist/_img/, and adds a srcset so each browser
 * downloads only the size it shows; photo viewer buttons (data-photo) open the largest copy. The original
 * file and src stay as they are, so nothing breaks if a copy is missing. Copies are cached in
 * node_modules/.cache/site-images between builds.
 *
 * Pages copied in unchanged from the old site (apps, Earth School) are left alone.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const DIST = "dist";
const OUT = "_img";
const CACHE = "node_modules/.cache/site-images";
const WIDTHS = [480, 960, 1600];
const MIN_BYTES = 200 * 1024; // smaller files are already fine
const RASTER = /\.(jpe?g|png|webp)$/i;
const LEGACY = /^dist\/(AI|app|portal|login|music-generator|moments|links|assets)\/|\/earth-school\//;
// Used when an image doesn't say how wide it is shown: the 720px reading column, full width on phones.
const DEFAULT_SIZES = "(max-width: 760px) 100vw, 720px";

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

mkdirSync(join(DIST, OUT), { recursive: true });
mkdirSync(CACHE, { recursive: true });

/** Widths already made for each original, keyed by a hash of its contents, so rebuilds skip finished work. */
const MANIFEST = join(CACHE, "manifest.json");
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};

/** srcset for one local image, or null when it doesn't need copies. Results are shared across pages. */
const known = new Map();
async function srcsetFor(src) {
  if (known.has(src)) return known.get(src);
  let result = null;
  const file = join(DIST, decodeURIComponent(src.split(/[?#]/)[0]));
  if (RASTER.test(file) && existsSync(file) && statSync(file).size >= MIN_BYTES) {
    const key = createHash("sha1").update(readFileSync(file)).digest("hex").slice(0, 16);
    let widths = manifest[key];
    const missing = !widths || widths.some((w) => !existsSync(join(CACHE, `${key}-${w}.webp`)));
    if (missing) {
      const { width = 0 } = await sharp(file).metadata();
      widths = WIDTHS.filter((w) => w < width);
      for (const w of widths)
        await sharp(file).rotate().resize({ width: w }).webp({ quality: 72 }).toFile(join(CACHE, `${key}-${w}.webp`));
      manifest[key] = widths;
    }
    if (widths.length) {
      for (const w of widths) copyFileSync(join(CACHE, `${key}-${w}.webp`), join(DIST, OUT, `${key}-${w}.webp`));
      result = widths.map((w) => `/${OUT}/${key}-${w}.webp ${w}w`).join(", ");
    }
  }
  known.set(src, result);
  return result;
}

let pages = 0;
let images = 0;
for (const page of walk(DIST).filter((file) => file.endsWith(".html") && !LEGACY.test(file))) {
  const html = readFileSync(page, "utf8");
  const tags = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  let output = html;
  for (const tag of new Set(tags)) {
    if (/\ssrcset=/.test(tag)) continue;
    const src = tag.match(/\ssrc="(\/(?!\/)[^"]+)"/)?.[1];
    if (!src) continue;
    const srcset = await srcsetFor(src);
    if (!srcset) continue;
    const sizes = /\ssizes=/.test(tag) ? "" : ` sizes="${DEFAULT_SIZES}"`;
    output = output.split(tag).join(tag.replace(/^<img\b/, `<img srcset="${srcset}"${sizes}`));
    images++;
  }
  // Photo viewer buttons (data-photo) open the largest web-sized copy instead of the original.
  const viewerPhotos = new Map([...output.matchAll(/data-photo="(\/(?!\/)[^"]+)"/g)].map((m) => [m[0], m[1]]));
  for (const [attribute, src] of viewerPhotos) {
    const srcset = await srcsetFor(src);
    if (!srcset) continue;
    const largest = srcset.split(", ").at(-1).split(" ")[0];
    output = output.split(attribute).join(`data-photo="${largest}"`);
  }
  if (output !== html) {
    writeFileSync(page, output);
    pages++;
  }
}
writeFileSync(MANIFEST, JSON.stringify(manifest));
console.log(`Web-sized photos: ${images} images on ${pages} pages, ${[...known.values()].filter(Boolean).length} unique originals.`);
