import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";

const POOL_KEY = getPluginId("activePool");

/**
 * Just a human label ("Campaign A" / "Campaign B") the GM sets once per room,
 * so every client's bridge instance shows the same context. The actual
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
