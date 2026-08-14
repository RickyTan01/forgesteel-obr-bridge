import OBR, { Image, Item, buildImage, isImage } from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";
import { toAbsoluteUrl } from "../toAbsoluteUrl";
import type { HeroCondition } from "../warehouse/warehouseClient";
import { conditionDisplayName } from "../logic/conditionDisplay";

// PNG, not SVG: OBR's item-image loader (unlike its context-menu/action
// icon loader) uploads scene images to a WebGL texture via
// createImageBitmap(), which does not support vector formats at all —
// confirmed live ("DOMException: The image could not be decoded" for every
// badge). Vite's default *.svg/*.png import both resolve to a URL string
// (see vite/client.d.ts); the file being emitted as a real, separately
// hosted asset rather than inlined as a base64 data: URI is controlled by
// build.assetsInlineLimit in vite.config.ts, not by anything at the import
// site.
import bleedingIcon from "./conditionIcons/bleeding.png";
import dazedIcon from "./conditionIcons/dazed.png";
import frightenedIcon from "./conditionIcons/frightened.png";
import grabbedIcon from "./conditionIcons/grabbed.png";
import proneIcon from "./conditionIcons/prone.png";
import restrainedIcon from "./conditionIcons/restrained.png";
import slowedIcon from "./conditionIcons/slowed.png";
import tauntedIcon from "./conditionIcons/taunted.png";
import weakenedIcon from "./conditionIcons/weakened.png";
import genericIcon from "./conditionIcons/generic.png";

const BADGE_METADATA_KEY = getPluginId("condition-badge");

type BadgeMetadata = { conditionId: string; slot: number };

function readBadgeMetadata(item: Item): BadgeMetadata | undefined {
  return item.metadata[BADGE_METADATA_KEY] as BadgeMetadata | undefined;
}

export type PairedToken = {
  token: Item;
  conditions: HeroCondition[];
};

// Badge size, as a fraction of a grid cell (via the scene's own grid dpi —
// world units per cell, a scene-level value unrelated to any one item).
// Position is anchored to the token's own position/image/grid/scale (see
// tokenWorldSize below) — properties of the token itself, unaffected by
// whatever is attached to it. Deliberately NOT using
// OBR.scene.items.getItemBounds(): that was tried first (matching the
// pattern used by kgbergman/conditionmarkers' buildConditionMarker, which
// sizes/positions off getItemBounds combined with .scale(token.scale) and
// reusing token.grid) but produced badges far too small and far from the
// token — getItemBounds appears to include the token's own attachments in
// its returned box, so each pass's bounds were inflated by whatever badges
// a PREVIOUS pass had already placed, compounding across passes.
const BADGE_SIZE_GRID_FRACTION = 0.45;
const BADGE_SPACING_GRID_FRACTION = BADGE_SIZE_GRID_FRACTION * 1.15;

// Static files, not inline data URIs or generated-at-runtime SVG — OBR's
// item-image loader routes image URLs through its own fetch/CDN pipeline
// (same as every real image on the scene, visible as the images.owlbear.rodeo
// resize/crop requests in the network tab) and decodes them via
// createImageBitmap() for texture upload, neither of which a data: URI or an
// SVG source can go through (see the import comment above and project
// memory). Every real OBR extension inspected for reference
// (kgbergman/conditionmarkers' markers) uses PNG for scene-item images for
// the same reason. Provided art (user-supplied, 1024x1024 with an existing
// alpha channel — no background removal needed); "generic" is the provided
// "Surprised" icon repurposed as the Custom/Quick fallback, since Forge
// Steel has no "Surprised" condition. The declared width/height in
// buildBadgeItem is a logical size for grid/dpi math, not the source
// file's real resolution (confirmed against kgbergman/conditionmarkers,
// which does the same) — the browser downscales the real 1024x1024 image
// to fit, so no resizing was needed either.
const ICON_BY_CONDITION_TYPE: Record<string, string> = {
  Bleeding: bleedingIcon,
  Dazed: dazedIcon,
  Frightened: frightenedIcon,
  Grabbed: grabbedIcon,
  Prone: proneIcon,
  Restrained: restrainedIcon,
  Slowed: slowedIcon,
  Taunted: tauntedIcon,
  Weakened: weakenedIcon,
};

function iconFor(condition: HeroCondition): string {
  const path = ICON_BY_CONDITION_TYPE[condition.type] ?? genericIcon;
  return toAbsoluteUrl(path);
}

/**
 * The token's own rendered world-space width/height. cellWidth/cellHeight
 * is the token's own image expressed in grid cells (its own pixel
 * dimensions ÷ its own grid.dpi — a property of the token, independent of
 * everything else on the scene); multiplying by scale and the scene's grid
 * dpi (world units per cell) converts that into world units.
 */
