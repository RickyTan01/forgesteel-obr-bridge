import OBR from "@owlbear-rodeo/sdk";
import { getWarehouseConfig } from "../warehouse/warehouseConfig";
import { WarehouseClient } from "../warehouse/warehouseClient";
import { getConditionsSyncEnabled } from "../warehouse/syncPreferences";
import { getHeroTokens } from "../obr/drawSteelTokens";
import { readBridgeLink } from "../obr/bridgeLink";
import { syncConditionBadges, clearAllConditionBadges, PairedToken } from "./conditionBadges";
import { registerConditionContextMenu } from "./conditionContextMenu";
import { setTokenConditions } from "../obr/tokenConditions";
import { describeError } from "./describeError";

// Fixed cadence for picking up condition changes saved in Forge Steel —
// independent of the popover's own configurable stat-sync interval
// (syncPreferences.ts), since this runs continuously regardless of whether
// anyone has the popover open.
const POLL_INTERVAL_MS = 15_000;

// onChange fires continuously while a token is dragged/resized — token
// movement itself needs no code on our end (attached badges follow the
// parent automatically via OBR's default POSITION attachment behavior), so
// this only needs to catch link/unlink and add/remove. Debounced to avoid
// a full Warehouse re-fetch of every paired hero on every drag frame.
const CHANGE_DEBOUNCE_MS = 2_000;

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

let running = false;

async function clearAll(): Promise<void> {
  await Promise.all([clearAllConditionBadges(), setTokenConditions({})]);
}

async function runSyncPass(): Promise<void> {
  if (running) return; // last pass still in flight (slow Warehouse response) — skip rather than pile up
  running = true;
  try {
    // Badges are scene items visible to every player, but Warehouse
    // credentials only ever exist in the GM's own browser (warehouseConfig.ts
    // is localStorage-only, GM-entered) — so only the GM's background
    // context can do anything here. Gating on role also avoids every
    // connected player's background context racing to draw the same badges.
    const role = await OBR.player.getRole();
    if (role !== "GM") return;

    const enabled = await getConditionsSyncEnabled();
    if (!enabled) {
      await clearAll();
      return;
    }

    const config = getWarehouseConfig();
    if (!config) return;

    const client = new WarehouseClient(config);
    const tokens = await getHeroTokens();
    const linked = tokens
      .map((item) => ({ item, link: readBridgeLink(item) }))
      .filter((row): row is { item: typeof row.item; link: NonNullable<typeof row.link> } => !!row.link);

    if (linked.length === 0) {
      await clearAll();
      return;
    }

    const pairedTokens = await Promise.all(
      linked.map(async ({ item, link }): Promise<PairedToken | null> => {
        try {
          const hero = await client.getFullHero(link.heroId);
          return { token: item, conditions: client.extractConditions(hero) };
        } catch (err) {
          console.error(`Condition sync failed for token ${item.id}:`, describeError(err));
          return null;
        }
      })
    );

    const resolved = pairedTokens.filter((p): p is PairedToken => p !== null);

    // Room-metadata cache read by the "View Conditions" menu, so it works
    // for players too (see tokenConditions.ts) instead of doing its own
    // per-click Warehouse fetch, which only ever works in the GM's browser.
    const conditionsByTokenId = Object.fromEntries(resolved.map((p) => [p.token.id, p.conditions]));

    await Promise.all([syncConditionBadges(resolved), setTokenConditions(conditionsByTokenId)]);
  } catch (err) {
    console.error("Condition badge sync pass failed:", describeError(err));
  } finally {
    running = false;
  }
}

OBR.onReady(() => {
  console.log("[FS Bridge] background context ready");
  registerConditionContextMenu();

  runSyncPass();
  setInterval(runSyncPass, POLL_INTERVAL_MS);

  const debouncedSync = debounce(runSyncPass, CHANGE_DEBOUNCE_MS);
  OBR.scene.items.onChange(() => debouncedSync());
  OBR.room.onMetadataChange(() => debouncedSync()); // catches the conditions-sync toggle flipping
});
