import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recommend } from "../../src/data/recommend.ts";

const list = [
  { url: "/a/", slug: "life", cover: "a.jpg" },
  { url: "/b/", slug: "media", cover: "b.jpg" },
  { url: "/c/", slug: "life", cover: null },
  { url: "/d/", slug: "media", cover: "d.jpg" },
  { url: "/e/", slug: "life", cover: "e.jpg" },
];

test("recommended reads prefer the same topic, then nearby entries, and never the entry itself", () => {
  const reads = recommend(list, "/a/").map((item) => item.url);
  assert.equal(reads.length, 3);
  assert.ok(!reads.includes("/a/"));
  // Both same-topic entries come first; the one with a photo edges ahead of the closer one without.
  assert.deepEqual(reads.slice(0, 2), ["/e/", "/c/"]);
});

test("every published entry gets three recommended reads in the built site", () => {
  const posts = JSON.parse(readFileSync("src/data/posts.json", "utf8"));
  for (const post of posts) {
    if (post.url.endsWith("/earth-school/")) continue;
    const html = readFileSync(`dist${post.url}index.html`, "utf8");
    const cards = [...html.matchAll(/class="read-card[^"]*" href="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(cards.length, 3, `${post.url} should recommend three reads`);
    assert.ok(!cards.includes(post.url), `${post.url} recommends itself`);
    assert.match(html, /href="\/blog\/">All writing</, `${post.url} needs an All writing link`);
    assert.match(html, /href="\/">Back to home</, `${post.url} needs a Back to home link`);
  }
});
