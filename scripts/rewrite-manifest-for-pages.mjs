// Only run for the GitHub Pages build. The Unraid deploy is served at its
// domain's root, so its manifest.json (copied verbatim from public/) is
// correct as-is — root-relative paths resolve correctly there. A GitHub
// Pages project site is served from a subpath instead, so this rewrites
// the three path fields to include that prefix, post-build, in dist/ only.
import { readFileSync, writeFileSync } from "fs";

const base = process.env.GH_PAGES_BASE;
if (!base) {
  throw new Error("GH_PAGES_BASE must be set when running this script");
}

const manifestPath = "dist/manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

const prefix = (path) => `${base.replace(/\/$/, "")}${path}`;

manifest.icon = prefix(manifest.icon);
manifest.action.icon = prefix(manifest.action.icon);
manifest.action.popover = prefix(manifest.action.popover);
manifest.background.url = prefix(manifest.background.url);

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Rewrote ${manifestPath} for base "${base}"`);
