import { defineConfig } from "astro/config";
export default defineConfig({
  site: "https://www.quentinnichols.com",
  trailingSlash: "always",
  output: "static",
  build: { format: "directory" },
  server: { port: 4321 },
});
