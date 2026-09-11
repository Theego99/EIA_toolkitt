import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";

// base path is '/' for local dev and set to '/EIA_toolkitt/' in CI (GitHub
// Pages serves the app from https://<user>.github.io/EIA_toolkitt/).
// https://vite.dev/config/
const PUBLIC_ASSETS = [
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "favicon-32x32.png",
  "favicon.ico",
];
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE || "/",
  // Only reviewed static assets are published; local QA helpers stay local.
  publicDir: command === "serve" ? "public" : false,
  plugins: [
    react(),
    {
      name: "wildpass-offline-shell",
      async closeBundle() {
        for (const file of PUBLIC_ASSETS)
          await fs.copyFile(`public/${file}`, `dist/${file}`);
        const assets = (await fs.readdir("dist/assets")).map(
          (file) => `assets/${file}`,
        );
        const html = await fs.readFile("dist/index.html", "utf8");
        const build = createHash("sha256")
          .update(html)
          .digest("hex")
          .slice(0, 16);
        const manifest = ["index.html", ...PUBLIC_ASSETS, ...assets];
        const source = await fs.readFile("public/workspace-sw.js", "utf8");
        const worker = source
          .replace("__BUILD_ID__", build)
          .replace("['__PRECACHE__']", JSON.stringify(manifest));
        await fs.writeFile("dist/workspace-sw.js", worker);
        await fs.writeFile("dist/sw.js", worker);
      },
    },
  ],
}));
