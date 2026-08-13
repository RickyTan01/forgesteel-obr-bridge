import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { getWarehouseConfig, WarehouseConfig } from "./warehouse/warehouseConfig";
import { SettingsForm } from "./components/SettingsForm";
import { SyncPanel } from "./components/SyncPanel";
import { PlayerView } from "./components/PlayerView";

export function App() {
  const [config, setConfig] = useState<WarehouseConfig | null>(getWarehouseConfig());
  const [forceSettings, setForceSettings] = useState(false);
  // null = not yet known (still loading). Everything this extension does —
  // Warehouse credentials, sync, token linking — is a GM concern; a player
  // has no use for any of it and shouldn't be prompted to supply
  // credentials they don't have.
  const [isGM, setIsGM] = useState<boolean | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    OBR.onReady(() => {
      OBR.player.getRole().then((role) => setIsGM(role === "GM"));
      unsubscribe = OBR.player.onChange((player) => setIsGM(player.role === "GM"));
    });
    return () => unsubscribe?.();
  }, []);

  if (isGM === null) {
    return null; // brief loading state, avoids a flash of the wrong view
  }

  if (!isGM) {
    return <PlayerView />;
  }

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
