# Forge Steel Warehouse Bridge

An Owlbear Rodeo extension that syncs hero stamina, heroic resource,
recoveries, surges, and conditions from Forge Steel (via the Warehouse)
onto Draw Steel Tools tokens. One-way (Warehouse → OBR) only — see "Not
built yet" below.

**Status: deployed and working.** Registered in OBR, auto-link by token
name, manual sync, a configurable auto-sync interval (Off/15s/30s/60s/5
min), and condition markers (badges + a "View Conditions" flyout) are all
functioning end-to-end, confirmed live.

## Confirmed facts this is built on

- **Draw Steel Tools token schema** (from reading
  `SeamusFinlayson/draw-steel-tools-2` source directly, both GPLv3):
  metadata key `com.draw-steel-stat-bubbles/metadata`, hero shape in
  `src/obr/drawSteelTokens.ts`. The same source is also where the
  condition-badge positioning math below came from
  (`src/background/overlays/mathHelpers.ts`).
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
  `state.conditions` (an array of `{id, type, text, ends}`, see
  `src/models/condition.ts`) flows unmodified from Forge Steel to the
  Warehouse to the bridge, no conversion needed.

## Derived values: computed by Forge Steel, not the bridge

Max stamina/recoveries and the current heroic resource value/name are
**not** derived bridge-side. Porting `HeroLogic`'s rules engine into the
bridge was ruled out — it needs the full class/ancestry/feature data layer
(5.2MB of source), would meaningfully bloat the popover's load time, need
its own daily upstream-sync pipeline duplicating the Forge Steel fork's
existing one, and couples the bridge to Forge Steel's internal module paths
(`@/models`, `@/logic`, `@/data`), which aren't a stable API. The same
reasoning is why condition *rules text* (e.g. Bleeding's full description)
isn't shown anywhere in the bridge either — only the condition's name and
duration, both of which travel as plain data.

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

## Condition markers

Small badge icons attached above each linked token showing its active
Forge Steel conditions, plus a "View Conditions" context-menu entry.
Entirely separate execution context from the stat-sync popover above —
see "Two execution contexts" below.

### Two execution contexts

The extension's manifest declares **two** independent entry points:

- `action` (`action.html` → `src/main.tsx`) — the popover, only runs while
  a user has it open. Everything above this section (stat sync, settings,
  player view) lives here.
- `background_url` (`background.html` → `src/background/main.ts`) — loaded
  once per client automatically, runs continuously regardless of whether
  anyone has the popover open. Condition markers live here, since badges
  need to stay in sync even when nobody's looking at the popup.

**Manifest gotcha:** the field is a flat top-level `"background_url": "/background.html"`
string, **not** a nested `"background": { "url": "..." }` object — the
latter fails OBR's schema validation at runtime
(`ValidationError: "background" is not allowed`), which only surfaces in
the browser console once the extension is actually added to a room, not
at build time. Confirmed against Draw Steel Tools' own live
`manifest.json`.

Only the **GM's** background context does anything (`OBR.player.getRole()`
check in `src/background/main.ts`) — Warehouse credentials only ever exist
in the GM's own browser (`warehouseConfig.ts` is `localStorage`-only), and
gating on role also avoids every connected player's background context
racing to draw the same badges. It polls every 15s, plus a 2s-debounced
pass on scene/room-metadata changes (token add/remove/link, or the
conditions-sync toggle flipping).

### Badge sizing and positioning

`src/background/conditionBadges.ts`'s `tokenWorldSize`/`tokenWorldCenter`
are a direct port of Draw Steel Tools' own
`src/background/overlays/mathHelpers.ts`
(`getImageDimensions`/`getImageCenter`), which DST uses for its own
health-bar/name-tag overlays. This wasn't the first thing tried — three
earlier approaches (sizing off `OBR.scene.items.getItemBounds()`, sizing
as a fraction of the *scene's* grid cell, and naively treating
`token.position` as the visual center) each produced a differently-broken
result before landing here. Two facts that don't hold the way they'd
naively seem to:

- A token's `.position` is **not** its visual center — it's whatever
  point `grid.offset` designates as the anchor. True center requires
  reading `image.width/height`, `grid.offset`, `grid.dpi`, `.scale`, and
  `.rotation` together (see `tokenWorldCenter`).
