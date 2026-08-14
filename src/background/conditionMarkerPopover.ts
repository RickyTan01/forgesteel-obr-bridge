import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";
import { toAbsoluteUrl } from "../toAbsoluteUrl";
import { describeError } from "./describeError";
import { BADGE_METADATA_KEY, readBadgeMetadata } from "./conditionBadges";

const MENU_ID = getPluginId("condition-marker-menu");
const POPOVER_ID = getPluginId("condition-marker-popover");

const POPOVER_WIDTH = 220;
const POPOVER_HEIGHT = 76;

/**
 * Separate from conditionContextMenu.ts's token-level "View Conditions"
 * (shows every active condition on the token via a toast) — this one
 * matches an individual condition badge and shows just that one
 * condition's detail in a small floating popover anchored to the badge
 * itself.
 */
export function registerConditionMarkerPopover(): void {
  OBR.contextMenu
    .create({
      id: MENU_ID,
      icons: [
        {
          icon: toAbsoluteUrl(`${import.meta.env.BASE_URL}action-icon.svg`),
          label: "View Condition",
          filter: {
            every: [
              { key: "layer", value: "ATTACHMENT" },
              { key: "type", value: "IMAGE" },
              { key: ["metadata", BADGE_METADATA_KEY], value: undefined, operator: "!=" },
            ],
          },
        },
      ],
      onClick: async (context, elementId) => {
        const item = context.items[0];
        if (!item) return;
        const metadata = readBadgeMetadata(item);
        if (!metadata) return;

        const params = new URLSearchParams({ name: metadata.conditionName, ends: metadata.conditionEnds });
        const url = toAbsoluteUrl(`${import.meta.env.BASE_URL}condition-popover.html?${params}`);

        await OBR.popover.open({
          id: POPOVER_ID,
          url,
          width: POPOVER_WIDTH,
          height: POPOVER_HEIGHT,
          anchorElementId: elementId,
        });
      },
    })
    .catch((err) => {
      console.error("Failed to register condition marker popover menu:", describeError(err));
    });
}
