import { readFileSync } from "node:fs";
import { photoSources } from "../lib/images";

export interface GalleryPhoto {
  src: string;
  srcset: string;
  large: string;
  alt: string;
}

/** Camera file names ("A 7305117", "PSX 20221101 152051") are not descriptions. */
const isFileName = (name: string) => /^(?:[A-Z]{1,4}|NEW)\s?[\d\s]+$/.test(name.trim());

/**
 * The fallback gallery shown until an N3XRA Website Gallery album is configured. It reads the
 * same list the current live gallery uses (assets/photography-feed.js); those photos are already
 * stored in N3XRA website storage.
 */
export function getGallery(): GalleryPhoto[] {
  const source = readFileSync(`${process.cwd()}/assets/photography-feed.js`, "utf8");
  const photos = [...source.matchAll(/\["([^"]+)",\s*"(https:\/\/[^"]+)"\]/g)].map(([, name, url]) => ({
    ...photoSources(url!),
    alt: isFileName(name!) ? "Photograph by Quentin Nichols" : `${name}, photographed by Quentin Nichols`,
  }));
  if (!photos.length) throw new Error("No photographs found in assets/photography-feed.js");
  return photos;
}
