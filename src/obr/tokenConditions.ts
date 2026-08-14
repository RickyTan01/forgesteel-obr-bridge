import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";
import type { HeroCondition } from "../warehouse/warehouseClient";

const TOKEN_CONDITIONS_KEY = getPluginId("tokenConditions");

export type TokenConditionsMap = Record<string, HeroCondition[]>;

/**
 * Room-metadata cache of each paired token's current conditions, keyed by
 * token id — written by the GM's background sync pass (main.ts) in the
 * same pass that draws the condition badges. Not sensitive — safe for
 * every client (including players) to read, same category as
 * lastSyncedAt in syncStatus.ts. Exists because the token-level "View
 * Conditions" menu (conditionContextMenu.ts) used to do its own live
 * Warehouse fetch on click, which only ever works in the GM's own
 * browser (warehouseConfig.ts is localStorage-only, GM-entered) — a
 * player clicking it always hit "Warehouse not configured", which is a
 * GM-only concept that means nothing to a player. Reading this cache
 * instead works identically for GM and players; it's only as fresh as
 * the last sync pass, same staleness the badges themselves already have.
 */
export async function setTokenConditions(map: TokenConditionsMap): Promise<void> {
  await OBR.room.setMetadata({ [TOKEN_CONDITIONS_KEY]: map });
}

export async function getTokenConditions(): Promise<TokenConditionsMap> {
  const metadata = await OBR.room.getMetadata();
  return (metadata[TOKEN_CONDITIONS_KEY] as TokenConditionsMap | undefined) ?? {};
}
