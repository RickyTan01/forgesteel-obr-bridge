import OBR, { isImage, Item } from "@owlbear-rodeo/sdk";

/**
 * Confirmed by reading SeamusFinlayson/draw-steel-tools-2 source directly
 * (src/helpers/getPluginId.ts + src/helpers/tokenHelpers.ts).
 * This is DRAW STEEL TOOLS' namespace, not ours — do not change it.
 */
const DST_METADATA_KEY = "com.draw-steel-stat-bubbles/metadata";

export type DstHeroTokenData = {
  type?: "HERO";
  name?: string;
  gmOnly?: boolean;
  stamina?: number;
  staminaMaximum?: number;
  temporaryStamina?: number;
  heroicResource?: number;
  recoveries?: number; // recoveries REMAINING, not used
  surges?: number;
  heroicResourceButton?: "D3" | "D3+1" | "+2" | "+3";
  heroicResourceName?: string;
  notes?: string;
};

/** Returns true for images on the Character/Mount layers — same filter DST itself uses. */
function isCharacterToken(item: Item): boolean {
  return isImage(item) && (item.layer === "CHARACTER" || item.layer === "MOUNT");
}

export async function getHeroTokens(): Promise<Item[]> {
  const items = await OBR.scene.items.getItems();
  return items.filter((item) => {
    if (!isCharacterToken(item)) return false;
    const data = item.metadata[DST_METADATA_KEY] as DstHeroTokenData | undefined;
    return data?.type === "HERO" || data?.type === undefined;
  });
}

export function readDstHeroData(item: Item): DstHeroTokenData | undefined {
  return item.metadata[DST_METADATA_KEY] as DstHeroTokenData | undefined;
}

/**
 * Patches only the fields we own syncing for (stamina/resource/recoveries/surges).
 * Never touches heroicResourceName, notes, heroicResourceButton, gmOnly — those
 * are DST-only settings with no Forge Steel equivalent.
 */
export async function writeDstHeroStats(
  itemId: string,
  patch: Pick<
    DstHeroTokenData,
    "stamina" | "staminaMaximum" | "temporaryStamina" | "heroicResource" | "recoveries" | "surges"
  >
): Promise<void> {
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) {
      const existing = (item.metadata[DST_METADATA_KEY] as DstHeroTokenData) ?? {};
      item.metadata[DST_METADATA_KEY] = { ...existing, ...patch };
    }
  });
}
