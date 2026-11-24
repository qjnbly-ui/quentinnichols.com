import { existsSync, readFileSync } from "node:fs";
import posts from "./posts.json";
import { toStory } from "./story";
import { resized } from "../lib/images";

/** Story-specific files (for example the Live Photo gallery) that a post loads from /assets/blog/. */
const postAssets = (html: string, pattern: RegExp) =>
  [...html.matchAll(pattern)].map((match) => match[1]!).filter((src) => src.startsWith("/assets/blog/"));

/** Web-sized copies of a story's opening photo, when they exist (public/images/stories/<post>-<width>.jpg). */
export function storyPhoto(route: string) {
  const widths = [900, 1536].filter((width) => existsSync(`${process.cwd()}/public/images/stories/${route}-${width}.jpg`));
  if (!widths.length) return null;
  return {
    src: `/images/stories/${route}-${widths.at(-1)}.jpg`,
    srcset: widths.map((width) => `/images/stories/${route}-${width}.jpg ${width}w`).join(", "),
  };
}

/** The full-HD YouTube thumbnail (see coverFallback for videos without one). */
const youtubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;

const words = (html: string) => html.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;

export type Article = ReturnType<typeof getArticles>[number];

/**
 * Public articles, read from their original HTML so the original URLs and words stay the source of truth.
 * Earth School keeps its own standalone experience and is not rebuilt. Posts marked `"layout": "story"`
 * in posts.json get the immersive long-form layout.
 */
export function getArticles() {
  return posts
    .filter((post) => !post.url.endsWith("/earth-school/"))
    .map((post) => {
      const file = readFileSync(`${process.cwd()}${post.url}index.html`, "utf8");
      const article = file
        .match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
        ?.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "");
      if (!article) throw new Error(`Missing original article: ${post.url}`);
      const route = post.url.split("/").filter(Boolean).pop()!;
      const description = file.match(/<meta name="description" content="([^"]*)"/)?.[1] || post.title;
      // The post's own sharing image, as a site path.
      const shareImage = file
        .match(/<meta property="og:image" content="([^"]*)"/)?.[1]
        ?.replace(/^https:\/\/(www\.)?quentinnichols\.com/, "");
      // Popovers (like the "fresco" definition) sit outside <main> in the original; bring them along.
      const popovers = [...file.matchAll(/<aside\b[^>]*\spopover\b[^>]*>[\s\S]*?<\/aside>/gi)].map((match) => match[0]);
      const content =
        article
          // Inline scripts are dropped; the post's own gallery scripts are loaded separately below.
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
          // Every post shares one reading style, so one-off inline colours and sizes are removed.
          .replace(/\sstyle="[^"]*"/gi, "")
          // Old hand-made "Recommended Reads" blocks; every post now ends with its own recommendations.
          .replace(/<section class="post-related"[\s\S]*?<\/section>/gi, "") + popovers.join("");
      const story = "layout" in post && post.layout === "story" ? toStory(content) : null;
      // A photo to represent the post elsewhere (the "Up next" card). In order: a cover chosen in posts.json,
      // the story photo, the first photo in the post, its sharing image, or its YouTube video's thumbnail.
      const firstPhoto = content.match(/<img[^>]*\ssrc="([^"]+)"/)?.[1];
      const video = content.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/)?.[1];
      const chosen = "cover" in post ? post.cover : undefined;
      const coverSource =
        chosen ?? storyPhoto(route)?.src ?? story?.hero?.src ?? firstPhoto ?? shareImage ?? (video ? youtubeThumbnail(video) : null);
      return {
        ...post,
        description,
        shareImage,
        content,
        story,
        cover: coverSource ? resized(coverSource, 1200, 1200) : null,
        // YouTube serves a 120×90 placeholder when a video has no full-HD thumbnail; the card swaps to this.
        coverFallback: coverSource?.includes("i.ytimg.com") ? coverSource.replace("maxresdefault", "sddefault") : null,
        minutes: Math.max(1, Math.round(words(content) / 230)),
        stylesheets: postAssets(file, /<link rel="stylesheet" href="([^"]+)"/g),
        scripts: postAssets(file, /<script src="([^"]+)"/g),
        route,
      };
    });
}

/** What a card needs to show one entry: every entry in posts.json (Earth School included), with its photo and reading time. */
export interface Entry {
  url: string;
  title: string;
  category: string;
  slug: string;
  date: string;
  description?: string;
  cover: string | null;
  coverFallback: string | null;
  minutes?: number;
}

export function getEntries(articles: Article[] = getArticles()): Entry[] {
  const byUrl = new Map(articles.map((article) => [article.url, article]));
  return posts.map((post) => {
    const article = byUrl.get(post.url);
    return {
      url: post.url,
      title: post.title,
      category: post.category,
      slug: post.slug,
      date: post.date,
      description: article?.description,
      cover: article?.cover ?? null,
      coverFallback: article?.coverFallback ?? null,
      minutes: article?.minutes,
    };
  });
}
