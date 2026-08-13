import { useEffect, useState } from "react";
import OBR, { Item } from "@owlbear-rodeo/sdk";
import { getHeroTokens } from "../obr/drawSteelTokens";
import { readBridgeLink } from "../obr/bridgeLink";
import { getActivePoolLabel } from "../obr/roomPool";
import { getLastSyncedAt } from "../obr/syncStatus";
import { formatRelative } from "../formatRelative";

type TokenStatus = { name: string; linked: boolean };

export function PlayerView() {
  const [poolLabel, setPoolLabel] = useState<string | undefined>();
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [tokens, setTokens] = useState<TokenStatus[]>([]);
  // Purely local — re-renders the relative-time text every second so the
  // 15s/30s buckets are actually visible in real time, not just correct
  // whenever a scene/room change happens to trigger a re-render anyway. No
  // OBR or network call involved, just a state tick.
  const [now, setNow] = useState(() => Date.now());

  const refresh = async () => {
    const [label, synced, items] = await Promise.all([
      getActivePoolLabel(),
      getLastSyncedAt(),
      getHeroTokens(),
    ]);
    setPoolLabel(label);
    setLastSyncedAt(synced);
    setTokens(items.map((item: Item) => ({ name: item.name, linked: !!readBridgeLink(item) })));
  };

  useEffect(() => {
    let unsubscribeItems: (() => void) | undefined;
    let unsubscribeRoom: (() => void) | undefined;
    OBR.onReady(() => {
      refresh();
      unsubscribeItems = OBR.scene.items.onChange(() => refresh());
      unsubscribeRoom = OBR.room.onMetadataChange(() => refresh());
    });
    return () => {
      unsubscribeItems?.();
      unsubscribeRoom?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="player-view">
      <p>This extension is set up by your GM.</p>

      {poolLabel && <p className="muted">Active pool: {poolLabel}</p>}

      <p className="muted">
        {lastSyncedAt ? `Last synced ${formatRelative(lastSyncedAt, now)}` : "Not synced yet this session"}
      </p>

      {tokens.length > 0 && (
        <div className="party-status">
          {tokens.map((t) => (
            <div key={t.name} className="party-row">
              <span>{t.name}</span>
              <span className={t.linked ? "link-status auto" : "muted"}>
                {t.linked ? "synced" : "not linked"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
