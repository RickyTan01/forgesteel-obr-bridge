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
    // Vite's default (assets under 4KB) inlines small imported files as
    // base64 data: URIs directly in the JS bundle. That breaks the
    // condition-badge icons (src/background/conditionIcons/*.svg): OBR's
    // item-image loader routes image URLs through its own fetch/CDN
    // pipeline and can't resolve a data: URI, failing with "Unable to
    // fetch image: Invalid URL". Disabled outright rather than scoped to
    // just those files — nothing else in this project imports binary
    // assets through Vite's asset pipeline (public/ files are copied
    // verbatim regardless of this setting).
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        action: resolve(__dirname, "action.html"),
        background: resolve(__dirname, "background.html"),
        "condition-summary": resolve(__dirname, "condition-summary.html"),
      },
    },
  },
});
