import { useCallback, useEffect, useRef, useState } from "react";
import OBR, { Item } from "@owlbear-rodeo/sdk";
import { WarehouseClient, HeroSummary } from "../warehouse/warehouseClient";
import { WarehouseConfig } from "../warehouse/warehouseConfig";
import { getHeroTokens, writeDstHeroStats } from "../obr/drawSteelTokens";
import { readBridgeLink, writeBridgeLink, findAutoMatch, BridgeLink } from "../obr/bridgeLink";
import { getActivePoolLabel, setActivePoolLabel } from "../obr/roomPool";
import { computeMaxStamina, computeMaxRecoveries } from "../logic/heroDerived";
import { heroStateToDstFields } from "../logic/conversion";
import { getSyncIntervalSeconds, setSyncIntervalSeconds } from "../warehouse/syncPreferences";

/** Off, plus a spread from "fast enough to feel live" to "basically just periodic housekeeping". */
const INTERVAL_OPTIONS = [
  { label: "Off (manual only)", seconds: 0 },
  { label: "Every 15s", seconds: 15 },
  { label: "Every 30s", seconds: 30 },
  { label: "Every 60s", seconds: 60 },
  { label: "Every 5 min", seconds: 300 },
];

type TokenRow = {
  item: Item;
  link?: BridgeLink;
};

type Props = {
  config: WarehouseConfig;
  onOpenSettings: () => void;
};

export function SyncPanel({ config, onOpenSettings }: Props) {
  const [poolLabel, setPoolLabel] = useState("");
  const [heroes, setHeroes] = useState<HeroSummary[]>([]);
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [status, setStatus] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [intervalSeconds, setIntervalSecondsState] = useState(getSyncIntervalSeconds());
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const client = new WarehouseClient(config);

  // rows changes on every refresh/link edit; the interval timer needs the
  // latest value without re-arming setInterval on every single change.
  const rowsRef = useRef<TokenRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const refresh = async () => {
    const [label, tokens, heroSummaries] = await Promise.all([
      getActivePoolLabel(),
      getHeroTokens(),
      client.getHeroSummaries().catch(() => [] as HeroSummary[]),
    ]);
    setPoolLabel(label ?? "");
    setHeroes(heroSummaries);
    setRows(tokens.map((item) => ({ item, link: readBridgeLink(item) })));
  };

  useEffect(() => {
    OBR.onReady(() => {
      refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncRows = useCallback(async (targetRows: TokenRow[]) => {
    setSyncing(true);
    let ok = 0;
    let failed = 0;

    for (const row of targetRows) {
      if (!row.link) continue;
      try {
        const hero = await client.getFullHero(row.link.heroId);
        const state = client.extractStateFields(hero);
        const maxStamina = computeMaxStamina(hero);
        const maxRecoveries = computeMaxRecoveries(hero);
        const dstFields = heroStateToDstFields(state, maxStamina, maxRecoveries);
        await writeDstHeroStats(row.item.id, dstFields);
        ok++;
      } catch (err) {
        console.error(`Sync failed for token ${row.item.id}`, err);
        failed++;
      }
    }

    setStatus(`Synced ${ok} token${ok === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`);
    setLastSyncedAt(new Date());
    setSyncing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.host, config.apiToken]);

  // Auto-sync timer. Only runs while this panel is mounted (i.e. the GM has
  // the extension popover open) — extensions don't run in the background,
  // so this is never a server-side cron, just a foreground poll.
  useEffect(() => {
    if (intervalSeconds <= 0) return;
    const id = setInterval(() => {
      syncRows(rowsRef.current);
    }, intervalSeconds * 1000);
    return () => clearInterval(id);
  }, [intervalSeconds, syncRows]);

  const changeInterval = (seconds: number) => {
    setIntervalSecondsState(seconds);
    setSyncIntervalSeconds(seconds);
  };

  const autoLinkAll = async () => {
    for (const row of rows) {
      if (row.link) continue;
      const name = row.item.name;
      const match = findAutoMatch(name, heroes);
      if (match !== "ambiguous" && match !== "none") {
        await writeBridgeLink(row.item.id, { heroId: match.id, source: "auto" });
      }
    }
    await refresh();
  };

  const manualLink = async (itemId: string, heroId: string) => {
    if (!heroId) return;
    await writeBridgeLink(itemId, { heroId, source: "manual" });
    await refresh();
  };

  const syncNow = () => syncRows(rows);

  const savePool = async () => {
    await setActivePoolLabel(poolLabel);
  };

  const linkedCount = rows.filter((r) => r.link).length;

  return (
    <div className="sync-panel">
      <div className="pool-row">
        <label>
          <span className="label">Active Pool</span>
          <input value={poolLabel} onChange={(e) => setPoolLabel(e.target.value)} onBlur={savePool} />
        </label>
        <button type="button" onClick={onOpenSettings}>
          Warehouse Settings
        </button>
      </div>

      <div className="token-list">
        {rows.length === 0 && <div className="empty">No hero tokens found on this scene.</div>}
        {rows.map((row) => {
          const name = row.item.name;
          return (
            <div key={row.item.id} className="token-row">
              <span className="token-name">{name}</span>
              {row.link ? (
                <span className={`link-status ${row.link.source}`}>
                  {row.link.source === "auto" ? "auto-linked" : "linked"}
                </span>
              ) : (
                <select defaultValue="" onChange={(e) => manualLink(row.item.id, e.target.value)}>
                  <option value="" disabled>
                    Link hero…
                  </option>
                  {heroes.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>

      <label>
        <span className="label">Auto-sync</span>
        <select
          value={intervalSeconds}
          onChange={(e) => changeInterval(Number(e.target.value))}
        >
          {INTERVAL_OPTIONS.map((opt) => (
            <option key={opt.seconds} value={opt.seconds}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <div className="actions">
        <button type="button" onClick={autoLinkAll} disabled={rows.length === 0}>
          Auto-link by name
        </button>
        <button type="button" onClick={syncNow} disabled={syncing || linkedCount === 0}>
          {syncing ? "Syncing…" : `Sync ${linkedCount} token${linkedCount === 1 ? "" : "s"} now`}
        </button>
      </div>

      {status && (
        <div className="status">
          {status}
          {lastSyncedAt && ` (${lastSyncedAt.toLocaleTimeString()})`}
        </div>
      )}
    </div>
  );
}
