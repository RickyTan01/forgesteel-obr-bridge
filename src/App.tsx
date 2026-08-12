import { useState } from "react";
import { getWarehouseConfig, WarehouseConfig } from "./warehouse/warehouseConfig";
import { SettingsForm } from "./components/SettingsForm";
import { SyncPanel } from "./components/SyncPanel";

export function App() {
  const [config, setConfig] = useState<WarehouseConfig | null>(getWarehouseConfig());
  const [forceSettings, setForceSettings] = useState(false);

  if (!config || forceSettings) {
    return (
      <SettingsForm
        initial={config ?? undefined}
        onSaved={(saved) => {
          setConfig(saved);
          setForceSettings(false);
        }}
      />
    );
  }

  return <SyncPanel config={config} onOpenSettings={() => setForceSettings(true)} />;
}
