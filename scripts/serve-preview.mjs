import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import handler from "../api/public-contact.ts";
const root = resolve("dist");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".json": "application/json",
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4377");
  if (url.pathname === "/api/public-contact") {
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    };
    return handler(req, res);
  }
  try {
    let path = resolve(root, "." + decodeURIComponent(url.pathname));
    if (!path.startsWith(root + sep) && path !== root)
      throw new Error("Not found");
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    const data = await readFile(path);
    res.setHeader(
      "Content-Type",
      types[extname(path)] || "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(await readFile(resolve(root, "404.html")));
  }
});
server.listen(0, "127.0.0.1", () =>
  console.log(`Preview: http://127.0.0.1:${server.address().port}`),
);
