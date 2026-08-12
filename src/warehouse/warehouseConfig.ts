const STORAGE_KEY = "tanserver-bridge/warehouse-config";

export type WarehouseConfig = {
  host: string; // e.g. https://fs-warehouse.tanserver.uk
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
