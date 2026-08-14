import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";
import { readBridgeLink } from "../obr/bridgeLink";
import { WarehouseClient } from "../warehouse/warehouseClient";
import { getWarehouseConfig } from "../warehouse/warehouseConfig";
import { conditionFullLabel } from "../logic/conditionDisplay";
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
          icon: "/action-icon.svg",
          label: "View Conditions",
          filter: {
            // Confirmed against owlbear-rodeo/initiative-tracker's own
            // context menu filter (official, first-party): `value: undefined`
            // checks "this metadata key is absent/undefined" — inverted here
            // with operator "!=" to mean "key present", i.e. a paired token.
            every: [{ key: ["metadata", LINK_KEY], value: undefined, operator: "!=" }],
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
          const message =
            conditions.length === 0
              ? `${item.name}: no active conditions`
              : `${item.name}: ${conditions.map(conditionFullLabel).join(", ")}`;
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
