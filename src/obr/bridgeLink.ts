import OBR, { Item } from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";

const LINK_KEY = getPluginId("link");

export type BridgeLink = {
  heroId: string;
  /** "auto" = matched by token name, "manual" = user picked it explicitly */
  source: "auto" | "manual";
};

export function readBridgeLink(item: Item): BridgeLink | undefined {
  return item.metadata[LINK_KEY] as BridgeLink | undefined;
}

export async function writeBridgeLink(itemId: string, link: BridgeLink): Promise<void> {
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) {
      item.metadata[LINK_KEY] = link;
    }
  });
}

export async function clearBridgeLink(itemId: string): Promise<void> {
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) {
      delete item.metadata[LINK_KEY];
    }
  });
}

/**
 * Auto-link pass: for any unlinked hero token, look for an exact,
 * unambiguous name match in the given hero list. Ambiguous or missing
 * matches are left alone for the manual picker in the UI.
 */
export function findAutoMatch(
  tokenName: string,
  heroes: { id: string; name: string }[]
): { id: string; name: string } | "ambiguous" | "none" {
  const matches = heroes.filter(
    (h) => h.name.trim().toLowerCase() === tokenName.trim().toLowerCase()
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return "ambiguous";
  return "none";
}
