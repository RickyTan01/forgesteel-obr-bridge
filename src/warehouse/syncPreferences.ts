const STORAGE_KEY = "tanserver-bridge/sync-interval-seconds";

/** 0 = auto-sync disabled, manual button only. */
export function getSyncIntervalSeconds(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function setSyncIntervalSeconds(seconds: number): void {
  localStorage.setItem(STORAGE_KEY, String(seconds));
}