function tokenWorldSize(token: Image, sceneDpi: number): { width: number; height: number } {
  const cellWidth = token.image.width / token.grid.dpi;
  const cellHeight = token.image.height / token.grid.dpi;
  return {
    width: cellWidth * token.scale.x * sceneDpi,
    height: cellHeight * token.scale.y * sceneDpi,
  };
}

/**
 * Left-to-right starting above the token's top-left corner, one slot per
 * badge, sitting entirely above the token — badge's bottom edge is flush
 * with the token's top edge rather than overlapping it. Assumes
 * token.position is the image's visual center, matching the default anchor
 * OBR uses for tokens uploaded through its own pipeline.
 */
function badgePosition(token: Image, sceneDpi: number, badgeSize: number, spacing: number, slot: number) {
  const size = tokenWorldSize(token, sceneDpi);
  const startX = token.position.x - size.width / 2 + badgeSize / 2;
  const y = token.position.y - size.height / 2 - badgeSize / 2;
  return { x: startX + slot * spacing, y };
}

function buildBadgeItem(token: Image, condition: HeroCondition, slot: number, sceneDpi: number): Item {
  const badgeSize = sceneDpi * BADGE_SIZE_GRID_FRACTION;
  const spacing = sceneDpi * BADGE_SPACING_GRID_FRACTION;
  const badgeDpi = 64 / BADGE_SIZE_GRID_FRACTION; // icons are 64x64 source pixels (see gen-badge-pngs.mjs)

  const metadata: BadgeMetadata = { conditionId: condition.id, slot };
  return buildImage(
    { width: 64, height: 64, mime: "image/png", url: iconFor(condition) },
    { dpi: badgeDpi, offset: { x: 32, y: 32 } }
  )
    .position(badgePosition(token, sceneDpi, badgeSize, spacing, slot))
    .attachedTo(token.id)
    .layer("ATTACHMENT")
    .disableHit(true)
    .name(`Condition: ${conditionDisplayName(condition)}`)
    .metadata({ [BADGE_METADATA_KEY]: metadata })
    .build();
}

function nextFreeSlot(usedSlots: Set<number>): number {
  let slot = 0;
  while (usedSlots.has(slot)) slot++;
  usedSlots.add(slot);
  return slot;
}

/**
 * Reconciles condition badges against the given paired tokens: removes
 * badges for conditions that ended or tokens that are no longer paired
 * (badges on tokens deleted outright are cleaned up by OBR itself, via the
 * default DELETE attachment behavior), and adds badges for new conditions.
 * Untouched badges are left exactly as they are — no repositioning pass —
 * to avoid needless updateItems calls fighting other extensions or causing
 * flicker on every poll.
 */
export async function syncConditionBadges(pairedTokens: PairedToken[]): Promise<void> {
  const [allBadges, sceneDpi] = await Promise.all([
    OBR.scene.items.getItems<Item>((item) => readBadgeMetadata(item) !== undefined),
    OBR.scene.grid.getDpi(),
  ]);

  const badgesByToken = new Map<string, Item[]>();
  for (const badge of allBadges) {
    if (!badge.attachedTo) continue;
    const list = badgesByToken.get(badge.attachedTo) ?? [];
    list.push(badge);
    badgesByToken.set(badge.attachedTo, list);
  }

  const pairedTokenIds = new Set(pairedTokens.map((p) => p.token.id));
  const toDelete: string[] = [];
  const toAdd: Item[] = [];

  // Badges on tokens that still exist but are no longer in the paired set
  // (unlinked, or hero fetch failed this pass).
  for (const [tokenId, badges] of badgesByToken) {
    if (!pairedTokenIds.has(tokenId)) {
      toDelete.push(...badges.map((b) => b.id));
    }
  }

  for (const { token, conditions } of pairedTokens) {
    if (!isImage(token)) continue; // getHeroTokens() only returns images, but keep the type honest

    const existing = badgesByToken.get(token.id) ?? [];
    const existingByConditionId = new Map(
      existing.map((b) => [readBadgeMetadata(b)!.conditionId, b])
    );
    const currentConditionIds = new Set(conditions.map((c) => c.id));

    const usedSlots = new Set<number>();
    for (const [conditionId, badge] of existingByConditionId) {
      if (currentConditionIds.has(conditionId)) {
        usedSlots.add(readBadgeMetadata(badge)!.slot);
      } else {
        toDelete.push(badge.id);
      }
    }

    for (const condition of conditions) {
      if (existingByConditionId.has(condition.id)) continue;
      const slot = nextFreeSlot(usedSlots);
      toAdd.push(buildBadgeItem(token, condition, slot, sceneDpi));
    }
  }

  if (toDelete.length > 0) await OBR.scene.items.deleteItems(toDelete);
  if (toAdd.length > 0) await OBR.scene.items.addItems(toAdd);
}

export async function clearAllConditionBadges(): Promise<void> {
  const badges = await OBR.scene.items.getItems<Item>((item) => readBadgeMetadata(item) !== undefined);
  if (badges.length > 0) await OBR.scene.items.deleteItems(badges.map((b) => b.id));
}
