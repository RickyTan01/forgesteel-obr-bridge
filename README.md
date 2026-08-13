# Forge Steel Warehouse Bridge

An Owlbear Rodeo extension that syncs hero stamina, heroic resource,
recoveries and surges from Forge Steel (via the Warehouse) onto Draw Steel
Tools tokens. One-way (Warehouse → OBR) only — see "Not built yet" below.

**Status: deployed and working.** Registered in OBR, auto-link by token
name, manual sync, and a configurable auto-sync interval (Off/15s/30s/60s/5
min) are all functioning end-to-end.

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
  note below). No schema validation — round-trips arbitrary extra fields
  untouched, which is what makes the derived-fields approach below work.
  Per-user data isolation is real: `FsHeroes.user_id` is a unique FK, every
  query filters by `user=current_user` — a fresh dev API token
  (`docker exec -it <container> python /app/utils/add_user.py`, or call
  `create_user(app, name)` directly for a custom name) is fully isolated
  from any other user's heroes on the same running instance. No separate dev
  container needed for testing.
- **Forge Steel's HeroState** (from `RickyTan01/forgesteel` source): stores
  `staminaDamage` / `recoveriesUsed`, not current-value/remaining — the
  inverse of what Draw Steel Tools stores. See `src/logic/conversion.ts`.

## Derived values: computed by Forge Steel, not the bridge

Max stamina/recoveries and the current heroic resource value/name are
**not** derived bridge-side. Porting `HeroLogic`'s rules engine into the
bridge was ruled out — it needs the full class/ancestry/feature data layer
(5.2MB of source), would meaningfully bloat the popover's load time, need
its own daily upstream-sync pipeline duplicating the Forge Steel fork's
existing one, and couples the bridge to Forge Steel's internal module paths
(`@/models`, `@/logic`, `@/data`), which aren't a stable API.

Instead, `RickyTan01/forgesteel`'s `warehouse-service.ts` computes these
itself with its own `HeroLogic` and includes `staminaMax`, `recoveriesMax`,
`heroicResourceValue`, `heroicResourceName` as extra top-level fields on the
hero object when it PUTs to the Warehouse. The bridge just reads them via
`WarehouseClient.extractDerivedFields` — see `HeroDerivedFields` in
`src/warehouse/warehouseClient.ts`. Heroes saved before that Forge Steel
change won't have these fields; `heroStateToDstFields` only includes a DST
field when its corresponding derived value is actually present, so an
un-migrated hero's existing token values are left untouched rather than
zeroed out.

## Where things live, and why

| Data | Storage | Reasoning |
|---|---|---|
| Warehouse host + API token | `localStorage`, per browser | Never shipped in the extension bundle; only the GM's browser ever needs it since sync is GM-triggered |
| Auto-sync interval | `localStorage`, per browser | Personal preference, not shared state |
| Active pool label ("Campaign B") | OBR room metadata | Not a credential — safe for every client in the room to see; GM sets it once, everyone's bridge instance picks it up |
| Token → hero link | Our own metadata key (`io.github.rickytan01.forgesteel-bridge/link`) on each token, alongside DST's own key | Shared scene state, same mechanism DST itself uses; auto-populated by name match, falls back to manual picker |

## Known gotchas (things that cost real debugging time)

- **OBR fetches icon files cross-origin via JS, not a plain `<img>`** —
  almost certainly to inline the SVG so it can recolor/theme it. Without
  `Access-Control-Allow-Origin` on `.svg` responses, the fetch is silently
  blocked and the toolbar icon renders blank, even though a bare
  browser/curl request to the same URL returns `200` fine. See `nginx.conf`.
  Confirmed via the browser console's CORS error — a plain `curl` or "does
  the file load in a new tab" check will NOT catch this.
- **JWT expiry mid-session.** The Warehouse's access token expires; a
  long-running auto-sync interval will eventually hit `401`s. The client's
  response interceptor catches this, re-authenticates once, and retries —
  see `warehouseClient.ts`. Without it, sync silently dies after the token's
  lifetime elapses.
- **GHCR "unknown blob" on push** is a transient registry issue, not a build
  problem — re-running the Actions job (not just the failed step) resolves
  it the large majority of the time.

## Not built yet — real gaps, not polish items

1. **One-way only.** `dstFieldsToHeroStatePatch` exists in `conversion.ts`
   but nothing calls it — there's no write-back to the Warehouse yet. Adding
   it means confronting the GET-modify-PUT race already found and fixed once
   in Forge Steel's own `persistHero` — the Warehouse PUT has no versioning,
   so a naive write-back can clobber a concurrent edit from the Forge Steel
   side. A read that's wrong is a harmless display bug; a write that's wrong
   risks real data corruption — deliberately not attempted yet.
2. **Ambiguous auto-link has no UI treatment.** `findAutoMatch` returns
   `"ambiguous"` but `SyncPanel` just falls through to the manual picker
   without telling the user *why* (multiple heroes shared that name).
3. **Heroic resource write-back isn't just unbuilt, it's undesigned.**
   Forge Steel has no writable "current value" field for heroic resource
   outside the feature tree — mirroring `heroStateToDstFields` in reverse
   wouldn't work for this one field even if write-back were built.

## Deployment

Dockerfile (multi-stage: `node:20-alpine` build → `nginx:alpine` serve),
`nginx.conf`, and `.github/workflows/build-and-push.yml` (build on push to
`main`, push to `ghcr.io/rickytan01/forgesteel-obr-bridge`) are all in the
repo root / `.github/workflows/`. Deployed via Compose Manager Plus,
proxied through NPM with a real cert (OBR requires HTTPS on the manifest
URL), registered in OBR via **Add custom extension → by URL** pointing at
`<host>/manifest.json`.

Update flow: push → Actions builds & pushes to GHCR → on the server,
`docker compose pull && docker compose up -d` in the stack's compose
folder. No re-adding the extension in OBR needed — it's registered by URL
and fetches fresh content each time the popover opens; a hard refresh of
the OBR tab clears any lingering browser cache if something looks stale
after a deploy.

## Next steps

- Decide: is session-start/manual sync sufficient, or is live write-back
  worth the race-condition handling in "Not built yet" #1?
- UI treatment for ambiguous auto-link matches (#2 above)
