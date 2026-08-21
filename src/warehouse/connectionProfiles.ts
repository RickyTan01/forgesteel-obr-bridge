export type ConnectionProfile = {
  id: string;
  name: string;
  host: string;
  apiToken: string;
};

const STORAGE_KEY = "forgesteel-warehouse-bridge/connection-profiles";

// Profiles carry a Warehouse credential (apiToken) — same class of secret as
// warehouseConfig.ts's own apiToken. These functions must only ever touch
// localStorage, never OBR.room.setMetadata, which is readable by every
// player in the room (see roomPool.ts for the same warning re: the token).

export function getConnectionProfiles(): ConnectionProfile[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ConnectionProfile[];
  } catch {
    return [];
  }
}

function saveConnectionProfiles(profiles: ConnectionProfile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

/**
 * Dedupes by apiToken — saving again with a token that already has a saved
 * profile updates that profile's name/host in place (e.g. the connected
 * username or host changing) instead of creating a duplicate entry.
 */
export function upsertConnectionProfile(profile: { name: string; host: string; apiToken: string }): void {
  const existing = getConnectionProfiles();
  const match = existing.find((p) => p.apiToken === profile.apiToken);
  const updated: ConnectionProfile = match
    ? { ...match, name: profile.name, host: profile.host }
    : { id: crypto.randomUUID(), ...profile };
  const next = match ? existing.map((p) => (p.id === match.id ? updated : p)) : [...existing, updated];
  saveConnectionProfiles(next);
}

export function deleteConnectionProfile(id: string): void {
  saveConnectionProfiles(getConnectionProfiles().filter((p) => p.id !== id));
}
