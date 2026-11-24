import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const LEGACY = /^dist\/(AI|app|portal|login|music-generator|moments|links|assets)\/|\/earth-school\//;
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
const pages = walk("dist").filter((file) => file.endsWith(".html") && !LEGACY.test(file));
const local = (path) => join("dist", decodeURIComponent(path.split(/[?#]/)[0]));

test("every web-sized photo a page points to exists", () => {
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    const paths = [
      ...[...html.matchAll(/\ssrcset="([^"]+)"/g)].flatMap((m) => m[1].split(",").map((part) => part.trim().split(" ")[0])),
      ...[...html.matchAll(/data-photo="([^"]+)"/g)].map((m) => m[1]),
    ].filter((path) => path.startsWith("/") && !path.startsWith("//"));
    for (const path of paths) assert.ok(existsSync(local(path)), `${page}: missing ${path}`);
  }
});

test("no page makes visitors download a large local photo when a smaller copy would do", () => {
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    // An <img> inside <picture> with a <source srcset> already gets a web-sized copy from the source.
    const pictured = new Set([...html.matchAll(/<picture\b[\s\S]*?<source\b[^>]*srcset=[\s\S]*?(<img\b[^>]*>)/g)].map((m) => m[1]));
    for (const [tag, src] of html.matchAll(/<img\b[^>]*\ssrc="(\/(?!\/)[^"]+)"[^>]*>/g)) {
      const file = local(src);
      if (!existsSync(file) || /\ssrcset=/.test(tag) || pictured.has(tag)) continue;
      assert.ok(statSync(file).size < 400 * 1024, `${page}: ${src} is ${Math.round(statSync(file).size / 1024)} KB with no web-sized copy`);
    }
  }
});
