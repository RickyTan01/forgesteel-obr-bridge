import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import OBR, { Item } from "@owlbear-rodeo/sdk";
import { WarehouseClient, HeroSummary } from "../warehouse/warehouseClient";
import { WarehouseConfig } from "../warehouse/warehouseConfig";
import { getHeroTokens, writeDstHeroStats } from "../obr/drawSteelTokens";
import { readBridgeLink, writeBridgeLink, clearBridgeLink, findAutoMatch, BridgeLink } from "../obr/bridgeLink";
import { getActivePoolLabel, setActivePoolLabel } from "../obr/roomPool";
import { getLastSyncedAt, setLastSyncedAt as writeLastSyncedAt } from "../obr/syncStatus";
import { heroStateToDstFields } from "../logic/conversion";
import {
  getSyncIntervalSeconds,
  setSyncIntervalSeconds,
  getConditionsSyncEnabled,
  setConditionsSyncEnabled,
} from "../warehouse/syncPreferences";
import { formatRelative } from "../formatRelative";

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

/** Short, human-readable cause — same status/message convention as warehouseClient's testConnection. */
function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return `${err.response?.status ?? "?"} ${err.response?.statusText ?? err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Caps the toast at 3 named failures so one bad sync run doesn't produce an unreadable wall of text. */
function summarizeFailures(failures: { name: string; message: string }[]): string {
  if (failures.length === 1) {
    return `Sync failed for ${failures[0].name} (${failures[0].message})`;
  }
  const preview = failures.slice(0, 3).map((f) => `${f.name} (${f.message})`).join(", ");
  const rest = failures.length - 3;
  return `Sync failed for ${failures.length} tokens: ${preview}${rest > 0 ? `, +${rest} more` : ""}`;
}

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
  const [conditionsSyncEnabled, setConditionsSyncEnabledState] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const client = new WarehouseClient(config);

  // rows changes on every refresh/link edit; the interval timer needs the
  // latest value without re-arming setInterval on every single change.
  const rowsRef = useRef<TokenRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const refresh = async () => {
    const [label, tokens, heroSummaries, synced, conditionsSync] = await Promise.all([
      getActivePoolLabel(),
      getHeroTokens(),
      client.getHeroSummaries().catch(() => [] as HeroSummary[]),
      getLastSyncedAt(),
      getConditionsSyncEnabled(),
    ]);
    setPoolLabel(label ?? "");
    setHeroes(heroSummaries);
    setRows(tokens.map((item) => ({ item, link: readBridgeLink(item) })));
    setLastSyncedAt(synced);
    setConditionsSyncEnabledState(conditionsSync);
  };

  // Local-only rescan — no Warehouse call. Reads whatever hero tokens exist
  // on the scene right now and preserves each one's existing link. This is
  // what OBR's scene-change listener calls, since that event fires on
  // EVERY scene mutation (moving a token, resizing, etc.), not just adding
  // one — re-fetching the hero list from the Warehouse on every single one
  // of those would spam it for no reason. The hero list itself only needs
  // refreshing when the panel is opened/reopened (see `refresh` above).
  const refreshTokensOnly = async () => {
    const tokens = await getHeroTokens();
    setRows(tokens.map((item) => ({ item, link: readBridgeLink(item) })));
  };

  // Room metadata changes when a sync writes the shared timestamp (or the
  // pool label changes) — refetch just those two, not the full heroes list.
  const refreshRoomMetaOnly = async () => {
    const [label, synced, conditionsSync] = await Promise.all([
      getActivePoolLabel(),
      getLastSyncedAt(),
      getConditionsSyncEnabled(),
    ]);
    setPoolLabel(label ?? "");
    setLastSyncedAt(synced);
    setConditionsSyncEnabledState(conditionsSync);
  };

  useEffect(() => {
    let unsubscribeItems: (() => void) | undefined;
    let unsubscribeRoom: (() => void) | undefined;
    OBR.onReady(() => {
      refresh();
      // Fires on every scene mutation — refreshTokensOnly is cheap/local,
      // so this is safe to run on each one rather than debouncing.
      unsubscribeItems = OBR.scene.items.onChange(() => {
        refreshTokensOnly();
      });
      unsubscribeRoom = OBR.room.onMetadataChange(() => {
        refreshRoomMetaOnly();
      });
    });
    return () => {
      unsubscribeItems?.();
      unsubscribeRoom?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ticks the last-synced display forward in real time, same as PlayerView
  // — purely local, no OBR/network call, just a re-render trigger.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const syncRows = useCallback(async (targetRows: TokenRow[]) => {
    setSyncing(true);
    let ok = 0;
    let failed = 0;
    const failures: { name: string; message: string }[] = [];

    for (const row of targetRows) {
      if (!row.link) continue;
      try {
        const hero = await client.getFullHero(row.link.heroId);
        const state = client.extractStateFields(hero);
        const derived = client.extractDerivedFields(hero);
        const dstFields = heroStateToDstFields(state, derived);
        // Only defined keys are ever included (see heroStateToDstFields) —
        // writeDstHeroStats merges onto existing token metadata, so a hero
        // that predates the Forge Steel putHero change simply leaves
        // stamina/recoveries/heroicResource untouched rather than zeroing
        // them out.
        await writeDstHeroStats(row.item.id, dstFields);
        ok++;
      } catch (err) {
        console.error(`Sync failed for token ${row.item.id}`, err);
        failed++;
        failures.push({ name: row.item.name, message: describeError(err) });
      }
    }

    setStatus(`Synced ${ok} token${ok === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`);
    if (failures.length > 0) {
      OBR.notification.show(summarizeFailures(failures), "ERROR").catch((err) =>
        console.error("Failed to show sync-failure notification", err)
      );
    }
    const now = new Date();
    setLastSyncedAt(now);
    if (ok > 0) {
      // Room-wide, so players can see it too — only written on a run that
      // actually changed something, not on a run that touched zero tokens
      // (e.g. everything failed, or nothing was linked).
      writeLastSyncedAt(now).catch((err) => console.error("Failed to write last-synced timestamp", err));
    }
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

  const toggleConditionsSync = async (enabled: boolean) => {
    setConditionsSyncEnabledState(enabled);
    await setConditionsSyncEnabled(enabled);
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

  const unlink = async (itemId: string) => {
    await clearBridgeLink(itemId);
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
                <>
                  <span className={`link-status ${row.link.source}`}>
                    {row.link.source === "auto" ? "auto-linked" : "linked"}
                  </span>
                  <button type="button" className="link-clear" onClick={() => unlink(row.item.id)}>
                    Unlink
                  </button>
                </>
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

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={conditionsSyncEnabled}
          onChange={(e) => toggleConditionsSync(e.target.checked)}
        />
        <span>Sync conditions to token</span>
      </label>

      <div className="actions">
        <button type="button" onClick={autoLinkAll} disabled={rows.length === 0}>
          Auto-link by name
        </button>
        <button type="button" onClick={syncNow} disabled={syncing || linkedCount === 0}>
          {syncing ? "Syncing…" : `Sync ${linkedCount} token${linkedCount === 1 ? "" : "s"} now`}
        </button>
      </div>

      <div className="last-synced">
        {lastSyncedAt ? `Last synced ${formatRelative(lastSyncedAt, now)}` : "Not synced yet"}
      </div>

      {status && <div className="status">{status}</div>}
    </div>
  );
}
