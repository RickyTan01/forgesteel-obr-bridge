import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";
import { describeError } from "./describeError";

const LINK_KEY = getPluginId("link");
const MENU_ID = getPluginId("condition-context-menu");

// Title row + up to ~3 condition rows + padding — matches the user's own
// stated expectation of not usually seeing more than a few conditions at
// once (see project memory). The row list scrolls if there happen to be
// more; ContextMenuEmbed has no width field to tune, only height.
const EMBED_HEIGHT = 150;

/**
 * Registered once from the background script. Matches any paired Draw
 * Steel token (bridge link metadata present) regardless of whether it
 * currently has active conditions — the embedded page reports "no active
 * conditions" itself, which is simpler than keeping a second filter in
 * sync with the badge diff pass.
 *
 * Uses `embed`, not `onClick` + a manually-opened popover — this is the
 * actual platform feature behind Draw Steel Tools' own "Edit Hero" arrow
 * flyout (confirmed by reading SeamusFinlayson/draw-steel-tools-2's
 * source directly, src/background/contextMenuItems/menus/createHeroMenus.ts),
 * not something to approximate. The embedded page gets no per-click
 * context — it's a static URL, registered once — so it asks OBR itself
 * which item is selected (src/conditionSummary/main.ts), same pattern DST
 * uses for its own embed.
 */
export function registerConditionContextMenu(): void {
  OBR.contextMenu
    .create({
      id: MENU_ID,
      icons: [
        {
          // BASE_URL (not a hardcoded "/") accounts for the GitHub Pages
          // build being served from a subpath. No need to also resolve
          // this to a fully-qualified URL (see toAbsoluteUrl.ts for why
          // that matters for badge images) — confirmed by reading the SDK
          // source directly: OBR.contextMenu.create() already runs both
          // icon paths and embed.url through normalizeIconPaths()/
          // normalizeUrlObject() internally
          // (node_modules/@owlbear-rodeo/sdk/lib/common/normalize.js),
          // unlike buildImage's ImageContent, which never gets that
          // treatment at any SDK version.
          icon: `${import.meta.env.BASE_URL}action-icon.svg`,
          label: "View Conditions",
          filter: {
            // Matches owlbear-rodeo/initiative-tracker's own context menu
            // filter shape (official, first-party) as closely as possible,
            // having ruled out everything else while the menu wasn't
            // appearing: layer CHARACTER-or-MOUNT (coordinator "||" pairs
            // just those two; the rest AND together), type IMAGE, and our
            // own link-metadata check last. `value: undefined` on that last
            // entry checks "this metadata key is absent/undefined" —
            // inverted here with operator "!=" to mean "key present", i.e.
            // a paired token. `max: 1` (matching DST's own "Edit Hero"
            // filter) since the embed only ever shows the first selected
            // token's conditions anyway — no point offering it for a
            // multi-selection.
            every: [
              { key: "layer", value: "CHARACTER", coordinator: "||" },
              { key: "layer", value: "MOUNT" },
              { key: "type", value: "IMAGE" },
              { key: ["metadata", LINK_KEY], value: undefined, operator: "!=" },
            ],
            max: 1,
          },
        },
      ],
      embed: {
        url: `${import.meta.env.BASE_URL}condition-summary.html`,
        height: EMBED_HEIGHT,
      },
    })
    .catch((err) => {
      console.error("Failed to register condition context menu:", describeError(err));
    });
}
