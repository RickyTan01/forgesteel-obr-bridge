import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";

const LAST_SYNCED_KEY = getPluginId("lastSyncedAt");

/**
 * ISO timestamp of the last successful sync run, room-wide. Not sensitive —
 * safe for every client (including players) to read. Written by the GM's
 * SyncPanel after each run; read by PlayerView so players can tell whether
 * their token's numbers are current without asking the GM.
 */
export async function getLastSyncedAt(): Promise<Date | null> {
  const metadata = await OBR.room.getMetadata();
  const raw = metadata[LAST_SYNCED_KEY] as string | undefined;
  return raw ? new Date(raw) : null;
}

export async function setLastSyncedAt(date: Date): Promise<void> {
  await OBR.room.setMetadata({ [LAST_SYNCED_KEY]: date.toISOString() });
}
