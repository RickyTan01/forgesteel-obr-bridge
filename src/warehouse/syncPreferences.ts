import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";

const STORAGE_KEY = "forgesteel-warehouse-bridge/sync-interval-seconds";

/** 0 = auto-sync disabled, manual button only. */
export function getSyncIntervalSeconds(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function setSyncIntervalSeconds(seconds: number): void {
  localStorage.setItem(STORAGE_KEY, String(seconds));
}

const CONDITIONS_SYNC_KEY = getPluginId("conditionsSyncEnabled");

/**
 * Unlike sync-interval-seconds (a personal "how often does my open popover
 * poll" preference), this is room-level shared state — same category as
 * activePoolLabel/lastSyncedAt in roomPool.ts/syncStatus.ts: whoever is GM,
 * on whatever browser, should see the same on/off state, and the badges it
 * gates are scene items visible to every player. So it's stored in room
 * metadata rather than localStorage, matching that existing pattern. This
 * also happens to be what the background script (src/background/main.ts)
 * needs anyway, since popover and background run in separate iframes with
 * no shared JS memory. Defaults to off — enabling badges should be an
 * explicit GM choice, not silently on.
 */
export async function getConditionsSyncEnabled(): Promise<boolean> {
  const metadata = await OBR.room.getMetadata();
  return metadata[CONDITIONS_SYNC_KEY] === true;
}

export async function setConditionsSyncEnabled(enabled: boolean): Promise<void> {
  await OBR.room.setMetadata({ [CONDITIONS_SYNC_KEY]: enabled });
}
