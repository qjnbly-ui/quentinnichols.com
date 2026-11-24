/**
 * Turns a long journal entry's original HTML into an immersive "story": the first photo becomes the
 * full-screen opening, each heading starts a chapter, short standalone lines become larger "beats",
 * large numbers count up as they appear, and the closing bold line becomes the finale.
 * The words themselves are never changed.
 */
export interface StoryChapter {
  id: string;
  title: string;
  html: string;
}
export interface Story {
  hero: { src: string; alt: string; width: number; height: number } | null;
  intro: string;
  chapters: StoryChapter[];
}

const plain = (html: string) => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** A short line on its own ("It's wild.", "There just aren't enough hours.") reads as a beat. */
const BEAT_MAX = 48;

/** A short line built around big figures ("N3XRA has 500,691 lines of code…") becomes a stat whose numbers count up. */
const STAT_MAX = 80;
const FIGURE = /\b\d{1,3}(?:,\d{3})+\b/g;
const HAS_FIGURE = new RegExp(FIGURE.source); // non-global: .test() keeps no state between calls

function enrich(html: string) {
  return (
    html
      // The closing bold line becomes the finale.
      .replace(/<p><strong>([\s\S]*?)<\/strong><\/p>\s*$/, '<p class="finale"><strong>$1</strong></p>')
      .replace(/<p>([\s\S]*?)<\/p>/g, (paragraph, inner: string) => {
        if (/<a\b/.test(inner)) return paragraph;
        const length = plain(inner).length;
        if (HAS_FIGURE.test(inner) && length <= STAT_MAX) {
          const counted = inner.replace(FIGURE, (n) => `<span class="count" data-count="${n.replace(/,/g, "")}">${n}</span>`);
          return `<p class="beat stat">${counted}</p>`;
        }
        // Short standalone lines become beats.
        return length <= BEAT_MAX ? `<p class="beat">${inner}</p>` : paragraph;
      })
      // Every remaining paragraph reveals as it scrolls into view.
      .replace(/<p(?: class="(beat stat|beat|finale)")?>/g, (_tag, kind?: string) =>
        kind ? `<p class="${kind}" data-reveal>` : "<p data-reveal>",
      )
  );
}

export function toStory(content: string): Story {
  const inner = content.match(/<div class="post-inner">([\s\S]*)<\/div>\s*<\/article>/)?.[1] ?? content;
  const figure = inner.match(/<figure[^>]*>\s*<img([^>]*)>\s*<\/figure>/);
  const attr = (name: string) => figure?.[1]?.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
  const hero = figure
    ? { src: attr("src"), alt: attr("alt"), width: Number(attr("width")) || 0, height: Number(attr("height")) || 0 }
    : null;
  const body = figure ? inner.replace(figure[0], "") : inner;
  const [intro = "", ...parts] = body.split(/(?=<h2>)/);
  const chapters = parts.map((part) => {
    const title = part.match(/<h2>([\s\S]*?)<\/h2>/)?.[1] ?? "";
    return { id: slug(plain(title)), title, html: enrich(part.replace(/<h2>[\s\S]*?<\/h2>/, "")) };
  });
  return { hero, intro: enrich(intro), chapters };
}
