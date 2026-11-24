import { readFileSync } from "node:fs";

/** Anchors for timeline entries that other pages link to. The first entry that matches wins. */
const anchors: [RegExp, string][] = [
  [/Ruth Obenchain Recreation Center/, "recreation-center"],
  [/Guard School/, "firefighting"],
  [/New Zealand/, "new-zealand"],
  [/Trees, LLC/, "tree-work"],
  [/Emergency Medical Technician/, "emt"],
  [/Structure Firefighter/, "firefighter-1"],
  [/>N3XRA</, "n3xra"],
];

/** Reflections that close the story: shown as centered features rather than side cards. */
const FEATURE = /Closing Reflection|Earlier Season|Where I Am Now/;

/**
 * Quentin's overview and life timeline, read from the original About page so his own words stay
 * the single source. Each entry is tagged for the centered timeline layout: which side of the line
 * it sits on, whether it is a closing feature or the N3XRA entry, and a scroll-reveal hook.
 * Scripts are dropped; the photo strips work without them.
 */
export function getAbout() {
  const html = readFileSync(`${process.cwd()}/about-me/index.html`, "utf8");
  const overviewSection = html.match(/<section class="about-section" aria-labelledby="about-intro">([\s\S]*?)<\/section>/)?.[1] || "";
  const overview = [...overviewSection.matchAll(/<p class="about-body">([\s\S]*?)<\/p>/g)].map((match) => match[1]!);
  const timeline = html.match(/<div class="about-timeline">([\s\S]*?)<\/div>\s*<\/section>/)?.[1];
  if (!overview.length || !timeline) throw new Error("Could not read the About page timeline");

  const used = new Set<string>();
  let side = 0;
  const entries = timeline
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<article class="([^"]*)">([\s\S]*?)<\/article>/g, (_article, classes: string, body: string) => {
      const header = body.slice(0, 400);
      const tags = [classes];
      if (FEATURE.test(header)) tags.push("about-item--feature");
      else {
        tags.push(side++ % 2 ? "about-item--right" : "about-item--left");
        if (/<p class="about-item-org">N3XRA<\/p>/.test(header)) tags.push("about-item--n3xra");
      }
      const anchor = anchors.find(([pattern, id]) => !used.has(id) && pattern.test(header));
      if (anchor) used.add(anchor[1]);
      const id = anchor ? ` id="${anchor[1]}"` : "";
      // Photo strips show each image 160px tall, so tell the browser to fetch a small copy.
      const sized = body.replace(/<img\b(?![^>]*\ssizes=)/g, '<img sizes="240px"');
      return `<article class="${tags.join(" ")}"${id} data-reveal>${sized}</article>`;
    });
  return { overview, timeline: entries };
}