- Badge size has to be a fraction of the *token's own* computed world
  size, not a fraction of `OBR.scene.grid.getDpi()` — Draw Steel Tools'
  portrait/stat-bubble tokens don't necessarily span one full grid cell,
  so sizing against "a fraction of 1 cell" can dwarf a token that itself
  renders much smaller than that.

Badge visual size is driven entirely by `.scale()`, computed from the
token's own pixel dimensions, with the badge's `grid` field set to the
*same* `token.grid` object (not a custom/invented one) — reusing it makes
the scene's dpi cancel out of the size formula algebraically, so it's
correct regardless of what that value actually is. An earlier attempt
that instead solved for a custom per-badge `grid.dpi` rendered ~20x too
large despite checking out algebraically by hand.

**The actual root cause behind every one of those oversized-badge
attempts, found only after all of the above was already correct:**
`buildImage`'s declared `ImageContent.width`/`height` **must match the
real source file's actual pixel dimensions** (1024×1024 for the badge
icons here) — they are not a free-standing logical value for grid/dpi
math independent of the file. OBR logs this directly:
`content width 64 does not match image width 1024 rendering will be
wrong for image ...` — a warning easy to miss unless you're specifically
looking at the console after adding a debug log.

Badges are repacked into consecutive slots (left-to-right, matching the
hero's own condition order) whenever a token's badge set actually
changes — so removing a condition from the middle shifts the rest left
instead of leaving a gap. A token nothing changed for this pass is left
completely untouched (zero `updateItems` calls at steady state).

### Badge images

`src/background/conditionIcons/*.png` — user-supplied artwork, one per
Forge Steel condition type plus a generic fallback for Custom/Quick
conditions (mapped from a provided "Surprised" icon, since Forge Steel
has no "Surprised" condition). Three platform constraints shaped this,
each only discoverable by testing live in a room:

1. **Never a `data:` URI.** OBR's item-image loader routes image URLs
   through its own fetch/CDN pipeline (the same one that resizes/crops
   every real uploaded image) and can't resolve one — fails with
   "Unable to fetch image: Invalid URL". Must be a real, separately
   hosted file.
2. **Never SVG.** Even a correctly-fetched SVG fails with
   `DOMException: The image could not be decoded` — OBR uploads item
   images to a WebGL texture via `createImageBitmap()`, which is
   bitmap-only (a general web-platform limitation, not OBR- or
   browser-specific). SVG is fine for the manifest/context-menu icon (a
   different, non-WebGL code path) but never for `buildImage`. PNG only.
3. **Vite will silently break both of the above for you.** Its default
   `build.assetsInlineLimit` (4KB) inlines small imported assets as
   base64 `data:` URIs directly in the JS bundle — recreating problem
   #1 even when the source file on disk is a perfectly good PNG. Fixed
   with `assetsInlineLimit: 0` in `vite.config.ts`.

No image conversion tooling (ImageMagick, Inkscape, Pillow) was available
in the dev environment that first built the placeholder icons — a
hand-written PNG encoder in Node (built-in `zlib.deflateSync` covers the
compressed IDAT chunk) filled the gap until the real artwork arrived.

### Every URL handed to the SDK must be absolute

Any URL string given to the OBR SDK (`buildImage`'s `ImageContent.url`,
`contextMenu` icon paths) is resolved by OBR's own code running in the
top-level `www.owlbear.rodeo` page — **not** inside the extension's own
iframe. A root-relative path like `/action-icon.svg` resolves correctly
within the extension's own document but resolves against
`www.owlbear.rodeo` once it crosses that boundary. Confirmed live via the
actual failing network request: a badge image request went out as
`https://www.owlbear.rodeo/forgesteel-obr-bridge/assets/bleeding-*.png`
instead of `https://rickytan01.github.io/forgesteel-obr-bridge/assets/...`.

`src/toAbsoluteUrl.ts` (`new URL(path, window.location.origin).href`)
fixes this for badge icons. **Not needed everywhere, though** — reading
the SDK source directly
(`node_modules/@owlbear-rodeo/sdk/lib/common/normalize.js`) shows
`OBR.contextMenu.create()` already runs both its icon paths and
`embed.url` through this same normalization internally, at every SDK
version. `buildImage`'s `ImageContent` never gets that treatment, at any
version — that's the one that actually needs the manual fix.

### "View Conditions" — an embed, not a popup

The context-menu entry uses `ContextMenuItem.embed`, not `onClick` +
`OBR.notification.show()` or a manually-opened popover. This is the
actual platform feature behind Draw Steel Tools' own "Edit Hero" arrow
flyout (confirmed by reading
`src/background/contextMenuItems/menus/createHeroMenus.ts` directly, not
guessed at). An embed gets no per-click context — it's a static URL,
registered once — so the embedded page
(`condition-summary.html` → `src/conditionSummary/main.ts`) asks OBR
itself which item is selected via `OBR.player.getSelection()`, same
pattern DST uses for its own embed, and re-renders on
`OBR.player.onChange` so it stays live if the selection changes while the
flyout is open.

**Two earlier, discarded designs, in order:**

1. A toast (`OBR.notification.show()`) listing every condition on one
   line. Worked, but OBR's notification toast collapses `\n` to a space —
   multiple conditions read as ambiguous run-on text
   ("Bleeding: Until Removed Dazed: Save Ends"). The embed sidesteps this
   entirely since it's a real page with real layout.
2. Individual badges made selectable (`disableHit(false)`) with their own
   per-badge context menu opening a floating popover
   (`OBR.popover.open()`), so clicking a *specific* marker showed just
   that one condition. Reverted: OBR's selection UI (move/resize/rotate
   handles, plus the Copy/Attach/Transform Image/Align/Replace Image menu
   entries) can't be trimmed down for an extension-created item — even
   locked (`.locked(true)`, matching `kgbergman/conditionmarkers`'
   precedent, made no difference either, confirmed live). Not worth that
   UI cost for a per-marker detail view when the token-level summary
   already covers it. Badges are `disableHit(true)` again — purely
   visual.

