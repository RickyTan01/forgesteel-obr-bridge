# Forge Steel Warehouse Bridge

An [Owlbear Rodeo](https://www.owlbear.rodeo/) extension that syncs hero
data from [Forge Steel](https://github.com/RickyTan01/forgesteel) onto
[Draw Steel Tools](https://github.com/SeamusFinlayson/draw-steel-tools-2)
tokens, via the Forge Steel Warehouse. One-way sync only: Forge Steel →
Warehouse → OBR.

## Features

- Syncs stamina, temporary stamina, recoveries, surges, and heroic
  resource onto a Draw Steel Tools token
- Condition markers: small badges above each token showing its active
  conditions, plus a "View Conditions" flyout with each one's name and
  duration
- Auto-links tokens to heroes by matching names, with a manual picker for
  anything ambiguous
- Configurable auto-sync interval (off, 15s, 30s, 60s, 5 min), or sync on
  demand
- GM/player aware — only the GM configures Warehouse credentials and
  controls sync; players get a read-only view

## How it works

1. Forge Steel saves a hero to the Warehouse (a small REST API that
   stores hero JSON).
2. The bridge, running as an OBR extension, fetches hero data from the
   Warehouse using GM-supplied credentials.
3. It writes the relevant fields onto the matching Draw Steel Tools
   token's metadata, and (for conditions) draws small badge icons
   attached to the token.

There's no live push — the bridge polls on an interval, or syncs
manually.

## Derived values: computed by Forge Steel, not the bridge

Max stamina/recoveries and the current heroic resource value/name are
**not** derived bridge-side. Porting `HeroLogic`'s rules engine into the
bridge was ruled out — it needs the full class/ancestry/feature data layer
(5.2MB of source), would meaningfully bloat the popover's load time, need
its own daily upstream-sync pipeline duplicating the Forge Steel fork's
existing one, and couples the bridge to Forge Steel's internal module paths
(`@/models`, `@/logic`, `@/data`), which aren't a stable API. The same
reasoning is why condition rules text (e.g. Bleeding's full description)
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

## Setup

1. In Owlbear Rodeo, add the extension by URL (see Deployment below for
   the manifest URL).
2. As GM, open the extension popover and enter your Warehouse host and
   API token.
3. Use "Auto-link by name" to pair hero tokens, or link them manually.
4. Optionally enable "Sync conditions to token" and pick an auto-sync
   interval.

## Not built yet

- Write-back to the Warehouse (OBR → Forge Steel) — read-only for now, to
  avoid a race with Forge Steel's own saves
- No UI for resolving an ambiguous auto-link match (same name, multiple
  heroes)
- Condition markers show name + duration only, not full rules text

## Development

```
npm install
npm run dev            # local dev server
npm run build           # production build, root-relative
npm run build:pages     # GitHub Pages build, subpath-relative
```

Deployed two ways from the same source: a private Docker/Nginx deployment
(`build-and-push.yml` → GHCR) and a public GitHub Pages mirror
(`deploy-pages.yml`) — both trigger on push to `main`.
