import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// GH_PAGES_BASE is only set by the Pages deploy workflow — the private,
// self-hosted deployment is served at its domain's root and needs
// root-relative paths ("/"), while a GitHub Pages project site is served
// from a subpath (/forgesteel-obr-bridge/), so asset references need that
// prefix instead. Same source, two different builds — see
// .github/workflows/deploy-pages.yml.
export default defineConfig({
  base: process.env.GH_PAGES_BASE ?? "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        action: resolve(__dirname, "action.html"),
      },
    },
  },
});