### Conditions cache — the part that makes this work for players too

`src/obr/tokenConditions.ts` is a room-metadata cache
(`{tokenId: HeroCondition[]}`) written by the GM's background sync pass
in the same pass that draws the badges — same pattern as
`activePoolLabel`/`lastSyncedAt` (see the table below). "View Conditions"
reads this cache instead of doing its own live Warehouse fetch. The
original version *did* fetch live on click, using
`getWarehouseConfig()` — which is `localStorage`-only and only ever
populated in the GM's own browser, so a player clicking it always got
"Warehouse not configured," a GM-only concept that means nothing to a
player. Confirmed live on a player's screen before the fix. Reading the
shared cache instead works identically for GM and players, and also
removes a redundant Warehouse round-trip on every single click (the sync
pass was already fetching the same data on its own cadence).

### The GM toggle

"Sync conditions to token" in the popover's `SyncPanel.tsx`, backed by
`getConditionsSyncEnabled`/`setConditionsSyncEnabled` in
`syncPreferences.ts` — **room metadata, not `localStorage`**, unlike this
file's other setting (`sync-interval-seconds`, a genuine personal
per-browser preference). Whoever is GM, on whatever browser, should see
the same on/off state, and the badges it gates are scene items visible to
every player — same category as `activePoolLabel`/`lastSyncedAt`, not a
personal preference. Also happens to be exactly what the background
script needs anyway, since popover and background run in separate
iframes with no shared JS memory. Defaults to off.

### `OBR.scene.local` — considered, not adopted

