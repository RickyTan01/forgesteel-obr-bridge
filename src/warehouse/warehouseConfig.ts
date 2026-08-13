const STORAGE_KEY = "forgesteel-warehouse-bridge/warehouse-config";

export type WarehouseConfig = {
  host: string;
  apiToken: string;
};

export function getWarehouseConfig(): WarehouseConfig | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WarehouseConfig;
  } catch {
    return null;
  }
}

export function saveWarehouseConfig(config: WarehouseConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearWarehouseConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}
