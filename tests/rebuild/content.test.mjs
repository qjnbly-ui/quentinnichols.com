import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
const posts = JSON.parse(readFileSync("src/data/posts.json", "utf8"));
const plain = (html) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
test("all original public article paragraphs and photo references survive migration", () => {
  for (const post of posts) {
    const source = readFileSync(`.${post.url}index.html`, "utf8");
    const output = readFileSync(`dist${post.url}index.html`, "utf8");
    if (post.url.endsWith("/earth-school/")) {
      assert.equal(output, source);
      continue;
    }
    const main = source
      .match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)[1]
      .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "")
      // Old hand-made "Recommended Reads" links are navigation, not the article; posts now end with their own.
      .replace(/<section class="post-related"[\s\S]*?<\/section>/gi, "");
    for (const match of main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
      const text = plain(match[1]);
      if (text)
        assert.ok(
          plain(output).includes(text),
          `Missing paragraph in ${post.url}: ${text.slice(0, 60)}`,
        );
    }
    for (const match of main.matchAll(/<img[^>]*src="([^"]+)"/g))
      assert.ok(output.includes(match[1]), `Missing photo in ${post.url}`);
  }
});
test("generated public pages have working local references and never link to private entries", () => {
  const folders = [
    "dist/about-me",
    "dist/blog",
    "dist/projects",
    "dist/vision",
    "dist/videos",
    "dist/photography",
    "dist/contact",
    "dist/updates",
  ];
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(dir, entry.name))
        : [join(dir, entry.name)],
    );
  const pages = ["dist/index.html", ...folders.flatMap(walk)].filter(
    (file) => file.endsWith(".html") && !file.includes("/earth-school/"),
  );
  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    for (const match of html.matchAll(/(?:href|src)="(\/(?!\/)[^"]*)"/g)) {
      const value = match[1];
      if (value.startsWith("/api/")) continue;
      const path = decodeURIComponent(
        new URL(value, "https://www.quentinnichols.com").pathname,
      );
      assert.ok(
        existsSync(`dist${path}`) || existsSync(`dist${path}/index.html`),
        `${file}: ${value}`,
      );
    }
    // Private entries are reachable from the signed-in portal only; public pages never link to them.
    assert.equal(/href="\/blog\/private\//.test(html), false);
  }
});
