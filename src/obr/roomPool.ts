import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";

const POOL_KEY = getPluginId("activePool");

/**
 * The connected Warehouse account's username, mirrored here by the GM's
 * SyncPanel (see getConnectedUsername in warehouseClient.ts) so every
 * client's bridge instance — including players, who have no Warehouse
 * access of their own — shows the same active-pool context. The actual
 * Warehouse API token that label maps to lives in the GM's own localStorage
 * (see warehouseConfig.ts) — never written here.
 */
export async function getActivePoolLabel(): Promise<string | undefined> {
  const metadata = await OBR.room.getMetadata();
  return metadata[POOL_KEY] as string | undefined;
}

export async function setActivePoolLabel(label: string): Promise<void> {
  await OBR.room.setMetadata({ [POOL_KEY]: label });
}