`SeamusFinlayson/Bubbles-for-Owlbear-Rodeo` (same author as Draw Steel
Tools) runs its entire attachment-drawing logic in **every** connected
client independently (no GM-only gating) and draws to `OBR.scene.local`
— a genuinely separate, per-client-only item store, distinct from the
shared `OBR.scene.items` this bridge uses for badges (confirmed via the
SDK's own source: distinct `OBR_SCENE_LOCAL_*` message types). Worth
knowing about if the per-badge click-to-reveal idea above ever gets
revisited — local items might behave differently in OBR's selection UI,
which could be the missing piece — but untested, and a real architecture
shift (every client drawing its own copy vs. one shared write), not
something to adopt without a concrete reason.

## Where things live, and why

| Data | Storage | Reasoning |
|---|---|---|
| Warehouse host + API token | `localStorage`, per browser | Never shipped in the extension bundle; only the GM's browser ever needs it since sync is GM-triggered |
| Auto-sync interval | `localStorage`, per browser | Personal preference, not shared state |
| Active pool label ("Campaign B") | OBR room metadata | Not a credential — safe for every client in the room to see; GM sets it once, everyone's bridge instance picks it up |
| Token → hero link | Our own metadata key (`io.github.rickytan01.forgesteel-bridge/link`) on each token, alongside DST's own key | Shared scene state, same mechanism DST itself uses; auto-populated by name match, falls back to manual picker |
| Conditions-sync enabled | OBR room metadata | Room-wide switch gating scene items every player sees — not a personal preference, unlike the sync interval above |
| Condition badge → condition mapping | Our own metadata key (`.../condition-badge`) on each badge item | `{conditionId, slot}` — lets the diff pass recognize its own badges and repack slots without re-fetching anything |
| Cached per-token conditions | OBR room metadata (`tokenConditions.ts`) | Lets "View Conditions" work for players, who never have Warehouse credentials to fetch live with |

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
- **The manifest field for a persistent background context is
  `"background_url"`, a flat string — not `"background": { "url": ... }`.**
  See "Two execution contexts" above.
- **Every URL handed to the OBR SDK must be a fully-qualified absolute
  URL**, resolved against `window.location.origin` — OBR resolves it
  against its own top-level page, not the extension's iframe, otherwise.
  See "Every URL handed to the SDK must be absolute" above. Not needed
  for `contextMenu` icon/embed paths specifically — the SDK already
  normalizes those internally.
- **`buildImage`'s `ImageContent.url` can never be a `data:` URI, and
  never an SVG** — see "Badge images" above.
- **Vite inlines small imported assets as base64 `data:` URIs by
  default** (`assetsInlineLimit`, 4KB default) — silently recreates the
  `data:` URI problem above even for a perfectly good PNG on disk. Set
  `assetsInlineLimit: 0`.
- **`buildImage`'s declared `ImageContent.width`/`height` must match the
  real source file's actual pixel dimensions** — not a free-standing
  logical value. See "Badge sizing and positioning" above.
- **`OBR.notification.show()` collapses `"\n"` to a space** — a
  multi-condition message needs a different separator (or a real embed
  page instead, which is what this ended up using).
- **OBR's selection UI (resize/rotate handles, the built-in
  Copy/Transform/Align/Replace Image menu entries) can't be trimmed for
  an extension-created scene item**, even locked. Learned while trying
  (and reverting) per-badge click-to-reveal — see "View Conditions —
  an embed, not a popup" above.
- `manifest.json` has no content-hashed filename (unlike Vite's JS/CSS
  bundles), so edits can appear stale in OBR's "Add extension" preview
  even after the server is confirmed correct via `curl`. Nginx now sends
  `Cache-Control: no-cache`; a `?v=N` query-string is the manual
  workaround for caching layers we don't control (e.g. OBR's own).

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
4. **No condition rules text.** "View Conditions" shows name + duration
   only, not the full rules description (e.g. what Bleeding actually
   does) — that would require vendoring Forge Steel's condition data
   into the bridge, the same trade-off already declined for derived
   stamina/recovery values (see "Derived values" above).

## Deployment

Dockerfile (multi-stage: `node:20-alpine` build → `nginx:alpine` serve),
`nginx.conf`, and `.github/workflows/build-and-push.yml` (build on push to
`main`, push to `ghcr.io/rickytan01/forgesteel-obr-bridge`) are all in the
repo root / `.github/workflows/`. Deployed via Compose Manager Plus,
proxied through NPM with a real cert (OBR requires HTTPS on the manifest
URL), registered in OBR via **Add custom extension → by URL** pointing at
`<host>/manifest.json`.

Vite builds three entry points (`action.html`, `background.html`,
`condition-summary.html`) from the same `vite.config.ts` — see "Two
execution contexts" above for why there are multiple.

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
- Revisit per-badge click-to-reveal if `OBR.scene.local` turns out to
  behave differently in OBR's selection UI (see "`OBR.scene.local` —
  considered, not adopted" above) — untested, not currently planned.
