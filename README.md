# Forge Steel ↔ Draw Steel Tools Bridge

A small Owlbear Rodeo extension that pulls hero stats (stamina, heroic
resource, recoveries, surges) from Forge Steel's Warehouse and stamps them
onto Draw Steel Tools tokens at session start. One-way (Warehouse → OBR)
only, for now — see "Not built yet" below.

## Confirmed facts this is built on

- **Draw Steel Tools token schema** (from reading
  `SeamusFinlayson/draw-steel-tools-2` source directly, both GPLv3):
  metadata key `com.draw-steel-stat-bubbles/metadata`, hero shape in
  `src/obr/drawSteelTokens.ts`.
- **Warehouse API** (from `Veritas1000/forgesteel-warehouse` source): auth is
  `POST /connect` with `Authorization: Bearer <apiToken>` → returns
  `{access_token, refresh_token}`; every other call sends
  `Authorization: Bearer <access_token>`. Hero routes:
  `GET /data/forgesteel-heroes?fields=name`, `GET /data/forgesteel-heroes/<id>`,
  `PUT /data/forgesteel-heroes/<id>` (full-object replace, see race-condition
  note below).
- **Forge Steel's HeroState** (from `RickyTan01/forgesteel` source): stores
  `staminaDamage` / `recoveriesUsed`, not current-value/remaining — the
  inverse of what Draw Steel Tools stores. See `src/logic/conversion.ts`.

## Where things live, and why

| Data | Storage | Reasoning |
|---|---|---|
| Warehouse host + API token | `localStorage`, per browser | Never shipped in the extension bundle; matches Forge Steel's own settings-form pattern; only the GM's browser ever needs it since sync is GM-triggered |
| Active pool label ("Campaign A") | OBR room metadata | Not a credential — safe for every client in the room to see; GM sets it once, everyone's bridge instance picks it up |
| Token → hero link | Our own metadata key (`uk.tanserver.forgesteel-bridge/link`) on each token, alongside DST's own key | Shared scene state, same mechanism DST itself uses; auto-populated by name match, falls back to manual picker |

## Not built yet — real gaps, not polish items

1. **`heroDerived.ts` is a partial port.** Forge Steel doesn't store max
   stamina/max recoveries — they're computed from kit + echelon + bonus
   features. The current port only handles kit × echelon; it does **not**
   walk `FeatureType.Bonus` features that modify Stamina/Recoveries. Any hero
   with such a feature gets a wrong number until this is finished. Re-check
   against `andyaiken/forgesteel`'s `hero-logic.ts` on every use — this is the
   single most likely thing to silently drift out of correctness.
2. **One-way only.** `dstFieldsToHeroStatePatch` exists in `conversion.ts`
   but nothing calls it — there's no write-back to the Warehouse yet. Adding
   it means confronting the GET-modify-PUT race we already found and fixed
   once in Forge Steel's own `persistHero` (see prior TanServer chat history)
   — the Warehouse PUT has no versioning, so a naive write-back can clobber a
   concurrent edit from the Forge Steel side.
3. **No auth/token expiry handling.** Forge Steel's own client refreshes the
   JWT on a 401; this client re-authenticates blindly on first use per
   `WarehouseClient` instance and doesn't retry on expiry mid-session.
4. **Ambiguous auto-link has no UI treatment yet** — `findAutoMatch` returns
   `"ambiguous"` but `SyncPanel` currently just falls through to the manual
   picker without telling the user *why* (multiple heroes shared that name).

## Next steps

- Finish the bonus-feature walk in `heroDerived.ts`
- Decide: is session-start-only sufficient, or is live sync worth the
  race-condition handling in point 2 above?
- Build/deploy pipeline: same pattern as the Forge Steel fork — GitHub
  Actions → GHCR → Compose Manager Plus on Unraid, proxied via NPM at
  something like `fs-bridge.tanserver.uk`, added to Owlbear Rodeo as a
  custom extension pointing at `<host>/manifest.json`
