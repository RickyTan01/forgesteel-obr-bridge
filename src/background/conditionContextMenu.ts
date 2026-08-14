import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";
import { readBridgeLink } from "../obr/bridgeLink";
import { WarehouseClient } from "../warehouse/warehouseClient";
import { getWarehouseConfig } from "../warehouse/warehouseConfig";
import { conditionDisplayName, conditionEndsLabel } from "../logic/conditionDisplay";
import { describeError } from "./describeError";

const LINK_KEY = getPluginId("link");
const MENU_ID = getPluginId("condition-context-menu");

/**
 * Registered once from the background script. Matches any paired Draw
 * Steel token (bridge link metadata present) regardless of whether it
 * currently has active conditions — clicking with none just reports that,
 * which is simpler than keeping a second filter in sync with the badge
 * diff pass.
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
          // source directly: OBR.contextMenu.create() already runs its
          // icons through normalizeIconPaths() internally
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
            // a paired token.
            every: [
              { key: "layer", value: "CHARACTER", coordinator: "||" },
              { key: "layer", value: "MOUNT" },
              { key: "type", value: "IMAGE" },
              { key: ["metadata", LINK_KEY], value: undefined, operator: "!=" },
            ],
          },
        },
      ],
      onClick: async (context) => {
        // Simplest version, per spec: only the first selected token.
        const item = context.items[0];
        if (!item) return;
        const link = readBridgeLink(item);
        if (!link) return;

        const config = getWarehouseConfig();
        if (!config) {
          await OBR.notification.show("FS Bridge: Warehouse not configured.", "WARNING");
          return;
        }

        try {
          const client = new WarehouseClient(config);
          const hero = await client.getFullHero(link.heroId);
          const conditions = client.extractConditions(hero);
          // One row per condition ("Slowed: Save Ends") rather than a single
          // comma-separated line — reads better once a token has more than
          // one active condition.
          const message =
            conditions.length === 0
              ? `${item.name}: no active conditions`
              : conditions.map((c) => `${conditionDisplayName(c)}: ${conditionEndsLabel(c)}`).join("\n");
          await OBR.notification.show(message, "INFO");
        } catch (err) {
          console.error("Failed to load conditions for context menu:", describeError(err));
          await OBR.notification.show("FS Bridge: failed to load conditions.", "ERROR");
        }
      },
    })
    .catch((err) => {
      console.error("Failed to register condition context menu:", describeError(err));
    });
}
